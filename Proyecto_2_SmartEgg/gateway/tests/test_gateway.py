from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path
from typing import Any

import serial

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gateway import Gateway, GatewayConfig  # noqa: E402, I001


class FakeMessage:
    def __init__(self, topic: str, payload: bytes) -> None:
        self.topic = topic
        self.payload = payload


class FakeClient:
    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        self.published: list[tuple[str, str, int, bool]] = []
        self.subscribed: list[tuple[str, int]] = []
        self.will: tuple[str, str, int, bool] | None = None
        self.on_connect = self.on_disconnect = self.on_message = None

    def username_pw_set(self, *_args: Any) -> None:
        pass

    def will_set(self, topic: str, payload: str, qos: int, retain: bool) -> None:
        self.will = (topic, payload, qos, retain)

    def max_queued_messages_set(self, _count: int) -> None:
        pass

    def reconnect_delay_set(self, **_kwargs: Any) -> None:
        pass

    def connect_async(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    def loop_start(self) -> None:
        pass

    def loop_stop(self) -> None:
        pass

    def disconnect(self) -> None:
        pass

    def subscribe(self, topic: str, qos: int) -> None:
        self.subscribed.append((topic, qos))

    def publish(self, topic: str, payload: str, qos: int, retain: bool) -> None:
        self.published.append((topic, payload, qos, retain))


CONFIG = GatewayConfig(
    serial_port="loop://",
    baudrate=115200,
    mqtt_host="broker",
    mqtt_port=1883,
    mqtt_username="smartegg-gateway",
    mqtt_password="secret",
    node_code="NODE-01",
    client_id="test-gateway",
    reconnect_seconds=0.05,
)


def build_gateway() -> tuple[Gateway, FakeClient]:
    fake = FakeClient()
    gateway = Gateway(
        CONFIG,
        serial_factory=serial.serial_for_url,
        client_factory=lambda *_args, **_kwargs: fake,
    )
    gateway.start_mqtt()
    return gateway, fake


def published_on(fake: FakeClient, topic: str) -> list[str]:
    return [payload for name, payload, _qos, _retain in fake.published if name == topic]


def test_registers_retained_last_will() -> None:
    _gateway, fake = build_gateway()

    topic, payload, qos, retain = fake.will
    assert topic == "smartegg/NODE-01/gateway/status"
    assert json.loads(payload)["status"] == "offline"
    assert (qos, retain) == (1, True)


def test_connect_subscribes_to_commands_and_reports_online() -> None:
    gateway, fake = build_gateway()

    fake.on_connect(fake, None, None, 0, None)

    assert fake.subscribed == [("smartegg/NODE-01/gateway/tx", 1)]
    status = json.loads(published_on(fake, gateway.status_topic)[-1])
    assert status["status"] == "online"
    assert status["serial"] == "disconnected"


def test_command_is_dropped_while_serial_is_closed() -> None:
    gateway, fake = build_gateway()

    fake.on_message(fake, None, FakeMessage(gateway.tx_topic, b'{"type":"rotate"}'))

    assert gateway.write_serial('{"type":"rotate"}') is False


def test_serial_lines_and_commands_cross_the_bridge() -> None:
    gateway, fake = build_gateway()
    worker = threading.Thread(target=gateway.run_serial, daemon=True)
    worker.start()
    try:
        deadline = time.monotonic() + 2
        while not gateway.serial_connected and time.monotonic() < deadline:
            time.sleep(0.01)
        assert gateway.serial_connected

        # loop:// devuelve lo escrito: el comando sale por el serial y la
        # misma línea vuelve como si la hubiera enviado la ESP32.
        command = b'{"type":"actuator","kind":"fan","enabled":true,"mode":"manual"}'
        fake.on_message(fake, None, FakeMessage(gateway.tx_topic, command))
        deadline = time.monotonic() + 2
        while not published_on(fake, gateway.rx_topic) and time.monotonic() < deadline:
            time.sleep(0.01)
    finally:
        gateway.stop()
        worker.join(timeout=2)

    assert published_on(fake, gateway.rx_topic) == [command.decode()]
    statuses = [json.loads(p) for p in published_on(fake, gateway.status_topic)]
    assert statuses[0]["serial"] == "connected"
    assert statuses[-1]["reason"] == "graceful_shutdown"


def build_camera_gateway(fetcher) -> tuple[Gateway, FakeClient]:  # type: ignore[no-untyped-def]
    fake = FakeClient()
    config = GatewayConfig(**{**CONFIG.__dict__, "camera_url": "http://camara/shot.jpg"})
    gateway = Gateway(
        config,
        serial_factory=serial.serial_for_url,
        client_factory=lambda *_args, **_kwargs: fake,
        photo_fetcher=fetcher,
    )
    gateway.start_mqtt()
    return gateway, fake


def test_camera_photo_is_published_without_retain() -> None:
    photo = b"\xff\xd8 jpeg \xff\xd9"
    gateway, fake = build_camera_gateway(lambda _url: photo)

    assert gateway.capture_photo() is True

    photos = [entry for entry in fake.published if entry[0] == "smartegg/NODE-01/camara/foto"]
    assert photos == [("smartegg/NODE-01/camara/foto", photo, 0, False)]
    status = json.loads(published_on(fake, gateway.status_topic)[-1])
    assert status["camera"] == "ok"


def test_camera_failure_is_reported_once_in_status() -> None:
    def broken(_url: str) -> bytes:
        raise OSError("connection refused")

    gateway, fake = build_camera_gateway(broken)

    assert gateway.capture_photo() is False
    assert gateway.capture_photo() is False

    statuses = [json.loads(p) for p in published_on(fake, gateway.status_topic)]
    assert [s["camera"] for s in statuses] == ["error"]
    assert not [entry for entry in fake.published if entry[0].endswith("camara/foto")]


def test_camera_rejects_responses_that_are_not_jpeg() -> None:
    gateway, fake = build_camera_gateway(lambda _url: b"<html>login</html>")

    assert gateway.capture_photo() is False
    assert not [entry for entry in fake.published if entry[0].endswith("camara/foto")]
