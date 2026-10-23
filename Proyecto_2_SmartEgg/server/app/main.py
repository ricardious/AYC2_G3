from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import api_router
from .config import Settings, get_settings
from .database import Base, build_session_factory, create_engine
from .services.bootstrap import ensure_initial_incubators, ensure_initial_technicians
from .services.broadcast import AccessConnectionManager, ConnectionManager
from .services.gateway_link import GatewayLink
from .services.mqtt import MqttPublisher, build_mqtt_snapshot
from .services.serial_access import (
    build_serial_access_denial,
    process_serial_access_event,
)
from .services.serial_bridge import SerialBridge
from .services.telemetry import ingest_telemetry

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    configured = settings or get_settings()
    engine = create_engine(configured.database_url)
    session_factory = build_session_factory(engine)
    broadcast = ConnectionManager()
    access_broadcast = AccessConnectionManager()
    main_loop: asyncio.AbstractEventLoop | None = None

    def serial_payload_handler(payload) -> None:  # type: ignore[no-untyped-def]
        with session_factory() as db:
            try:
                reading = ingest_telemetry(db, payload)
                mqtt_publisher.publish_snapshot(
                    build_mqtt_snapshot(db, reading, payload.incubator_code)
                )
            except Exception:
                logger.exception("Rejected serial telemetry")
                return
        if main_loop is not None:
            asyncio.run_coroutine_threadsafe(
                broadcast.broadcast(
                    reading.incubator_id,
                    {
                        "type": "telemetry",
                        "data": {
                            "id": reading.id,
                            "incubator_id": reading.incubator_id,
                            "temperature_c": reading.temperature_c,
                            "humidity_pct": reading.humidity_pct,
                            "door_open": reading.door_open,
                            "occupied_slots": reading.occupied_slots,
                            "available_slots": reading.available_slots,
                            "source": reading.source,
                            "recorded_at": reading.recorded_at.isoformat(),
                        },
                    },
                ),
                main_loop,
            )

    def serial_access_handler(event) -> None:  # type: ignore[no-untyped-def]
        started_at = perf_counter()
        with session_factory() as db:
            try:
                outcome = process_serial_access_event(db, event, configured)
            except Exception:
                logger.exception("Rejected serial access event")
                if event.kind == "rfid":
                    failure = build_serial_access_denial(
                        event, "backend_unavailable", configured
                    )
                    try:
                        serial_bridge.send_command(failure.command or {})
                    except RuntimeError:
                        logger.exception("Could not send serial failure response")
                return
        logger.info(
            "Processed serial access event kind=%s result=%s in %.0f ms",
            event.kind,
            outcome.mqtt_payload.get("event", "unknown"),
            (perf_counter() - started_at) * 1000,
        )
        if outcome.command is not None:
            try:
                serial_bridge.send_command(outcome.command)
            except RuntimeError:
                logger.exception("Could not send serial access response")
                return
        mqtt_publisher.publish_access_event(
            outcome.incubator_code, outcome.mqtt_payload
        )
        if main_loop is None:
            return
        if outcome.incubator_id is not None and outcome.dashboard_payload is not None:
            asyncio.run_coroutine_threadsafe(
                broadcast.broadcast(outcome.incubator_id, outcome.dashboard_payload),
                main_loop,
            )
        if outcome.kiosk_payload is not None:
            asyncio.run_coroutine_threadsafe(
                access_broadcast.broadcast(
                    outcome.incubator_code, outcome.kiosk_payload
                ),
                main_loop,
            )

    mqtt_publisher = MqttPublisher(configured)
    serial_bridge: SerialBridge
    if configured.node_transport == "gateway":
        serial_bridge = GatewayLink(
            configured,
            on_payload=serial_payload_handler,
            on_live_payload=mqtt_publisher.publish_live_telemetry,
            on_access_event=serial_access_handler,
        )
    else:
        serial_bridge = SerialBridge(
            enabled=configured.serial_enabled,
            port=configured.serial_port,
            baudrate=configured.serial_baudrate,
            timeout=configured.serial_timeout_seconds,
            reconnect_seconds=configured.serial_reconnect_seconds,
            default_incubator_code=configured.default_incubator_code,
            on_payload=serial_payload_handler,
            on_live_payload=mqtt_publisher.publish_live_telemetry,
            on_access_event=serial_access_handler,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal main_loop
        if configured.auto_create_schema:
            Base.metadata.create_all(engine)
        ensure_initial_technicians(session_factory, configured.initial_technicians)
        ensure_initial_incubators(session_factory, configured.initial_incubators)
        main_loop = asyncio.get_running_loop()
        mqtt_publisher.start()
        serial_bridge.start()
        yield
        serial_bridge.stop()
        mqtt_publisher.stop()
        engine.dispose()

    app = FastAPI(
        title=configured.app_name,
        version="1.0.0",
        description=(
            "REST API and real-time UART bridge for the SmartEgg intelligent incubator."
        ),
        lifespan=lifespan,
    )
    app.state.settings = configured
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.broadcast = broadcast
    app.state.access_broadcast = access_broadcast
    app.state.mqtt = mqtt_publisher
    app.state.serial_bridge = serial_bridge
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    app.include_router(api_router, prefix=configured.api_prefix)

    @app.get("/", tags=["system"])
    def root() -> dict[str, str]:
        return {"name": configured.app_name, "docs": "/docs", "health": "/health"}

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
