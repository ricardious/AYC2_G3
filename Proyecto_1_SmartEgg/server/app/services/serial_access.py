from __future__ import annotations

import secrets
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import (
    AccessSession,
    DoorEvent,
    Incubator,
    Technician,
    TechnicianIncubator,
)
from ..security import create_access_token_for_settings
from .serial_bridge import SerialAccessEvent


@dataclass(frozen=True)
class SerialAccessOutcome:
    command: dict[str, object] | None
    incubator_id: int | None
    incubator_code: str
    mqtt_payload: dict[str, object]
    dashboard_payload: dict[str, object] | None = None
    kiosk_payload: dict[str, object] | None = None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _deny(
    event: SerialAccessEvent, reason: str, settings: Settings
) -> SerialAccessOutcome:
    code = event.incubator_code or settings.default_incubator_code
    return SerialAccessOutcome(
        command={
            "type": "access",
            "action": "authorize",
            "authorized": False,
            "session_id": 0,
            "servo_angle": settings.access_servo_lock_degrees,
        },
        incubator_id=None,
        incubator_code=code,
        mqtt_payload={
            "event": "rejected",
            "method": "rfid",
            "reason": reason,
            "recorded_at": datetime.now(UTC).isoformat(),
        },
        kiosk_payload={"type": "rfid_rejected", "reason": reason},
    )


def _authorize_rfid(
    db: Session, event: SerialAccessEvent, settings: Settings
) -> SerialAccessOutcome:
    code = event.incubator_code or settings.default_incubator_code
    incubator = db.scalar(select(Incubator).where(Incubator.code == code))
    if incubator is None:
        return _deny(event, "incubator_not_found", settings)
    technician = db.scalar(select(Technician).where(Technician.rfid_uid == event.uid))
    if (
        technician is None
        or not technician.is_active
        or technician.role not in {"operator_1", "operator_2"}
        or db.get(TechnicianIncubator, (technician.id, incubator.id)) is None
    ):
        denied = _deny(event, "card_not_authorized", settings)
        return replace(denied, incubator_id=incubator.id)

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
        if _as_utc(active.expires_at) <= now:
            active.ended_at = now
            active.ended_reason = "expired"
        else:
            denied = _deny(event, "session_already_active", settings)
            return replace(denied, incubator_id=incubator.id)

    session = AccessSession(
        token_id=secrets.token_urlsafe(32),
        technician_id=technician.id,
        incubator_id=incubator.id,
        method="rfid",
        started_at=now,
        expires_at=now + timedelta(minutes=settings.access_token_minutes),
    )
    db.add(session)
    db.flush()
    token, expires_in = create_access_token_for_settings(settings, technician, session)
    db.commit()
    return SerialAccessOutcome(
        command={
            "type": "access",
            "action": "authorize",
            "authorized": True,
            "session_id": session.id,
            "servo_angle": settings.access_servo_unlock_degrees,
        },
        incubator_id=incubator.id,
        incubator_code=incubator.code,
        mqtt_payload={
            "event": "authorized",
            "session_id": session.id,
            "operator_id": technician.id,
            "method": "rfid",
            "recorded_at": now.isoformat(),
        },
        dashboard_payload={
            "type": "access_authorized",
            "session_id": session.id,
            "operator": {
                "id": technician.id,
                "username": technician.username,
                "full_name": technician.full_name,
                "role": technician.role,
            },
        },
        kiosk_payload={
            "type": "rfid_authenticated",
            "access_token": token,
            "expires_in": expires_in,
            "session_id": session.id,
            "technician": {
                "id": technician.id,
                "username": technician.username,
                "full_name": technician.full_name,
                "role": technician.role,
            },
        },
    )


def _update_door(
    db: Session, event: SerialAccessEvent, settings: Settings
) -> SerialAccessOutcome:
    code = event.incubator_code or settings.default_incubator_code
    session = db.get(AccessSession, event.session_id)
    if session is None or session.ended_at is not None:
        return SerialAccessOutcome(
            command={"type": "access", "action": "lock"},
            incubator_id=None,
            incubator_code=code,
            mqtt_payload={
                "event": "invalid_session",
                "session_id": event.session_id or 0,
                "recorded_at": datetime.now(UTC).isoformat(),
            },
        )
    incubator = db.get(Incubator, session.incubator_id)
    if incubator is None:
        return _deny(event, "incubator_not_found", settings)

    now = datetime.now(UTC)
    if event.door_open:
        if session.door_opened_at is None:
            session.door_opened_at = now
        event_name = "door_opened"
    else:
        if session.door_opened_at is None:
            session.door_opened_at = now
        session.door_closed_at = now
        session.ended_at = now
        session.ended_reason = "door_closed"
        db.add(
            DoorEvent(
                incubator_id=session.incubator_id,
                operator_id=session.technician_id,
                access_session_id=session.id,
                access_method="rfid",
                event_type="inspection",
                opened_at=session.door_opened_at,
                closed_at=now,
                eggs_added=0,
                eggs_removed=0,
            )
        )
        event_name = "door_closed"
    db.commit()
    return SerialAccessOutcome(
        command=None,
        incubator_id=incubator.id,
        incubator_code=incubator.code,
        mqtt_payload={
            "event": event_name,
            "session_id": session.id,
            "operator_id": session.technician_id,
            "method": "rfid",
            "recorded_at": now.isoformat(),
        },
        dashboard_payload={
            "type": event_name,
            "session_id": session.id,
            "session_closed": not bool(event.door_open),
            "servo_action": "unlock" if event.door_open else "lock",
            "servo_angle": (
                settings.access_servo_unlock_degrees
                if event.door_open
                else settings.access_servo_lock_degrees
            ),
        },
    )


def _cancel_access(
    db: Session, event: SerialAccessEvent, settings: Settings
) -> SerialAccessOutcome:
    code = event.incubator_code or settings.default_incubator_code
    session = db.get(AccessSession, event.session_id)
    now = datetime.now(UTC)
    incubator_id: int | None = None
    if session is not None:
        incubator_id = session.incubator_id
        if session.ended_at is None:
            session.ended_at = now
            session.ended_reason = "unlock_timeout"
            db.commit()
    return SerialAccessOutcome(
        command=None,
        incubator_id=incubator_id,
        incubator_code=code,
        mqtt_payload={
            "event": "access_cancelled",
            "session_id": event.session_id or 0,
            "method": "rfid",
            "recorded_at": now.isoformat(),
        },
        dashboard_payload={
            "type": "access_cancelled",
            "session_id": event.session_id or 0,
            "session_closed": True,
            "servo_action": "lock",
            "servo_angle": settings.access_servo_lock_degrees,
        },
    )


def process_serial_access_event(
    db: Session, event: SerialAccessEvent, settings: Settings
) -> SerialAccessOutcome:
    if event.kind == "rfid":
        return _authorize_rfid(db, event, settings)
    if event.kind == "door":
        return _update_door(db, event, settings)
    return _cancel_access(db, event, settings)
