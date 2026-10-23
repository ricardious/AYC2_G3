from __future__ import annotations

import json
import time

import paho.mqtt.client as mqtt
import pytest

from app.config import Settings
from app.main import create_app
from app.schemas import TelemetryCreate
from app.services.gateway_link import GatewayLink
from app.services.serial_bridge import SerialAccessEvent


class PublishResult:
    rc = mqtt.MQTT_ERR_SUCCESS


class FakeMessage:
    def __init__(self, topic: str, payload: str) -> None:
        self.topic = topic
        self.payload = payload.encode()


class FakeClient:
    def __init__(self) -> None:
        self.on_connect = None
        self.on_message = None
        self.subscribed: list[tuple[str, int]] = []
        self.published: list[tuple[str, str, int, bool]] = []
        self.connection: tuple[str, int, int] | None = None

    def username_pw_set(self, _username: str, _password: str | None) -> None:
        pass

    def connect_async(self, host: str, port: int, keepalive: int) -> None:
        self.connection = (host, port, keepalive)

    def loop_start(self) -> None:
        pass

    def loop_stop(self) -> None:
        pass

    def disconnect(self) -> None:
        pass

    def subscribe(self, topics: list[tuple[str, int]]) -> None:
        self.subscribed.extend(topics)

    def publish(
        self, topic: str, payload: str, qos: int, retain: bool
    ) -> PublishResult:
        self.published.append((topic, payload, qos, retain))
        return PublishResult()


SETTINGS = Settings(
    mqtt_enabled=True,
    mqtt_host="broker",
    mqtt_username="smartegg",
    mqtt_password="secret",
    default_incubator_code="NODE-01",
)


def build_link(
    payloads: list[TelemetryCreate] | None = None,
    live: list[TelemetryCreate] | None = None,
    access: list[SerialAccessEvent] | None = None,
) -> tuple[GatewayLink, FakeClient]:
    fake = FakeClient()
    link = GatewayLink(
        SETTINGS,
        on_payload=(payloads if payloads is not None else []).append,
        on_live_payload=(live if live is not None else []).append,
        on_access_event=(access if access is not None else []).append,
        client_factory=lambda *_args, **_kwargs: fake,
    )
    link.start()
    fake.on_connect(fake, None, None, 0, None)
    return link, fake


def gateway_status(fake: FakeClient, **payload: str) -> None:
    fake.on_message(
        fake, None, FakeMessage("smartegg/NODE-01/gateway/status", json.dumps(payload))
    )


def test_subscribes_to_gateway_lines_and_status() -> None:
    link, fake = build_link()

    assert fake.connection == ("broker", 1883, 60)
    assert fake.subscribed == [
        ("smartegg/NODE-01/gateway/rx", 1),
        ("smartegg/NODE-01/gateway/status", 1),
    ]
    link.stop()


def test_connected_only_while_gateway_reports_the_serial_port() -> None:
    link, fake = build_link()
    assert link.connected is False

    gateway_status(fake, status="online", serial="disconnected")
    assert link.connected is False
    assert link.last_error == "Gateway online without the ESP32 serial port"

    gateway_status(fake, status="online", serial="connected")
    assert link.connected is True
    assert link.last_error is None

    gateway_status(fake, status="offline", reason="unexpected_disconnect")
    assert link.connected is False
    assert link.last_error == "Gateway offline: unexpected_disconnect"
    link.stop()


def test_telemetry_line_is_published_live_and_queued_for_persistence() -> None:
    payloads: list[TelemetryCreate] = []
    live: list[TelemetryCreate] = []
    link, fake = build_link(payloads=payloads, live=live)

    fake.on_message(
        fake,
        None,
        FakeMessage(
            "smartegg/NODE-01/gateway/rx",
            "MSG:1,TEMP:37.52,HUM:58.1,DOOR:0,SLOTS:3,HEATER:0,FAN:1,SERVO:-45,"
            "BUZZER:0,POWER:1,SENSOR:1",
        ),
    )
    deadline = time.monotonic() + 2
    while not payloads and time.monotonic() < deadline:
        time.sleep(0.01)
    link.stop()

    assert live[0].temperature_c == pytest.approx(37.52)
    assert payloads[0].incubator_code == "NODE-01"
    assert payloads[0].occupied_slots == 3
    assert link.last_message_at is not None


def test_rfid_line_reaches_the_access_handler() -> None:
    access: list[SerialAccessEvent] = []
    link, fake = build_link(access=access)

    fake.on_message(
        fake, None, FakeMessage("smartegg/NODE-01/gateway/rx", "RFID:A1B2C3D4")
    )
    link.stop()

    assert access == [
        SerialAccessEvent(kind="rfid", uid="A1B2C3D4", incubator_code="NODE-01")
    ]


def test_commands_are_published_to_the_gateway() -> None:
    link, fake = build_link()
    with pytest.raises(RuntimeError):
        link.send_command({"type": "rotate", "angle_degrees": 30})

    gateway_status(fake, status="online", serial="connected")
    link.send_command({"type": "rotate", "angle_degrees": 30})
    link.stop()

    assert fake.published == [
        (
            "smartegg/NODE-01/gateway/tx",
            '{"type":"rotate","angle_degrees":30}',
            1,
            False,
        )
    ]


def test_app_uses_the_gateway_link_when_configured(tmp_path) -> None:
    app = create_app(
        Settings(
            database_url=f"sqlite:///{tmp_path / 'test.db'}",
            jwt_secret="test-only-secret-that-is-long-enough-for-tests",
            node_transport="gateway",
            mqtt_enabled=False,
        )
    )

    assert isinstance(app.state.serial_bridge, GatewayLink)
