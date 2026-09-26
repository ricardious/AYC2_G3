from __future__ import annotations

import secrets
import unicodedata
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


def _lcd_operator_name(full_name: str) -> str:
    ascii_name = (
        unicodedata.normalize("NFKD", full_name)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    # The LCD scrolls long names during the greeting; the serial buffer holds 32.
    return " ".join(ascii_name.upper().split())[:32]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def close_stale_access_sessions(db: Session, incubator_id: int, now: datetime) -> None:
    """Cierra las sesiones que el nodo ya no tiene abiertas.

    El nodo sólo envía una tarjeta cuando no tiene ninguna sesión en curso, así
    que una sesión abierta en la base de datos a esa altura es un cierre que se
    perdió (reinicio del ESP32, puerto serie caído, backend reiniciado). Antes
    bloqueaba la puerta hasta que caducaba el token, ocho horas.
    """
    open_sessions = db.scalars(
        select(AccessSession).where(
            AccessSession.incubator_id == incubator_id,
            AccessSession.ended_at.is_(None),
        )
    )
    for stale in open_sessions:
        stale.ended_at = now
        if _as_utc(stale.expires_at) <= now:
            stale.ended_reason = "expired"
            continue
        stale.ended_reason = "replaced"
        # Si llegó a abrirse, la apertura queda registrada aunque no se sepa
        # cuándo cerró.
        if stale.door_opened_at is not None:
            db.add(
                DoorEvent(
                    incubator_id=incubator_id,
                    operator_id=stale.technician_id,
                    access_session_id=stale.id,
                    access_method=stale.method,
                    event_type="inspection",
                    opened_at=stale.door_opened_at,
                    closed_at=None,
                    eggs_added=0,
                    eggs_removed=0,
                )
            )


def build_serial_access_denial(
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
    authorization = db.execute(
        select(Technician, Incubator)
        .join(
            TechnicianIncubator,
            TechnicianIncubator.technician_id == Technician.id,
        )
        .join(Incubator, Incubator.id == TechnicianIncubator.incubator_id)
        .where(
            Incubator.code == code,
            Technician.rfid_uid == event.uid,
            Technician.is_active.is_(True),
            Technician.role == "operator",
        )
    ).one_or_none()
    if authorization is None:
        incubator = db.scalar(select(Incubator).where(Incubator.code == code))
        if incubator is None:
            return build_serial_access_denial(event, "incubator_not_found", settings)
        denied = build_serial_access_denial(event, "card_not_authorized", settings)
        return replace(denied, incubator_id=incubator.id)
    technician, incubator = authorization

    now = datetime.now(UTC)
    close_stale_access_sessions(db, incubator.id, now)

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
            "operator_name": _lcd_operator_name(technician.full_name),
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
        return build_serial_access_denial(event, "incubator_not_found", settings)

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
