from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def normalize_rfid_uid(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.replace(":", "").replace("-", "").replace(" ", "").upper()
    if len(normalized) not in {8, 14, 20} or any(
        character not in "0123456789ABCDEF" for character in normalized
    ):
        raise ValueError("rfid_uid must contain a 4, 7 or 10-byte hexadecimal UID")
    return normalized


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str


class TechnicianCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    full_name: str = Field(min_length=3, max_length=120)
    age: int | None = Field(default=None, ge=1, le=120)
    gender: str | None = Field(default=None, min_length=1, max_length=30)
    role: Literal["operator_1", "operator_2", "admin"] = "operator_1"
    rfid_uid: str | None = None
    password: str = Field(min_length=8, max_length=128)

    _normalize_rfid_uid = field_validator("rfid_uid", mode="before")(normalize_rfid_uid)


class TechnicianRead(ORMModel):
    id: int
    username: str
    full_name: str
    age: int | None
    gender: str | None
    role: str
    rfid_uid: str | None
    is_active: bool
    created_at: datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    technician: TechnicianRead
    session_id: int | None = None


class IncubatorCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=100)
    capacity: int = Field(ge=1, le=1000)
    serial_number: str | None = Field(default=None, max_length=100)


class IncubatorRead(ORMModel):
    id: int
    code: str
    name: str
    capacity: int
    serial_number: str | None
    is_online: bool
    last_seen_at: datetime | None
    created_at: datetime


class IncubatorConfigRead(ORMModel):
    incubator_id: int
    temperature_min_c: float
    temperature_max_c: float
    humidity_min_pct: float
    humidity_max_pct: float
    critical_temperature_c: float
    rotation_interval_seconds: int
    rotation_angle_degrees: int
    updated_at: datetime


class IncubatorConfigUpdate(BaseModel):
    temperature_min_c: float = Field(ge=-20, le=80)
    temperature_max_c: float = Field(ge=-20, le=80)
    humidity_min_pct: float = Field(ge=0, le=100)
    humidity_max_pct: float = Field(ge=0, le=100)
    critical_temperature_c: float = Field(ge=-20, le=100)
    rotation_interval_seconds: int = Field(ge=10, le=86400)
    rotation_angle_degrees: int = Field(ge=1, le=90)

    @model_validator(mode="after")
    def validate_ranges(self) -> IncubatorConfigUpdate:
        if self.temperature_min_c >= self.temperature_max_c:
            raise ValueError("temperature_min_c must be lower than temperature_max_c")
        if self.humidity_min_pct >= self.humidity_max_pct:
            raise ValueError("humidity_min_pct must be lower than humidity_max_pct")
        if self.critical_temperature_c <= self.temperature_max_c:
            raise ValueError("critical_temperature_c must exceed temperature_max_c")
        return self


class LotCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    species: str = Field(default="Gallina", min_length=2, max_length=80)
    origin: str | None = Field(default=None, max_length=160)
    started_on: date
    expected_hatch_on: date | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_dates(self) -> LotCreate:
        if self.expected_hatch_on and self.expected_hatch_on < self.started_on:
            raise ValueError("expected_hatch_on cannot be before started_on")
        return self


class LotUpdate(BaseModel):
    status: Literal["active", "completed", "cancelled"] | None = None
    expected_hatch_on: date | None = None
    notes: str | None = Field(default=None, max_length=1000)


class LotRead(ORMModel):
    id: int
    code: str
    species: str
    origin: str | None
    started_on: date
    expected_hatch_on: date | None
    status: str
    notes: str | None
    created_at: datetime
    egg_count: int = 0


class EggCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    lot_id: int
    incubator_id: int
    slot_number: int = Field(ge=1)
    registered_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class EggUpdate(BaseModel):
    status: Literal["incubating", "hatched", "removed", "discarded"] | None = None
    notes: str | None = Field(default=None, max_length=1000)


class EggRead(ORMModel):
    id: int
    code: str
    lot_id: int
    incubator_id: int
    slot_number: int
    registered_at: datetime
    ended_at: datetime | None
    status: str
    notes: str | None


class Occupancy(BaseModel):
    capacity: int
    occupied: int
    available: int


class SensorRead(ORMModel):
    id: int
    incubator_id: int
    code: str
    kind: str
    unit: str | None
    is_active: bool
    last_value: float | None
    last_reading_at: datetime | None


class SensorUpdate(BaseModel):
    is_active: bool


class TelemetryCreate(BaseModel):
    incubator_code: str
    temperature_c: float = Field(ge=-40, le=125)
    humidity_pct: float = Field(ge=0, le=100)
    system_enabled: bool | None = None
    sensor_ok: bool | None = None
    door_open: bool | None = None
    occupied_slots: int | None = Field(default=None, ge=0)
    heater: bool | None = None
    fan: bool | None = None
    servo_angle: float | None = Field(default=None, ge=-180, le=180)
    buzzer: bool | None = None
    recorded_at: datetime | None = None
    source: Literal["api", "serial", "simulator"] = "api"
    raw_payload: str | None = None


class TelemetryRead(ORMModel):
    system_enabled: bool | None = None
    sensor_ok: bool | None = None
    id: int
    incubator_id: int
    temperature_c: float
    humidity_pct: float
    door_open: bool | None
    occupied_slots: int
    available_slots: int
    source: str
    recorded_at: datetime


