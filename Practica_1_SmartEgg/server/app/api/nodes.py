from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    ActuatorState,
    Alarm,
    Egg,
    Incubator,
    IncubatorConfig,
    Sensor,
    Technician,
    TelemetryReading,
)
from ..schemas import (
    ActuatorCommand,
    ActuatorRead,
    AlarmRead,
    DashboardState,
    IncubatorConfigRead,
    IncubatorConfigUpdate,
    IncubatorCreate,
    IncubatorRead,
    Occupancy,
    SensorRead,
    SensorUpdate,
)
from ..security import get_current_technician

router = APIRouter(
    prefix="/incubators",
    tags=["incubators"],
    dependencies=[Depends(get_current_technician)],
)


def get_incubator_or_404(db: Session, incubator_id: int) -> Incubator:
    incubator = db.get(Incubator, incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    return incubator


@router.post("", response_model=IncubatorRead, status_code=status.HTTP_201_CREATED)
def create_incubator(
    payload: IncubatorCreate, db: Session = Depends(get_db)
) -> Incubator:
    incubator = Incubator(**payload.model_dump())
    incubator.config = IncubatorConfig()
    db.add(incubator)
    try:
        db.flush()
        for kind in ("heater", "fan", "servo", "buzzer"):
            db.add(ActuatorState(incubator_id=incubator.id, kind=kind))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Incubator code already exists"
        ) from exc
    db.refresh(incubator)
    return incubator


@router.get("", response_model=list[IncubatorRead])
def list_incubators(db: Session = Depends(get_db)) -> list[Incubator]:
    return list(db.scalars(select(Incubator).order_by(Incubator.code)))


@router.get("/{incubator_id}", response_model=IncubatorRead)
def get_incubator(incubator_id: int, db: Session = Depends(get_db)) -> Incubator:
    return get_incubator_or_404(db, incubator_id)


@router.get("/{incubator_id}/config", response_model=IncubatorConfigRead)
def get_config(incubator_id: int, db: Session = Depends(get_db)) -> IncubatorConfig:
    return get_incubator_or_404(db, incubator_id).config


@router.put("/{incubator_id}/config", response_model=IncubatorConfigRead)
def update_config(
    payload: IncubatorConfigUpdate,
    incubator_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> IncubatorConfig:
    config = get_incubator_or_404(db, incubator_id).config
    for key, value in payload.model_dump().items():
        setattr(config, key, value)
    config.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(config)
    try:
        request.app.state.serial_bridge.send_command(
            {"type": "config", **payload.model_dump()}
        )
    except RuntimeError:
        pass
    return config


@router.get("/{incubator_id}/sensors", response_model=list[SensorRead])
def list_sensors(incubator_id: int, db: Session = Depends(get_db)) -> list[Sensor]:
    get_incubator_or_404(db, incubator_id)
    return list(
        db.scalars(
            select(Sensor)
            .where(Sensor.incubator_id == incubator_id)
            .order_by(Sensor.code)
        )
    )


@router.patch("/{incubator_id}/sensors/{sensor_id}", response_model=SensorRead)
def update_sensor(
    payload: SensorUpdate,
    incubator_id: int,
    sensor_id: int,
    db: Session = Depends(get_db),
) -> Sensor:
    sensor = db.scalar(
        select(Sensor).where(
            Sensor.id == sensor_id, Sensor.incubator_id == incubator_id
        )
    )
    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor not found")
    sensor.is_active = payload.is_active
    db.commit()
    db.refresh(sensor)
    return sensor


@router.get("/{incubator_id}/actuators", response_model=list[ActuatorRead])
def list_actuators(
    incubator_id: int, db: Session = Depends(get_db)
) -> list[ActuatorState]:
    get_incubator_or_404(db, incubator_id)
    return list(
        db.scalars(
            select(ActuatorState)
            .where(ActuatorState.incubator_id == incubator_id)
            .order_by(ActuatorState.kind)
        )
    )


@router.post("/{incubator_id}/actuators/{kind}/commands", response_model=ActuatorRead)
def command_actuator(
    payload: ActuatorCommand,
    incubator_id: int,
    kind: str,
    request: Request,
    db: Session = Depends(get_db),
) -> ActuatorState:
    if kind not in {"heater", "fan", "servo", "buzzer"}:
        raise HTTPException(status_code=422, detail="Unknown actuator kind")
    actuator = db.scalar(
        select(ActuatorState).where(
            ActuatorState.incubator_id == incubator_id, ActuatorState.kind == kind
        )
    )
    if actuator is None:
        get_incubator_or_404(db, incubator_id)
        actuator = ActuatorState(incubator_id=incubator_id, kind=kind)
        db.add(actuator)
    actuator.enabled, actuator.mode, actuator.value = (
        payload.enabled,
        payload.mode,
        payload.value,
    )
    actuator.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(actuator)
    try:
        request.app.state.serial_bridge.send_command(
            {"type": "actuator", "kind": kind, **payload.model_dump()}
        )
    except RuntimeError:
        pass
    return actuator


@router.get("/{incubator_id}/alarms", response_model=list[AlarmRead])
def list_alarms(
    incubator_id: int,
    active_only: bool = False,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[Alarm]:
    get_incubator_or_404(db, incubator_id)
    query = select(Alarm).where(Alarm.incubator_id == incubator_id)
    if active_only:
        query = query.where(Alarm.resolved_at.is_(None))
    return list(
        db.scalars(
            query.order_by(Alarm.occurred_at.desc()).limit(min(max(limit, 1), 500))
        )
    )


@router.post("/{incubator_id}/alarms/{alarm_id}/acknowledge", response_model=AlarmRead)
def acknowledge_alarm(
    incubator_id: int,
    alarm_id: int,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> Alarm:
    alarm = db.scalar(
        select(Alarm).where(Alarm.id == alarm_id, Alarm.incubator_id == incubator_id)
    )
    if alarm is None:
        raise HTTPException(status_code=404, detail="Alarm not found")
    alarm.acknowledged_at = datetime.now(UTC)
    alarm.acknowledged_by_id = technician.id
    db.commit()
    db.refresh(alarm)
    return alarm


@router.get("/{incubator_id}/state", response_model=DashboardState)
def dashboard_state(incubator_id: int, db: Session = Depends(get_db)) -> DashboardState:
    incubator = get_incubator_or_404(db, incubator_id)
    latest = db.scalar(
        select(TelemetryReading)
        .where(TelemetryReading.incubator_id == incubator_id)
        .order_by(TelemetryReading.recorded_at.desc())
    )
    occupied = (
        db.scalar(
            select(func.count(Egg.id)).where(
                Egg.incubator_id == incubator_id, Egg.status == "incubating"
            )
        )
        or 0
    )
    return DashboardState(
        incubator=IncubatorRead.model_validate(incubator),
        config=IncubatorConfigRead.model_validate(incubator.config),
        latest=latest,
        occupancy=Occupancy(
            capacity=incubator.capacity,
            occupied=occupied,
            available=incubator.capacity - occupied,
        ),
        sensors=list(
            db.scalars(select(Sensor).where(Sensor.incubator_id == incubator_id))
        ),
        actuators=list(
            db.scalars(
                select(ActuatorState).where(ActuatorState.incubator_id == incubator_id)
            )
        ),
        active_alarms=list(
            db.scalars(
                select(Alarm)
                .where(Alarm.incubator_id == incubator_id, Alarm.resolved_at.is_(None))
                .order_by(Alarm.occurred_at.desc())
            )
        ),
    )
