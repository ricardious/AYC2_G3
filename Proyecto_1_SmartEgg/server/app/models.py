from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Technician(Base):
    __tablename__ = "technicians"
    __table_args__ = (
        CheckConstraint(
            "age IS NULL OR age BETWEEN 1 AND 120", name="ck_technician_age"
        ),
        CheckConstraint(
            "role IN ('operator_1', 'operator_2', 'admin')",
            name="ck_technician_role",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(30), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="operator_1", index=True)
    rfid_uid: Mapped[str | None] = mapped_column(
        String(20), unique=True, nullable=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Incubator(Base):
    __tablename__ = "incubators"
    __table_args__ = (CheckConstraint("capacity > 0", name="ck_incubator_capacity"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    capacity: Mapped[int] = mapped_column(Integer)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    config: Mapped[IncubatorConfig] = relationship(
        back_populates="incubator", cascade="all, delete-orphan"
    )


class IncubatorConfig(Base):
    __tablename__ = "incubator_configs"
    __table_args__ = (
        CheckConstraint(
            "temperature_min_c < temperature_max_c",
            name="ck_incubator_config_temperature_range",
        ),
        CheckConstraint(
            "humidity_min_pct >= 0 AND humidity_max_pct <= 100 "
            "AND humidity_min_pct < humidity_max_pct",
            name="ck_incubator_config_humidity_range",
        ),
        CheckConstraint(
            "critical_temperature_c > temperature_max_c",
            name="ck_incubator_config_critical_temperature",
        ),
        CheckConstraint(
            "rotation_interval_seconds > 0",
            name="ck_incubator_config_rotation_interval",
        ),
        CheckConstraint(
            "rotation_angle_degrees BETWEEN 1 AND 90",
            name="ck_incubator_config_rotation_angle",
        ),
    )

    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), primary_key=True
    )
    temperature_min_c: Mapped[float] = mapped_column(Float, default=37.0)
    temperature_max_c: Mapped[float] = mapped_column(Float, default=38.0)
    humidity_min_pct: Mapped[float] = mapped_column(Float, default=50.0)
    humidity_max_pct: Mapped[float] = mapped_column(Float, default=65.0)
    critical_temperature_c: Mapped[float] = mapped_column(Float, default=39.0)
    rotation_interval_seconds: Mapped[int] = mapped_column(Integer, default=120)
    rotation_angle_degrees: Mapped[int] = mapped_column(Integer, default=45)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    incubator: Mapped[Incubator] = relationship(back_populates="config")


class Lot(Base):
    __tablename__ = "lots"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'completed', 'cancelled')", name="ck_lot_status"
        ),
        CheckConstraint(
            "expected_hatch_on IS NULL OR expected_hatch_on >= started_on",
            name="ck_lot_hatch_date",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    species: Mapped[str] = mapped_column(String(80), default="Gallina")
    origin: Mapped[str | None] = mapped_column(String(160), nullable=True)
    started_on: Mapped[date] = mapped_column(Date)
    expected_hatch_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    eggs: Mapped[list[Egg]] = relationship(back_populates="lot")


class Egg(Base):
    __tablename__ = "eggs"
    __table_args__ = (
        CheckConstraint("slot_number > 0", name="ck_egg_slot"),
        CheckConstraint(
            "status IN ('incubating', 'hatched', 'removed', 'discarded')",
            name="ck_egg_status",
        ),
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= registered_at", name="ck_egg_chronology"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    lot_id: Mapped[int] = mapped_column(
        ForeignKey("lots.id", ondelete="RESTRICT"), index=True
    )
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="RESTRICT"), index=True
    )
    slot_number: Mapped[int] = mapped_column(Integer)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), default="incubating", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lot: Mapped[Lot] = relationship(back_populates="eggs")
    incubator: Mapped[Incubator] = relationship()


