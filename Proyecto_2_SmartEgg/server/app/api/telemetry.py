from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incubator, Technician, TelemetryReading
from ..schemas import SerialStatus, TelemetryCreate, TelemetryRead, TelemetryStats
from ..security import (
    decode_token,
    ensure_incubator_access,
    get_current_technician,
    require_admin,
    resolve_token_technician,
)
from ..services.mqtt import build_mqtt_snapshot
from ..services.telemetry import ingest_telemetry

router = APIRouter(tags=["telemetry"])


@router.get(
    "/serial/status",
    response_model=SerialStatus,
    dependencies=[Depends(require_admin)],
)
def serial_status(request: Request) -> SerialStatus:
    bridge = request.app.state.serial_bridge
    return SerialStatus(
        enabled=bridge.enabled,
        connected=bridge.connected,
        port=bridge.port,
        baudrate=bridge.baudrate,
        last_error=bridge.last_error,
        last_message_at=bridge.last_message_at,
    )


@router.post(
    "/telemetry",
    response_model=TelemetryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_technician)],
)
async def create_reading(
    payload: TelemetryCreate, request: Request, db: Session = Depends(get_db)
) -> TelemetryReading:
    reading = ingest_telemetry(db, payload, request.app.state.settings.timezone)
    request.app.state.mqtt.publish_snapshot(
        build_mqtt_snapshot(db, reading, payload.incubator_code)
    )
    await request.app.state.broadcast.broadcast(
        reading.incubator_id,
        {
            "type": "telemetry",
            "data": TelemetryRead.model_validate(reading).model_dump(mode="json"),
        },
    )
    return reading


@router.get(
    "/incubators/{incubator_id}/telemetry/latest",
    response_model=TelemetryRead,
    dependencies=[Depends(get_current_technician)],
)
def latest_reading(
    incubator_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> TelemetryReading:
    ensure_incubator_access(db, technician, incubator_id)
    reading = db.scalar(
        select(TelemetryReading)
        .where(TelemetryReading.incubator_id == incubator_id)
        .order_by(TelemetryReading.recorded_at.desc())
    )
    if reading is None:
        raise HTTPException(status_code=404, detail="No telemetry available")
    return reading


@router.get(
    "/incubators/{incubator_id}/telemetry",
    response_model=list[TelemetryRead],
    dependencies=[Depends(get_current_technician)],
)
def telemetry_history(
    incubator_id: int,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> list[TelemetryReading]:
    if db.get(Incubator, incubator_id) is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    ensure_incubator_access(db, technician, incubator_id)
    query = select(TelemetryReading).where(
        TelemetryReading.incubator_id == incubator_id
    )
    if from_at:
        query = query.where(TelemetryReading.recorded_at >= from_at)
    if to_at:
        query = query.where(TelemetryReading.recorded_at <= to_at)
    return list(
        db.scalars(query.order_by(TelemetryReading.recorded_at.desc()).limit(limit))
    )


@router.get(
    "/incubators/{incubator_id}/telemetry/stats",
    response_model=TelemetryStats,
    dependencies=[Depends(get_current_technician)],
)
def telemetry_stats(
    incubator_id: int,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> TelemetryStats:
    if db.get(Incubator, incubator_id) is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    ensure_incubator_access(db, technician, incubator_id)
    end = to_at or datetime.now(UTC)
    start = from_at or end - timedelta(hours=24)
    if start >= end:
        raise HTTPException(status_code=422, detail="from_at must be before to_at")
    row = db.execute(
        select(
            func.count(TelemetryReading.id),
            func.min(TelemetryReading.temperature_c),
            func.max(TelemetryReading.temperature_c),
            func.avg(TelemetryReading.temperature_c),
            func.min(TelemetryReading.humidity_pct),
            func.max(TelemetryReading.humidity_pct),
            func.avg(TelemetryReading.humidity_pct),
        ).where(
            TelemetryReading.incubator_id == incubator_id,
            TelemetryReading.recorded_at >= start,
            TelemetryReading.recorded_at <= end,
        )
    ).one()
    return TelemetryStats(
        from_at=start,
        to_at=end,
        samples=row[0],
        temperature_min_c=row[1],
        temperature_max_c=row[2],
        temperature_avg_c=row[3],
        humidity_min_pct=row[4],
        humidity_max_pct=row[5],
        humidity_avg_pct=row[6],
    )


@router.websocket("/ws/incubators/{incubator_id}")
async def live_telemetry(
    websocket: WebSocket, incubator_id: int, token: str = Query()
) -> None:
    try:
        payload = decode_token(websocket, token)
    except HTTPException:
        await websocket.close(code=4401, reason="Invalid or expired token")
        return
    with websocket.app.state.session_factory() as db:
        try:
            technician = resolve_token_technician(db, payload)
        except HTTPException:
            await websocket.close(code=4401, reason="Inactive access session")
            return
        incubator = db.get(Incubator, incubator_id)
        if incubator is None:
            await websocket.close(code=4404, reason="Incubator not found")
            return
        try:
            ensure_incubator_access(db, technician, incubator_id)
        except HTTPException:
            await websocket.close(code=4403, reason="Incubator access denied")
            return
    manager = websocket.app.state.broadcast
    await manager.connect(incubator_id, websocket)
    try:
        await websocket.send_json({"type": "connected", "incubator_id": incubator_id})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(incubator_id, websocket)
