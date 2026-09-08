from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import api_router
from .config import Settings, get_settings
from .database import Base, build_session_factory, create_engine
from .services.bootstrap import ensure_initial_incubators, ensure_initial_technicians
from .services.broadcast import AccessConnectionManager, ConnectionManager
from .services.mqtt import MqttPublisher, build_mqtt_snapshot
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

    mqtt_publisher = MqttPublisher(configured)
    serial_bridge = SerialBridge(
        enabled=configured.serial_enabled,
        port=configured.serial_port,
        baudrate=configured.serial_baudrate,
        timeout=configured.serial_timeout_seconds,
        reconnect_seconds=configured.serial_reconnect_seconds,
        default_incubator_code=configured.default_incubator_code,
        on_payload=serial_payload_handler,
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
