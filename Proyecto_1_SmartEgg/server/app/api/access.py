from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AccessSession,
    DoorEvent,
    Incubator,
    Technician,
    TechnicianIncubator,
)
from ..schemas import (
    AccessSessionCommandResult,
    AccessSessionRead,
    DoorEventRead,
    DoorStateResult,
    DoorStateUpdate,
    RfidAccessGrant,
    RfidAccessRequest,
    TechnicianRead,
)
from ..security import create_access_token, get_current_technician

router = APIRouter(prefix="/access", tags=["physical access"])


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def require_device_key(
    request: Request,
    device_key: str | None = Header(default=None, alias="X-Device-Key"),
) -> None:
    configured = request.app.state.settings.device_api_key
    if configured is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Physical access API is not configured",
        )
    if device_key is None or not secrets.compare_digest(device_key, configured):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid device credentials",
        )


def publish_access_event(
    request: Request,
    incubator: Incubator,
    event: str,
    session: AccessSession,
) -> None:
    request.app.state.mqtt.publish_access_event(
        incubator.code,
        {
            "event": event,
            "session_id": session.id,
            "operator_id": session.technician_id,
            "method": session.method,
            "recorded_at": datetime.now(UTC).isoformat(),
        },
    )


@router.post(
    "/rfid/authorize",
    response_model=RfidAccessGrant,
    dependencies=[Depends(require_device_key)],
)
async def authorize_rfid(
    payload: RfidAccessRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RfidAccessGrant:
    incubator = db.scalar(
        select(Incubator).where(Incubator.code == payload.incubator_code)
    )
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    technician = db.scalar(select(Technician).where(Technician.rfid_uid == payload.uid))
    if (
        technician is None
        or not technician.is_active
        or technician.role != "operator"
        or db.get(TechnicianIncubator, (technician.id, incubator.id)) is None
    ):
        raise HTTPException(status_code=401, detail="RFID card is not authorized")

    now = datetime.now(UTC)
    active_sessions = list(
        db.scalars(
            select(AccessSession).where(
                AccessSession.incubator_id == incubator.id,
                AccessSession.ended_at.is_(None),
            )
        )
    )
    for active in active_sessions:
        if as_utc(active.expires_at) <= now:
            active.ended_at = now
            active.ended_reason = "expired"
        else:
            raise HTTPException(
                status_code=409,
                detail="The incubator already has an active access session",
            )

    settings = request.app.state.settings
    access_session = AccessSession(
        token_id=secrets.token_urlsafe(32),
        technician_id=technician.id,
        incubator_id=incubator.id,
        method="rfid",
        started_at=now,
        expires_at=now + timedelta(minutes=settings.access_token_minutes),
    )
    db.add(access_session)
    db.flush()
    token, expires_in = create_access_token(request, technician, access_session)
    db.commit()
    db.refresh(access_session)

    publish_access_event(request, incubator, "authorized", access_session)
    await request.app.state.broadcast.broadcast(
        incubator.id,
        {
            "type": "access_authorized",
            "session_id": access_session.id,
            "operator": TechnicianRead.model_validate(technician).model_dump(
                mode="json"
            ),
        },
    )
    await request.app.state.access_broadcast.broadcast(
        incubator.code,
        {
            "type": "rfid_authenticated",
            "access_token": token,
            "expires_in": expires_in,
            "session_id": access_session.id,
            "technician": TechnicianRead.model_validate(technician).model_dump(
                mode="json"
            ),
        },
    )
    return RfidAccessGrant(
        access_token=token,
        expires_in=expires_in,
        session_id=access_session.id,
        technician=TechnicianRead.model_validate(technician),
        servo_angle=settings.access_servo_unlock_degrees,
    )


@router.post(
    "/sessions/{session_id}/door",
    response_model=DoorStateResult,
    dependencies=[Depends(require_device_key)],
)
async def update_door_state(
    session_id: int,
    payload: DoorStateUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DoorStateResult:
    access_session = db.get(AccessSession, session_id)
    if access_session is None:
        raise HTTPException(status_code=404, detail="Access session not found")
    now = datetime.now(UTC)
    if access_session.ended_at is not None or as_utc(access_session.expires_at) <= now:
        if access_session.ended_at is None:
            access_session.ended_at = now
            access_session.ended_reason = "expired"
            db.commit()
        raise HTTPException(status_code=409, detail="Access session is not active")

    incubator = db.get(Incubator, access_session.incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")

    settings = request.app.state.settings
    door_event: DoorEvent | None = None
    if payload.state == "open":
        if access_session.door_opened_at is not None:
            raise HTTPException(status_code=409, detail="Door is already open")
        access_session.door_opened_at = now
        servo_action = "unlock"
        servo_angle = settings.access_servo_unlock_degrees
        event_name = "door_opened"
    else:
        if access_session.door_opened_at is None:
            raise HTTPException(status_code=409, detail="Door was not opened")
        access_session.door_closed_at = now
        access_session.ended_at = now
        access_session.ended_reason = "door_closed"
        door_event = db.scalar(
            select(DoorEvent).where(
                DoorEvent.access_session_id == access_session.id,
                DoorEvent.closed_at.is_(None),
            )
        )
        if door_event is None:
            door_event = DoorEvent(
                incubator_id=access_session.incubator_id,
                operator_id=access_session.technician_id,
                access_session_id=access_session.id,
                access_method=access_session.method,
                event_type=payload.event_type,
                opened_at=access_session.door_opened_at,
                closed_at=now,
                eggs_added=payload.eggs_added,
                eggs_removed=payload.eggs_removed,
                notes=payload.notes,
            )
            db.add(door_event)
        else:
            door_event.opened_at = access_session.door_opened_at
            door_event.closed_at = now
        servo_action = "lock"
        servo_angle = settings.access_servo_lock_degrees
        event_name = "door_closed"

    db.commit()
    db.refresh(access_session)
    if door_event is not None:
        db.refresh(door_event)
    publish_access_event(request, incubator, event_name, access_session)
    await request.app.state.broadcast.broadcast(
        incubator.id,
        {
            "type": event_name,
            "session_id": access_session.id,
            "session_closed": access_session.ended_at is not None,
            "servo_action": servo_action,
            "servo_angle": servo_angle,
        },
    )
    return DoorStateResult(
        session=AccessSessionRead.model_validate(access_session),
        door_event=(
            DoorEventRead.model_validate(door_event) if door_event is not None else None
        ),
        servo_action=servo_action,
        servo_angle=servo_angle,
    )


@router.get("/sessions/{session_id}", response_model=AccessSessionRead)
def read_access_session(
    session_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> AccessSession:
    access_session = db.get(AccessSession, session_id)
    if access_session is None:
        raise HTTPException(status_code=404, detail="Access session not found")
    if technician.role != "admin" and access_session.technician_id != technician.id:
        raise HTTPException(
            status_code=403, detail="Access session does not belong to you"
        )
    return access_session


@router.post(
    "/sessions/{session_id}/cancel",
    response_model=AccessSessionCommandResult,
    dependencies=[Depends(require_device_key)],
)
async def cancel_access_session(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AccessSessionCommandResult:
    access_session = db.get(AccessSession, session_id)
    if access_session is None:
        raise HTTPException(status_code=404, detail="Access session not found")
    if access_session.ended_at is not None:
        raise HTTPException(status_code=409, detail="Access session is not active")
    incubator = db.get(Incubator, access_session.incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")

    access_session.ended_at = datetime.now(UTC)
    access_session.ended_reason = "unlock_timeout"
    db.commit()
    db.refresh(access_session)
    settings = request.app.state.settings
    publish_access_event(request, incubator, "access_cancelled", access_session)
    await request.app.state.broadcast.broadcast(
        incubator.id,
        {
            "type": "access_cancelled",
            "session_id": access_session.id,
            "session_closed": True,
            "servo_action": "lock",
            "servo_angle": settings.access_servo_lock_degrees,
        },
    )
    return AccessSessionCommandResult(
        session=AccessSessionRead.model_validate(access_session),
        servo_angle=settings.access_servo_lock_degrees,
    )


@router.websocket("/ws/{incubator_code}")
async def access_channel(
    websocket: WebSocket,
    incubator_code: str,
    key: str = Query(),
) -> None:
    configured = websocket.app.state.settings.kiosk_api_key
    if configured is None or not secrets.compare_digest(key, configured):
        await websocket.close(code=4401, reason="Invalid kiosk credentials")
        return
    with websocket.app.state.session_factory() as db:
        incubator = db.scalar(select(Incubator).where(Incubator.code == incubator_code))
        if incubator is None:
            await websocket.close(code=4404, reason="Incubator not found")
            return
    manager = websocket.app.state.access_broadcast
    await manager.connect(incubator_code, websocket)
    try:
        await websocket.send_json(
            {"type": "rfid_ready", "incubator_code": incubator_code}
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(incubator_code, websocket)
