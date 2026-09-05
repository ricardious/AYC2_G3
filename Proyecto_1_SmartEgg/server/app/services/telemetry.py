from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    ActuatorState,
    Alarm,
    Egg,
    Incubator,
    RotationEvent,
    Sensor,
    TelemetryReading,
)
from ..schemas import TelemetryCreate

ACTUATOR_KINDS = ("heater", "fan", "servo", "buzzer")


def _upsert_sensor(
    db: Session,
    incubator_id: int,
    code: str,
    kind: str,
    unit: str,
    value: float,
    recorded_at: datetime,
) -> None:
    sensor = db.scalar(
        select(Sensor).where(Sensor.incubator_id == incubator_id, Sensor.code == code)
    )
    if sensor is None:
        sensor = Sensor(incubator_id=incubator_id, code=code, kind=kind, unit=unit)
        db.add(sensor)
    sensor.is_active = True
    sensor.last_value = value
    sensor.last_reading_at = recorded_at


def _upsert_actuator(
    db: Session,
    incubator_id: int,
    kind: str,
    enabled: bool,
    value: float | None = None,
    mode: str = "automatic",
) -> ActuatorState:
    actuator = db.scalar(
        select(ActuatorState).where(
            ActuatorState.incubator_id == incubator_id, ActuatorState.kind == kind
        )
    )
    if actuator is None:
        actuator = ActuatorState(incubator_id=incubator_id, kind=kind)
        db.add(actuator)
    actuator.enabled = enabled
    actuator.value = value
    actuator.mode = mode
    actuator.updated_at = datetime.now(UTC)
    return actuator


def _sync_alarm(
    db: Session,
    incubator_id: int,
    kind: str,
    active: bool,
    severity: str,
    message: str,
    value: float | None,
    recorded_at: datetime,
) -> None:
    alarm = db.scalar(
        select(Alarm)
        .where(
            Alarm.incubator_id == incubator_id,
            Alarm.kind == kind,
            Alarm.resolved_at.is_(None),
        )
        .order_by(Alarm.occurred_at.desc())
    )
    if active and alarm is None:
        db.add(
            Alarm(
                incubator_id=incubator_id,
                kind=kind,
                severity=severity,
                message=message,
                value=value,
                occurred_at=recorded_at,
            )
        )
    elif active and alarm is not None:
        alarm.severity = severity
        alarm.message = message
        alarm.value = value
    elif not active and alarm is not None:
        alarm.resolved_at = recorded_at


def ingest_telemetry(db: Session, payload: TelemetryCreate) -> TelemetryReading:
    incubator = db.scalar(
        select(Incubator).where(Incubator.code == payload.incubator_code)
    )
    if incubator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incubator not found"
        )
    if (
        payload.occupied_slots is not None
        and payload.occupied_slots > incubator.capacity
    ):
        raise HTTPException(
            status_code=422, detail="occupied_slots exceeds incubator capacity"
        )

    recorded_at = payload.recorded_at or datetime.now(UTC)
    occupied_slots = payload.occupied_slots
    if occupied_slots is None:
        occupied_slots = (
            db.scalar(
                select(func.count(Egg.id)).where(
                    Egg.incubator_id == incubator.id,
                    Egg.status == "incubating",
                )
            )
            or 0
        )
    reading = TelemetryReading(
        incubator_id=incubator.id,
        temperature_c=payload.temperature_c,
        humidity_pct=payload.humidity_pct,
        door_open=payload.door_open,
        occupied_slots=occupied_slots,
        available_slots=incubator.capacity - occupied_slots,
        source=payload.source,
        raw_payload=payload.raw_payload,
        recorded_at=recorded_at,
    )
    db.add(reading)
    incubator.is_online = True
    incubator.last_seen_at = recorded_at

    _upsert_sensor(
        db,
        incubator.id,
        "temperature",
        "temperature",
        "°C",
        payload.temperature_c,
        recorded_at,
    )
    _upsert_sensor(
        db, incubator.id, "humidity", "humidity", "%", payload.humidity_pct, recorded_at
    )
    if payload.door_open is not None:
        _upsert_sensor(
            db,
            incubator.id,
            "door",
            "limit_switch",
            "boolean",
            float(payload.door_open),
            recorded_at,
        )
    _upsert_sensor(
        db,
        incubator.id,
        "slots",
        "pressure",
        "occupied",
        float(occupied_slots),
        recorded_at,
    )

    config = incubator.config
    temp_low = payload.temperature_c < config.temperature_min_c
    temp_high = payload.temperature_c > config.temperature_max_c
    temp_critical = payload.temperature_c >= config.critical_temperature_c
    humidity_low = payload.humidity_pct < config.humidity_min_pct
    humidity_high = payload.humidity_pct > config.humidity_max_pct

    _sync_alarm(
        db,
        incubator.id,
        "temperature_low",
        temp_low,
        "warning",
        "Temperatura debajo del rango seguro",
        payload.temperature_c,
        recorded_at,
    )
    _sync_alarm(
        db,
        incubator.id,
        "temperature_high",
        temp_high,
        "critical" if temp_critical else "warning",
        "Sobrecalentamiento detectado",
        payload.temperature_c,
        recorded_at,
    )
    _sync_alarm(
        db,
        incubator.id,
        "humidity_low",
        humidity_low,
        "warning",
        "Humedad debajo del rango seguro",
        payload.humidity_pct,
        recorded_at,
    )
    _sync_alarm(
        db,
        incubator.id,
        "humidity_high",
        humidity_high,
        "warning",
        "Humedad sobre el rango seguro",
        payload.humidity_pct,
        recorded_at,
    )
    _sync_alarm(
        db,
        incubator.id,
        "door_open",
        payload.door_open is True,
        "warning",
        "Puerta abierta",
        None,
        recorded_at,
    )

    heater = payload.heater if payload.heater is not None else temp_low
    fan = payload.fan if payload.fan is not None else temp_high
    buzzer = (
        payload.buzzer
        if payload.buzzer is not None
        else (temp_critical or humidity_low or humidity_high)
    )
    _upsert_actuator(db, incubator.id, "heater", heater)
    _upsert_actuator(db, incubator.id, "fan", fan)
    _upsert_actuator(db, incubator.id, "buzzer", buzzer)
    if payload.servo_angle is not None:
        previous_servo = db.scalar(
            select(ActuatorState).where(
                ActuatorState.incubator_id == incubator.id,
                ActuatorState.kind == "servo",
            )
        )
        previous_angle = previous_servo.value if previous_servo else None
        _upsert_actuator(db, incubator.id, "servo", True, payload.servo_angle)
        if previous_angle is None or previous_angle != payload.servo_angle:
            db.add(
                RotationEvent(
                    incubator_id=incubator.id,
                    angle_degrees=round(abs(payload.servo_angle)),
                    direction="right" if payload.servo_angle >= 0 else "left",
                    source="automatic"
                    if payload.source == "serial"
                    else payload.source,
                    performed_at=recorded_at,
                )
            )

    db.commit()
    db.refresh(reading)
    return reading
