from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import Alarm, AnomalyScore
from app.services.anomalies import AnomalyListener, record_anomaly_result

NORMAL = {"puntaje": 0.95, "umbral": 1.17, "anomalia": False, "alerta": False,
          "causa": None, "lectura_at": "2026-10-23T20:00:00+00:00"}
ALERT = {"puntaje": 9.8, "umbral": 1.17, "anomalia": True, "alerta": True,
         "causa": "temperatura fuera de lo normal",
         "lectura_at": "2026-10-23T20:00:08+00:00"}


class FakeMessage:
    def __init__(
        self, topic: str, payload: dict[str, Any], retain: bool = False
    ) -> None:
        self.topic = topic
        self.payload = json.dumps(payload).encode()
        self.retain = retain


class FakeClient:
    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        self.subscribed: list[tuple[str, int]] = []
        self.on_connect = self.on_message = None

    def username_pw_set(self, *_args: Any) -> None:
        pass

    def connect_async(self, *_args: Any) -> None:
        pass

    def loop_start(self) -> None:
        pass

    def subscribe(self, topic: str, qos: int) -> None:
        self.subscribed.append((topic, qos))


def open_alarms(db) -> list[Alarm]:  # type: ignore[no-untyped-def]
    return list(db.scalars(select(Alarm).where(
        Alarm.kind == "ml_anomaly", Alarm.resolved_at.is_(None))))


def test_alert_opens_and_closes_the_ml_alarm(client: TestClient, incubator) -> None:
    del incubator
    with client.app.state.session_factory() as db:
        assert record_anomaly_result(db, "NODE-01", NORMAL) is not None
        assert open_alarms(db) == []

        row = record_anomaly_result(db, "NODE-01", ALERT)
        assert row is not None
        assert row.alert is True
        assert row.recorded_at.isoformat().startswith("2026-10-23T20:00:08")
        [alarm] = open_alarms(db)
        assert alarm.severity == "warning"
        assert "temperatura fuera de lo normal" in alarm.message

        later = {**NORMAL, "lectura_at": "2026-10-23T20:00:20+00:00"}
        record_anomaly_result(db, "NODE-01", later)
        assert open_alarms(db) == []
        assert len(db.scalars(select(AnomalyScore)).all()) == 3


def test_unknown_node_is_ignored(client: TestClient) -> None:
    with client.app.state.session_factory() as db:
        assert record_anomaly_result(db, "NODE-99", ALERT) is None


def test_listener_stores_live_results_only(client: TestClient, incubator) -> None:
    del incubator
    listener = AnomalyListener(
        client.app.state.settings.model_copy(update={"mqtt_enabled": True}),
        client.app.state.session_factory,
        client_factory=FakeClient,
    )
    listener.start()
    fake = listener._client  # noqa: SLF001
    assert isinstance(fake, FakeClient)
    fake.on_connect(fake, None, None, 0, None)
    assert fake.subscribed == [("smartegg/+/ml/anomalia", 0)]

    fake.on_message(fake, None, FakeMessage("smartegg/NODE-01/ml/anomalia", ALERT,
                                            retain=True))
    fake.on_message(fake, None, FakeMessage("smartegg/NODE-01/vision/resultado", ALERT))
    fake.on_message(fake, None, FakeMessage("smartegg/NODE-01/ml/anomalia",
                                            {"puntaje": "x"}))
    with client.app.state.session_factory() as db:
        assert db.scalars(select(AnomalyScore)).all() == []

    fake.on_message(fake, None, FakeMessage("smartegg/NODE-01/ml/anomalia", ALERT))
    with client.app.state.session_factory() as db:
        assert len(db.scalars(select(AnomalyScore)).all()) == 1
        assert len(open_alarms(db)) == 1
