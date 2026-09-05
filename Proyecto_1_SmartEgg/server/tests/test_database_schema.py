from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.door_events import close_door_event, create_door_event
from app.database import Base, build_session_factory, create_engine
from app.models import DoorEvent, Incubator, IncubatorConfig, Technician
from app.schemas import DoorEventClose, DoorEventCreate, TelemetryCreate
from app.services.telemetry import ingest_telemetry


def test_door_event_records_operator_and_egg_movement(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'door-events.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        operator = Technician(
            username="operador1",
            full_name="Operador de Prueba",
            age=28,
            gender="no especificado",
            password_hash="test-hash",
        )
        incubator = Incubator(code="NODE-01", name="Principal", capacity=12)
        incubator.config = IncubatorConfig()
        db.add_all([operator, incubator])
        db.commit()
        db.refresh(operator)
        db.refresh(incubator)

        event = create_door_event(
            incubator_id=incubator.id,
            payload=DoorEventCreate(event_type="egg_entry", eggs_added=4),
            db=db,
            operator=operator,
        )
        assert event.operator_id == operator.id
        assert event.eggs_added == 4
        assert event.closed_at is None

        with pytest.raises(HTTPException) as duplicate:
            create_door_event(
                incubator_id=incubator.id,
                payload=DoorEventCreate(event_type="inspection"),
                db=db,
                operator=operator,
            )
        assert duplicate.value.status_code == 409

        closed = close_door_event(
            incubator_id=incubator.id,
            event_id=event.id,
            payload=DoorEventClose(closed_at=datetime.now(UTC)),
            db=db,
        )
        assert closed.closed_at is not None
        assert db.scalar(select(DoorEvent).where(DoorEvent.id == event.id)) is closed

        reading = ingest_telemetry(
            db,
            TelemetryCreate(
                incubator_code=incubator.code,
                temperature_c=37.5,
                humidity_pct=58,
                source="simulator",
            ),
        )
        assert reading.occupied_slots == 0
        assert reading.available_slots == incubator.capacity

    engine.dispose()


def test_door_event_payload_enforces_consistent_counts() -> None:
    with pytest.raises(ValueError, match="egg_entry requires eggs_added"):
        DoorEventCreate(event_type="egg_entry", eggs_added=0)

    with pytest.raises(ValueError, match="cannot change egg counts"):
        DoorEventCreate(event_type="inspection", eggs_added=1)