class TelemetryStats(BaseModel):
    from_at: datetime
    to_at: datetime
    samples: int
    temperature_min_c: float | None
    temperature_max_c: float | None
    temperature_avg_c: float | None
    humidity_min_pct: float | None
    humidity_max_pct: float | None
    humidity_avg_pct: float | None


class DoorEventCreate(BaseModel):
    event_type: Literal["egg_entry", "egg_removal", "inspection", "maintenance"]
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    eggs_added: int = Field(default=0, ge=0)
    eggs_removed: int = Field(default=0, ge=0)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_event(self) -> DoorEventCreate:
        if self.opened_at and self.closed_at:
            opened_at = (
                self.opened_at.replace(tzinfo=UTC)
                if self.opened_at.tzinfo is None
                else self.opened_at.astimezone(UTC)
            )
            closed_at = (
                self.closed_at.replace(tzinfo=UTC)
                if self.closed_at.tzinfo is None
                else self.closed_at.astimezone(UTC)
            )
            if closed_at < opened_at:
                raise ValueError("closed_at cannot be before opened_at")
        if self.event_type == "egg_entry":
            if self.eggs_added < 1 or self.eggs_removed:
                raise ValueError("egg_entry requires eggs_added and no eggs_removed")
        elif self.event_type == "egg_removal":
            if self.eggs_removed < 1 or self.eggs_added:
                raise ValueError("egg_removal requires eggs_removed and no eggs_added")
        elif self.eggs_added or self.eggs_removed:
            raise ValueError("inspection and maintenance cannot change egg counts")
        return self


class DoorEventClose(BaseModel):
    closed_at: datetime | None = None


class DoorEventRead(ORMModel):
    id: int
    incubator_id: int
    operator_id: int
    access_session_id: int | None
    access_method: str
    event_type: str
    opened_at: datetime
    closed_at: datetime | None
    eggs_added: int
    eggs_removed: int
    notes: str | None
    created_at: datetime


class ActuatorRead(ORMModel):
    id: int
    incubator_id: int
    kind: str
    enabled: bool
    mode: str
    value: float | None
    updated_at: datetime


class ActuatorCommand(BaseModel):
    enabled: bool
    mode: Literal["automatic", "manual"] = "manual"
    value: float | None = None


class RotationCommand(BaseModel):
    angle_degrees: int = Field(ge=1, le=90)
    direction: Literal["left", "right"]


class RotationRead(ORMModel):
    id: int
    incubator_id: int
    angle_degrees: int
    direction: str
    source: str
    performed_at: datetime


class AlarmRead(ORMModel):
    id: int
    incubator_id: int
    kind: str
    severity: str
    message: str
    value: float | None
    occurred_at: datetime
    resolved_at: datetime | None
    acknowledged_at: datetime | None
    acknowledged_by_id: int | None


class DashboardState(BaseModel):
    incubator: IncubatorRead
    config: IncubatorConfigRead
    latest: TelemetryRead | None
    occupancy: Occupancy
    sensors: list[SensorRead]
    actuators: list[ActuatorRead]
    active_alarms: list[AlarmRead]


class SerialStatus(BaseModel):
    enabled: bool
    connected: bool
    port: str | None
    baudrate: int
    last_error: str | None
    last_message_at: datetime | None


class RfidAccessRequest(BaseModel):
    uid: str
    incubator_code: str = Field(min_length=2, max_length=40)

    _normalize_uid = field_validator("uid", mode="before")(normalize_rfid_uid)


class RfidAccessGrant(Token):
    result: Literal["authorized"] = "authorized"
    servo_action: Literal["unlock"] = "unlock"
    servo_angle: int


class DoorStateUpdate(BaseModel):
    state: Literal["open", "closed"]
    event_type: Literal["egg_entry", "egg_removal", "inspection", "maintenance"] = (
        "inspection"
    )
    eggs_added: int = Field(default=0, ge=0)
    eggs_removed: int = Field(default=0, ge=0)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_operation(self) -> DoorStateUpdate:
        if self.state == "open":
            if self.eggs_added or self.eggs_removed:
                raise ValueError("egg counts are recorded when the door closes")
            return self
        if self.event_type == "egg_entry":
            if self.eggs_added < 1 or self.eggs_removed:
                raise ValueError("egg_entry requires eggs_added and no eggs_removed")
        elif self.event_type == "egg_removal":
            if self.eggs_removed < 1 or self.eggs_added:
                raise ValueError("egg_removal requires eggs_removed and no eggs_added")
        elif self.eggs_added or self.eggs_removed:
            raise ValueError("inspection and maintenance cannot change egg counts")
        return self


class AccessSessionRead(ORMModel):
    id: int
    technician_id: int
    incubator_id: int
    method: str
    started_at: datetime
    expires_at: datetime
    ended_at: datetime | None
    ended_reason: str | None
    door_opened_at: datetime | None
    door_closed_at: datetime | None


class DoorStateResult(BaseModel):
    session: AccessSessionRead
    door_event: DoorEventRead | None = None
    servo_action: Literal["unlock", "lock"]
    servo_angle: int


class AccessSessionCommandResult(BaseModel):
    session: AccessSessionRead
    servo_action: Literal["lock"] = "lock"
    servo_angle: int
