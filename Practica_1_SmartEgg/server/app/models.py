from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
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

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Incubator(Base):
    __tablename__ = "incubators"

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

    id: Mapped[int] = mapped_column(primary_key=True)
    incubator_id: Mapped[int] = mapped_column(
        ForeignKey("incubators.id", ondelete="CASCADE"), index=True
    )
    temperature_c: Mapped[float] = mapped_column(Float)
    humidity_pct: Mapped[float] = mapped_column(Float)
    door_open: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    occupied_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="api")
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class ActuatorState(Base):
    __tablename__ = "actuator_states"
    __table_args__ = (
        UniqueConstraint("incubator_id", "kind", name="uq_actuator_incubator_kind"),
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
