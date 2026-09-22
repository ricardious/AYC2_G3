from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AccessSession, DoorEvent, Incubator, Technician
from ..schemas import DoorEventClose, DoorEventCreate, DoorEventRead
from ..security import (
    ensure_incubator_access,
    ensure_owner_or_admin,
    get_current_technician,
    require_operator,
)

router = APIRouter(
    prefix="/incubators/{incubator_id}/door-events",
    tags=["door events"],
    dependencies=[Depends(get_current_technician)],
)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_incubator_or_404(db: Session, incubator_id: int) -> Incubator:
    incubator = db.get(Incubator, incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    return incubator


@router.post("", response_model=DoorEventRead, status_code=status.HTTP_201_CREATED)
def create_door_event(
    incubator_id: int,
    payload: DoorEventCreate,
    db: Session = Depends(get_db),
    operator: Technician = Depends(require_operator),
) -> DoorEvent:
    get_incubator_or_404(db, incubator_id)
    ensure_incubator_access(db, operator, incubator_id)
    if payload.closed_at is None:
        active = db.scalar(
            select(DoorEvent).where(
                DoorEvent.incubator_id == incubator_id,
                DoorEvent.closed_at.is_(None),
            )
        )
        if active is not None:
            raise HTTPException(
                status_code=409,
                detail="The incubator already has an open door event",
            )

    opened_at = as_utc(payload.opened_at or datetime.now(UTC))
    closed_at = as_utc(payload.closed_at) if payload.closed_at is not None else None
    if closed_at is not None and closed_at < opened_at:
        raise HTTPException(
            status_code=422, detail="closed_at cannot be before opened_at"
        )
    access_session_id = getattr(operator, "_access_session_id", None)
    access_method = "password"
    if access_session_id is not None:
        access_session = db.get(AccessSession, access_session_id)
        if access_session is None or access_session.incubator_id != incubator_id:
            raise HTTPException(
                status_code=403,
                detail="RFID session does not belong to this incubator",
            )
        access_method = access_session.method
    event = DoorEvent(
        incubator_id=incubator_id,
        operator_id=operator.id,
        access_session_id=access_session_id,
        access_method=access_method,
        opened_at=opened_at,
        **payload.model_dump(exclude={"opened_at", "closed_at"}),
        closed_at=closed_at,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=list[DoorEventRead])
def list_door_events(
    incubator_id: int,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    operator_id: int | None = None,
    event_type: str | None = None,
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> list[DoorEvent]:
    get_incubator_or_404(db, incubator_id)
    ensure_incubator_access(db, technician, incubator_id)
    query = select(DoorEvent).where(DoorEvent.incubator_id == incubator_id)
    if technician.role != "admin":
        query = query.where(DoorEvent.operator_id == technician.id)
    if from_at is not None:
        query = query.where(DoorEvent.opened_at >= from_at)
    if to_at is not None:
        query = query.where(DoorEvent.opened_at <= to_at)
    if operator_id is not None:
        query = query.where(DoorEvent.operator_id == operator_id)
    if event_type is not None:
        query = query.where(DoorEvent.event_type == event_type)
    return list(db.scalars(query.order_by(DoorEvent.opened_at.desc()).limit(limit)))


@router.patch("/{event_id}/close", response_model=DoorEventRead)
def close_door_event(
    incubator_id: int,
    event_id: int,
    payload: DoorEventClose,
    db: Session = Depends(get_db),
    technician: Technician = Depends(require_operator),
) -> DoorEvent:
    event = db.scalar(
        select(DoorEvent).where(
            DoorEvent.id == event_id,
            DoorEvent.incubator_id == incubator_id,
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Door event not found")
    ensure_incubator_access(db, technician, incubator_id)
    ensure_owner_or_admin(technician, event.operator_id)
    if event.closed_at is not None:
        raise HTTPException(status_code=409, detail="Door event is already closed")
    closed_at = as_utc(payload.closed_at or datetime.now(UTC))
    if closed_at < as_utc(event.opened_at):
        raise HTTPException(
            status_code=422, detail="closed_at cannot be before opened_at"
        )
    event.closed_at = closed_at
    db.commit()
    db.refresh(event)
    return event
