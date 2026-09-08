from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from ..config import InitialIncubator, InitialTechnician
from ..models import ActuatorState, Incubator, IncubatorConfig, Technician
from ..security import hash_password

logger = logging.getLogger(__name__)


def ensure_initial_technicians(
    session_factory: sessionmaker[Session],
    configured: list[InitialTechnician],
) -> int:
    """Create configured technicians that are not already persisted.

    Existing accounts are intentionally left untouched so restarting the API never
    resets a password or changes the technician recorded in historical reports.
    """
    if not configured:
        return 0

    with session_factory() as db:
        existing = set(db.scalars(select(Technician.username)))
        created = 0
        for item in configured:
            username = item.username.lower()
            if username in existing:
                continue
            db.add(
                Technician(
                    username=username,
                    full_name=item.full_name.strip(),
                    age=item.age,
                    gender=item.gender.strip() if item.gender else None,
                    role=item.role,
                    rfid_uid=(
                        item.rfid_uid.replace(":", "")
                        .replace("-", "")
                        .replace(" ", "")
                        .upper()
                        if item.rfid_uid
                        else None
                    ),
                    password_hash=hash_password(item.password),
                )
            )
            existing.add(username)
            created += 1
        db.commit()

    if created:
        logger.info("Created %s initial SmartEgg technician account(s)", created)
    return created


def ensure_initial_incubators(
    session_factory: sessionmaker[Session],
    configured: list[InitialIncubator],
) -> int:
    """Create complete incubator nodes that are missing from the database."""
    if not configured:
        return 0

    with session_factory() as db:
        existing = set(db.scalars(select(Incubator.code)))
        created = 0
        for item in configured:
            if item.code in existing:
                continue
            incubator = Incubator(**item.model_dump())
            incubator.config = IncubatorConfig()
            db.add(incubator)
            db.flush()
            for kind in ("heater", "fan", "servo", "buzzer"):
                db.add(ActuatorState(incubator_id=incubator.id, kind=kind))
            existing.add(item.code)
            created += 1
        db.commit()

    if created:
        logger.info("Created %s initial SmartEgg incubator(s)", created)
    return created
