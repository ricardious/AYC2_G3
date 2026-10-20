from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Egg, Incubator, Lot, RotationEvent, Technician
from ..schemas import (
    EggCreate,
    EggRead,
    EggUpdate,
    LotCreate,
    LotRead,
    LotUpdate,
    Occupancy,
    RotationCommand,
    RotationRead,
)
from ..security import (
    ensure_incubator_access,
    ensure_owner_or_admin,
    get_current_technician,
    require_admin,
)

router = APIRouter(tags=["incubation"], dependencies=[Depends(get_current_technician)])


def lot_view(db: Session, lot: Lot) -> LotRead:
    count = (
        db.scalar(
            select(func.count(Egg.id)).where(
                Egg.lot_id == lot.id, Egg.status == "incubating"
            )
        )
        or 0
    )
    return LotRead(**{**LotRead.model_validate(lot).model_dump(), "egg_count": count})


@router.post("/lots", response_model=LotRead, status_code=status.HTTP_201_CREATED)
def create_lot(
    payload: LotCreate,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> LotRead:
    lot = Lot(**payload.model_dump(), created_by_id=technician.id)
    db.add(lot)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Lot code already exists") from exc
    db.refresh(lot)
    return lot_view(db, lot)


@router.get("/lots", response_model=list[LotRead])
def list_lots(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> list[LotRead]:
    query = select(Lot)
    if technician.role != "admin":
        query = query.where(Lot.created_by_id == technician.id)
    if status_filter:
        query = query.where(Lot.status == status_filter)
    return [
        lot_view(db, lot) for lot in db.scalars(query.order_by(Lot.created_at.desc()))
    ]


@router.get("/lots/{lot_id}", response_model=LotRead)
def get_lot(
    lot_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> LotRead:
    lot = db.get(Lot, lot_id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")
    ensure_owner_or_admin(technician, lot.created_by_id)
    return lot_view(db, lot)


@router.patch("/lots/{lot_id}", response_model=LotRead)
def update_lot(
    payload: LotUpdate,
    lot_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> LotRead:
    lot = db.get(Lot, lot_id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")
    ensure_owner_or_admin(technician, lot.created_by_id)
    if payload.expected_hatch_on and payload.expected_hatch_on < lot.started_on:
        raise HTTPException(
            status_code=422, detail="expected_hatch_on cannot be before started_on"
        )
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(lot, key, value)
    db.commit()
    db.refresh(lot)
    return lot_view(db, lot)


@router.post("/eggs", response_model=EggRead, status_code=status.HTTP_201_CREATED)
def register_egg(
    payload: EggCreate,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> Egg:
    lot = db.get(Lot, payload.lot_id)
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")
    ensure_owner_or_admin(technician, lot.created_by_id)
    if lot.status != "active":
        raise HTTPException(
            status_code=409, detail="Eggs can only be added to an active lot"
        )
    incubator = db.get(Incubator, payload.incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    ensure_incubator_access(db, technician, incubator.id)
    if payload.slot_number > incubator.capacity:
        raise HTTPException(
            status_code=422, detail="slot_number exceeds incubator capacity"
        )
    occupied = db.scalar(
        select(Egg).where(
            Egg.incubator_id == payload.incubator_id,
            Egg.slot_number == payload.slot_number,
            Egg.status == "incubating",
        )
    )
    if occupied:
        raise HTTPException(
            status_code=409, detail="Incubator slot is already occupied"
        )
    active_count = (
        db.scalar(
            select(func.count(Egg.id)).where(
                Egg.incubator_id == payload.incubator_id, Egg.status == "incubating"
            )
        )
        or 0
    )
    if active_count >= incubator.capacity:
        raise HTTPException(status_code=409, detail="Incubator has no available slots")
    values = payload.model_dump(exclude={"registered_at"})
    egg = Egg(
        **values,
        registered_at=payload.registered_at or datetime.now(UTC),
        registered_by_id=technician.id,
    )
    db.add(egg)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Egg code already exists") from exc
    db.refresh(egg)
    return egg


@router.get("/eggs", response_model=list[EggRead])
def list_eggs(
    lot_id: int | None = None,
    incubator_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> list[Egg]:
    query = select(Egg)
    if technician.role != "admin":
        query = query.where(Egg.registered_by_id == technician.id)
    if lot_id is not None:
        query = query.where(Egg.lot_id == lot_id)
    if incubator_id is not None:
        query = query.where(Egg.incubator_id == incubator_id)
    if status_filter:
        query = query.where(Egg.status == status_filter)
    return list(db.scalars(query.order_by(Egg.incubator_id, Egg.slot_number)))


@router.get("/eggs/{egg_id}", response_model=EggRead)
def get_egg(
    egg_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> Egg:
    egg = db.get(Egg, egg_id)
    if egg is None:
        raise HTTPException(status_code=404, detail="Egg not found")
    ensure_owner_or_admin(technician, egg.registered_by_id)
    return egg


@router.patch("/eggs/{egg_id}", response_model=EggRead)
def update_egg(
    payload: EggUpdate,
    egg_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> Egg:
    egg = db.get(Egg, egg_id)
    if egg is None:
        raise HTTPException(status_code=404, detail="Egg not found")
    ensure_owner_or_admin(technician, egg.registered_by_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(egg, key, value)
    if payload.status is not None:
        egg.ended_at = None if payload.status == "incubating" else datetime.now(UTC)
    db.commit()
    db.refresh(egg)
    return egg


@router.get("/incubators/{incubator_id}/occupancy", response_model=Occupancy)
def occupancy(
    incubator_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> Occupancy:
    incubator = db.get(Incubator, incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    ensure_incubator_access(db, technician, incubator_id)
    occupied = (
        db.scalar(
            select(func.count(Egg.id)).where(
                Egg.incubator_id == incubator_id, Egg.status == "incubating"
            )
        )
        or 0
    )
    return Occupancy(
        capacity=incubator.capacity,
        occupied=occupied,
        available=incubator.capacity - occupied,
    )


@router.post(
    "/incubators/{incubator_id}/rotations",
    response_model=RotationRead,
    status_code=status.HTTP_201_CREATED,
)
def rotate(
    payload: RotationCommand,
    incubator_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _admin: Technician = Depends(require_admin),
) -> RotationEvent:
    if db.get(Incubator, incubator_id) is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    event = RotationEvent(
        incubator_id=incubator_id,
        angle_degrees=payload.angle_degrees,
        direction=payload.direction,
        source="manual",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    signed_angle = (
        payload.angle_degrees
        if payload.direction == "right"
        else -payload.angle_degrees
    )
    try:
        request.app.state.serial_bridge.send_command(
            {"type": "rotate", "angle_degrees": signed_angle}
        )
    except RuntimeError:
        pass
    return event


@router.get("/incubators/{incubator_id}/rotations", response_model=list[RotationRead])
def list_rotations(
    incubator_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> list[RotationEvent]:
    if db.get(Incubator, incubator_id) is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    ensure_incubator_access(db, technician, incubator_id)
    return list(
        db.scalars(
            select(RotationEvent)
            .where(RotationEvent.incubator_id == incubator_id)
            .order_by(RotationEvent.performed_at.desc())
            .limit(min(max(limit, 1), 500))
        )
    )