class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = (
        UniqueConstraint("incubator_id", "code", name="uq_sensor_incubator_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(30))
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_reading_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class TelemetryReading(Base):
    __tablename__ = "telemetry_readings"
    __table_args__ = (
        CheckConstraint("humidity_pct BETWEEN 0 AND 100", name="ck_telemetry_humidity"),
        CheckConstraint(
            "temperature_c BETWEEN -40 AND 125", name="ck_telemetry_temperature"
        ),
        CheckConstraint("occupied_slots >= 0", name="ck_telemetry_occupied_slots"),
        CheckConstraint("available_slots >= 0", name="ck_telemetry_available_slots"),
        CheckConstraint(
            "source IN ('api', 'serial', 'simulator')", name="ck_telemetry_source"
        ),
        Index("ix_telemetry_incubator_recorded", "incubator_id", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    temperature_c: Mapped[float] = mapped_column(Float)
    humidity_pct: Mapped[float] = mapped_column(Float)
    system_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    sensor_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    door_open: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    occupied_slots: Mapped[int] = mapped_column(Integer)
    available_slots: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(20), default="api")
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class DoorEvent(Base):
    __tablename__ = "door_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('egg_entry', 'egg_removal', 'inspection', 'maintenance')",
            name="ck_door_event_type",
        ),
        CheckConstraint("eggs_added >= 0", name="ck_door_event_eggs_added"),
        CheckConstraint("eggs_removed >= 0", name="ck_door_event_eggs_removed"),
        CheckConstraint(
            "closed_at IS NULL OR closed_at >= opened_at",
            name="ck_door_event_chronology",
        ),
        CheckConstraint(
            "(event_type = 'egg_entry' AND eggs_added > 0 AND eggs_removed = 0) OR "
            "(event_type = 'egg_removal' AND eggs_removed > 0 AND eggs_added = 0) OR "
            "(event_type IN ('inspection', 'maintenance') "
            "AND eggs_added = 0 AND eggs_removed = 0)",
            name="ck_door_event_counts_match_type",
        ),
        CheckConstraint(
            "access_method IN ('rfid', 'fingerprint', 'key', 'password')",
            name="ck_door_event_access_method",
        ),
        Index("ix_door_event_incubator_opened", "incubator_id", "opened_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    operator_id: Mapped[int] = mapped_column(
        ForeignKey("technicians.id", ondelete="RESTRICT"), index=True
    )
    access_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    access_method: Mapped[str] = mapped_column(String(20), default="password")
    event_type: Mapped[str] = mapped_column(String(20))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    eggs_added: Mapped[int] = mapped_column(Integer, default=0)
    eggs_removed: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    incubator: Mapped[Incubator] = relationship()
    operator: Mapped[Technician] = relationship()


class AccessSession(Base):
    __tablename__ = "access_sessions"
    __table_args__ = (
        CheckConstraint(
            "method IN ('rfid', 'fingerprint', 'key', 'password')",
            name="ck_access_session_method",
        ),
        CheckConstraint(
            "ended_reason IS NULL OR ended_reason IN "
            "('door_closed', 'expired', 'logout', 'replaced', 'unlock_timeout')",
            name="ck_access_session_ended_reason",
        ),
        CheckConstraint(
            "door_closed_at IS NULL OR door_opened_at IS NOT NULL",
            name="ck_access_session_door_order",
        ),
        CheckConstraint(
            "door_closed_at IS NULL OR door_closed_at >= door_opened_at",
            name="ck_access_session_door_chronology",
        ),
        Index(
            "ix_access_session_incubator_started",
            "incubator_id",
            "started_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    token_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    technician_id: Mapped[int] = mapped_column(
        ForeignKey("technicians.id", ondelete="RESTRICT"), index=True
    )
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    method: Mapped[str] = mapped_column(String(20), default="rfid")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    door_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    door_closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    technician: Mapped[Technician] = relationship()
    incubator: Mapped[Incubator] = relationship()


class ActuatorState(Base):
    __tablename__ = "actuator_states"
    __table_args__ = (
        UniqueConstraint("incubator_id", "kind", name="uq_actuator_incubator_kind"),
        CheckConstraint(
            "kind IN ('heater', 'fan', 'servo', 'buzzer')",
            name="ck_actuator_kind",
        ),
        CheckConstraint("mode IN ('automatic', 'manual')", name="ck_actuator_mode"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode: Mapped[str] = mapped_column(String(20), default="automatic")
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Alarm(Base):
    __tablename__ = "alarms"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('info', 'warning', 'critical')", name="ck_alarm_severity"
        ),
        CheckConstraint(
            "resolved_at IS NULL OR resolved_at >= occurred_at",
            name="ck_alarm_resolution_chronology",
        ),
        CheckConstraint(
            "acknowledged_at IS NULL OR acknowledged_at >= occurred_at",
            name="ck_alarm_acknowledgement_chronology",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40), index=True)
    severity: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(255))
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    acknowledged_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("technicians.id"), nullable=True
    )


class RotationEvent(Base):
    __tablename__ = "rotation_events"
    __table_args__ = (
        CheckConstraint("angle_degrees BETWEEN 1 AND 90", name="ck_rotation_angle"),
        CheckConstraint("direction IN ('left', 'right')", name="ck_rotation_direction"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    angle_degrees: Mapped[int] = mapped_column(Integer)
    direction: Mapped[str] = mapped_column(String(10))
    source: Mapped[str] = mapped_column(String(20), default="automatic")
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
