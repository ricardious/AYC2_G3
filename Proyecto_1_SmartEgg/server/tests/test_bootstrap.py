from sqlalchemy import select

from app.config import InitialIncubator, InitialTechnician
from app.database import Base, build_session_factory, create_engine
from app.models import ActuatorState, Incubator, Technician
from app.services import bootstrap


def test_initial_technicians_are_created_once(tmp_path, monkeypatch) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'bootstrap.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)
    monkeypatch.setattr(bootstrap, "hash_password", lambda value: f"hash:{value}")
    configured = [
        InitialTechnician(
            username="Admin",
            full_name="Técnico Principal",
            password="password123",
        )
    ]

    assert bootstrap.ensure_initial_technicians(session_factory, configured) == 1
    assert bootstrap.ensure_initial_technicians(session_factory, configured) == 0

    with session_factory() as db:
        technicians = list(db.scalars(select(Technician)))
        assert len(technicians) == 1
        assert technicians[0].username == "admin"
        assert technicians[0].password_hash == "hash:password123"

    engine.dispose()


def test_initial_incubator_is_created_with_config_and_actuators(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'incubator.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)
    configured = [
        InitialIncubator(
            code="NODE-01",
            name="Incubadora principal",
            capacity=4,
            serial_number="ARDUINO-UNO-R3",
        )
    ]

    assert bootstrap.ensure_initial_incubators(session_factory, configured) == 1
    assert bootstrap.ensure_initial_incubators(session_factory, configured) == 0

    with session_factory() as db:
        incubator = db.scalar(select(Incubator))
        assert incubator is not None
        assert incubator.code == "NODE-01"
        assert incubator.config.rotation_interval_seconds == 120
        assert set(db.scalars(select(ActuatorState.kind))) == {
            "heater",
            "fan",
            "servo",
            "buzzer",
        }

    engine.dispose()
