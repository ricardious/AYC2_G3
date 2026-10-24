from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import Alarm, EnergySample, Incubator
from app.schemas import TelemetryCreate
from app.services.energy import EnergyManager, desired_overrides, get_energy_config
from app.services.telemetry import ingest_telemetry

START = datetime(2026, 10, 23, 20, 0, tzinfo=UTC)  # 14:00 en Guatemala


def reading(db, seconds: float, heater: bool = True, **extra) -> None:  # type: ignore[no-untyped-def]
    data = {"incubator_code": "NODE-01", "temperature_c": 37.2, "humidity_pct": 55,
            "heater": heater, "fan": False, "buzzer": False, "system_enabled": True,
            "recorded_at": START + timedelta(seconds=seconds), **extra}
    ingest_telemetry(db, TelemetryCreate(**data))


def test_energy_accumulates_and_skips_gaps(client: TestClient, incubator) -> None:
    del incubator
    with client.app.state.session_factory() as db:
        for index in range(11):
            reading(db, index * 3.6)  # 36 s con el foco encendido
        reading(db, 300)  # hueco de más de 30 s: no se cobra
        samples = db.scalars(select(EnergySample).order_by(EnergySample.id)).all()
        # 40 W + relé 0.35 W + electrónica 1.06 W = 41.41 W
        assert samples[-2].power_w == 41.41
        assert round(samples[-2].energy_today_wh, 4) == round(41.41 * 36 / 3600, 4)
        assert samples[-1].energy_wh == 0
        assert samples[-1].cost_today_q == samples[-1].energy_today_wh / 1000 * 1.51


def test_heater_on_above_max_is_an_anomaly(client: TestClient, incubator) -> None:
    del incubator
    with client.app.state.session_factory() as db:
        reading(db, 0, temperature_c=38.5)
        reading(db, 2.6, temperature_c=38.5)
        alarm = db.scalar(select(Alarm).where(Alarm.kind == "energy_anomaly"))
        assert alarm is not None and alarm.resolved_at is None


def test_rules_priority_timer_limit_schedule(client: TestClient, incubator) -> None:
    del incubator
    with client.app.state.session_factory() as db:
        node = db.scalar(select(Incubator).where(Incubator.code == "NODE-01"))
        config = get_energy_config(db, node.id)
        config.schedules = [{"device": "fan", "start": "13:00", "end": "15:00",
                             "state": "on"}]
        config.limit_action = "heater_off"
        config.daily_limit_wh = 1
        rules = desired_overrides(config, 5, START, "America/Guatemala")
        assert rules["fan"].enabled is True
        assert (rules["heater"].enabled, rules["heater"].reason) == (False, "limite_diario")
        config.timer_device, config.timer_state = "heater", True
        config.timer_until = START + timedelta(minutes=5)
        assert desired_overrides(config, 5, START, "America/Guatemala")["heater"].reason == (
            "temporizador")
        db.commit()


def test_energy_command_and_manager(client: TestClient, incubator) -> None:
    del incubator
    listener = client.app.state.commands
    result = listener.handle(
        "NODE-01", "energia",
        b'{"timer":{"device":"fan","state":"on","minutes":10},"daily_limit_wh":900}')
    assert result["ok"] is True
    sent: list[dict[str, object]] = []
    manager = EnergyManager(client.app.state.session_factory, sent.append)
    manager.tick()
    assert sent == [{"type": "actuator", "kind": "fan", "enabled": True,
                     "mode": "manual", "value": None}]
    assert manager.tick() == []  # sin cambios no reenvía
    bad = listener.handle("NODE-01", "energia", b'{"limit_action":"apagar_todo"}')
    assert bad["ok"] is False
