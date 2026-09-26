from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
from fastapi.testclient import TestClient

from app.config import Settings
from app.services.mqtt import MqttPublisher, MqttSnapshot
from app.schemas import TelemetryCreate


class PublishResult:
    rc = mqtt.MQTT_ERR_SUCCESS

    def wait_for_publish(self, timeout: float) -> None:
        assert timeout == 2


class FakeClient:
    def __init__(self) -> None:
        self.on_connect = None
        self.on_connect_fail = None
        self.on_disconnect = None
        self.credentials: tuple[str, str | None] | None = None
        self.will: tuple[str, str, int, bool] | None = None
        self.connection: tuple[str, int, int] | None = None
        self.published: list[tuple[str, str | bytes, int, bool]] = []
        self.loop_started = False
        self.loop_stopped = False
        self.disconnected = False

    def username_pw_set(self, username: str, password: str | None) -> None:
        self.credentials = (username, password)

    def tls_set(self, **_kwargs: Any) -> None:
        pass

    def will_set(self, topic: str, payload: str, qos: int, retain: bool) -> None:
        self.will = (topic, payload, qos, retain)

    def connect_async(self, host: str, port: int, keepalive: int) -> None:
        self.connection = (host, port, keepalive)

    def loop_start(self) -> None:
        self.loop_started = True

    def publish(
        self, topic: str, payload: str | bytes, qos: int, retain: bool
    ) -> PublishResult:
        self.published.append((topic, payload, qos, retain))
        return PublishResult()

    def disconnect(self) -> None:
        self.disconnected = True

    def loop_stop(self) -> None:
        self.loop_stopped = True


def build_publisher() -> tuple[MqttPublisher, FakeClient]:
    fake = FakeClient()
    settings = Settings(
        mqtt_enabled=True,
        mqtt_host="broker",
        mqtt_username="smartegg",
        mqtt_password="secret",
        default_incubator_code="NODE-01",
    )
    publisher = MqttPublisher(settings, client_factory=lambda *_args, **_kwargs: fake)
    publisher.start()
    return publisher, fake


def test_start_configures_credentials_lwt_and_online_status() -> None:
    publisher, fake = build_publisher()

    assert fake.credentials == ("smartegg", "secret")
    assert fake.connection == ("broker", 1883, 60)
    assert fake.loop_started is True
    assert fake.will is not None
    assert fake.will[0] == "smartegg/NODE-01/status"
    assert json.loads(fake.will[1]) == {
        "status": "offline",
        "reason": "unexpected_disconnect",
    }
    assert fake.will[2:] == (1, True)

    assert fake.on_connect is not None
    fake.on_connect(fake, None, None, 0, None)

    topic, payload, qos, retained = fake.published[-1]
    assert topic == "smartegg/NODE-01/status"
    assert json.loads(payload)["status"] == "online"
    assert (qos, retained) == (1, True)
    assert publisher.connected is True


def test_snapshot_uses_documented_topics_qos_and_retained_messages() -> None:
    publisher, fake = build_publisher()
    recorded_at = datetime(2026, 9, 5, 18, 30, tzinfo=UTC)
    publisher.publish_snapshot(
        MqttSnapshot(
            node_code="NODE-01",
            temperature_c=39.5,
            humidity_pct=58.2,
            door_open=False,
            occupied_slots=8,
            available_slots=4,
            recorded_at=recorded_at,
            heater=False,
            fan=True,
            servo_angle=45,
            buzzer=True,
            critical_alarm={
                "kind": "temperature_high",
                "severity": "critical",
                "message": "Sobrecalentamiento detectado",
                "value": 39.5,
                "occurred_at": recorded_at.isoformat(),
            },
        )
    )

    messages = {
        topic: (payload, qos, retained)
        for topic, payload, qos, retained in fake.published
    }
    assert set(messages) == {
        "smartegg/NODE-01/sensores/temperatura",
        "smartegg/NODE-01/sensores/humedad",
        "smartegg/NODE-01/telemetria",
        "smartegg/NODE-01/actuadores/estado",
        "smartegg/NODE-01/alarmas/critica",
    }
    assert messages["smartegg/NODE-01/sensores/temperatura"][1:] == (0, True)
    assert messages["smartegg/NODE-01/actuadores/estado"][1:] == (1, True)
    assert messages["smartegg/NODE-01/alarmas/critica"][1:] == (1, True)
    telemetry = json.loads(messages["smartegg/NODE-01/telemetria"][0])
    assert telemetry["temperature_c"] == 39.5
    assert telemetry["available_slots"] == 4


def test_snapshot_clears_retained_alarm_when_none_is_active() -> None:
    publisher, fake = build_publisher()
    publisher.publish_snapshot(
        MqttSnapshot(
            node_code="NODE-01",
            temperature_c=37.5,
            humidity_pct=58,
            door_open=False,
            occupied_slots=2,
            available_slots=2,
            recorded_at=datetime.now(UTC),
            heater=False,
            fan=False,
            servo_angle=45,
            buzzer=False,
            critical_alarm=None,
        )
    )

    alarm = next(
        message
        for message in fake.published
        if message[0] == "smartegg/NODE-01/alarmas/critica"
    )
    assert alarm[1:] == (b"", 1, True)


def test_live_serial_telemetry_is_published_without_waiting_for_database() -> None:
    publisher, fake = build_publisher()
    publisher.publish_live_telemetry(
        TelemetryCreate(
            incubator_code="NODE-01",
            temperature_c=37.6,
            humidity_pct=58,
            occupied_slots=3,
            door_open=False,
            source="serial",
        )
    )

    topic, payload, qos, retained = fake.published[-1]
    assert topic == "smartegg/NODE-01/telemetria"
    assert (qos, retained) == (0, False)
    assert json.loads(payload)["occupied_slots"] == 3
    assert "available_slots" not in json.loads(payload)


def test_api_telemetry_publishes_database_snapshot(
    client: TestClient, auth_headers: dict[str, str], incubator: dict[str, object]
) -> None:
    captured: list[MqttSnapshot] = []
    client.app.state.mqtt.publish_snapshot = captured.append

    warning_response = client.post(
        "/api/v1/telemetry",
        headers=auth_headers,
        json={
            "incubator_code": incubator["code"],
            "temperature_c": 38.5,
            "humidity_pct": 58,
            "source": "simulator",
        },
    )
    critical_response = client.post(
        "/api/v1/telemetry",
        headers=auth_headers,
        json={
            "incubator_code": incubator["code"],
            "temperature_c": 40,
            "humidity_pct": 58,
            "servo_angle": 45,
            "source": "simulator",
        },
    )

    assert warning_response.status_code == 201
    assert critical_response.status_code == 201
    assert len(captured) == 2
    assert captured[0].critical_alarm is None
    assert captured[1].node_code == "NODE-01"
    assert captured[1].fan is True
    assert captured[1].buzzer is True
    assert captured[1].critical_alarm is not None
    assert captured[1].critical_alarm["kind"] == "temperature_high"
