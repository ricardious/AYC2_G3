from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.services.serial_bridge import parse_serial_access_event, parse_serial_line
from app.services.system_lock import (
    LOCK_COMMAND,
    UNLOCK_COMMAND,
    SystemLock,
    VisionListener,
)

DETECTED = {"clase": "objeto", "objeto_detectado": True}
CLEAR = {"clase": "huevo", "objeto_detectado": False}


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def build_lock() -> tuple[SystemLock, list[dict[str, object]], Clock]:
    sent: list[dict[str, object]] = []
    clock = Clock()
    lock = SystemLock(
        sent.append, resend_seconds=5, unlock_grace_seconds=30, clock=clock
    )
    return lock, sent, clock


def test_confirmed_object_sends_lock_once_until_node_confirms() -> None:
    lock, sent, clock = build_lock()

    assert lock.on_vision_result("NODE-01", CLEAR) is False
    assert lock.on_vision_result("NODE-01", DETECTED) is True
    clock.now += 1
    assert lock.on_vision_result("NODE-01", DETECTED) is False  # throttled
    clock.now += 5
    assert lock.on_vision_result("NODE-01", DETECTED) is True   # not confirmed yet
    lock.observe("NODE-01", True)
    clock.now += 10
    assert lock.on_vision_result("NODE-01", DETECTED) is False  # already locked

    assert sent == [LOCK_COMMAND, LOCK_COMMAND]
    assert lock.is_locked("NODE-01") is True


def test_card_unlock_gives_time_to_remove_the_object() -> None:
    lock, sent, clock = build_lock()
    lock.observe("NODE-01", True)

    assert lock.unlock("NODE-01") is True
    clock.now += 20
    assert lock.on_vision_result("NODE-01", DETECTED) is False  # grace period
    clock.now += 11
    assert lock.on_vision_result("NODE-01", DETECTED) is True   # object still there

    assert sent == [UNLOCK_COMMAND, LOCK_COMMAND]


def test_unlock_is_a_no_op_when_the_node_is_not_locked() -> None:
    lock, sent, _clock = build_lock()
    lock.observe("NODE-01", False)

    assert lock.unlock("NODE-01") is False
    assert sent == []


def test_lock_failure_is_reported_without_raising() -> None:
    def offline(_command: dict[str, object]) -> None:
        raise RuntimeError("Gateway is not connected")

    lock = SystemLock(offline)

    assert lock.on_vision_result("NODE-01", DETECTED) is False


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


def test_vision_listener_locks_on_live_results_only() -> None:
    lock, sent, _clock = build_lock()
    fake = FakeClient()
    listener = VisionListener(
        Settings(mqtt_enabled=True), lock, client_factory=lambda *_a, **_k: fake
    )
    listener.start()
    fake.on_connect(fake, None, None, 0, None)
    topic = "smartegg/NODE-01/vision/resultado"

    fake.on_message(fake, None, FakeMessage(topic, DETECTED, retain=True))
    assert sent == []
    fake.on_message(fake, None, FakeMessage(topic, DETECTED))

    assert fake.subscribed == [("smartegg/+/vision/resultado", 0)]
    assert sent == [LOCK_COMMAND]


def test_commands_are_rejected_while_the_node_is_locked(
    client: TestClient, incubator: dict
) -> None:
    del incubator
    sent: list[dict[str, object]] = []
    client.app.state.commands.send_to_node = sent.append
    client.app.state.system_lock.observe("NODE-01", True)

    result = client.app.state.commands.handle(
        "NODE-01", "rotar", b'{"angle_degrees":30,"direction":"left"}'
    )

    assert result["ok"] is False
    assert result["error"] == "system_locked"
    assert sent == []


def test_live_telemetry_updates_the_lock_state(client: TestClient) -> None:
    handler = client.app.state.serial_bridge.on_live_payload

    handler(parse_serial_line("MSG:1,TEMP:37.5,HUM:58,LOCK:1", "NODE-01"))
    assert client.app.state.system_lock.is_locked("NODE-01") is True
    handler(parse_serial_line("MSG:1,TEMP:37.5,HUM:58,LOCK:0", "NODE-01"))
    assert client.app.state.system_lock.is_locked("NODE-01") is False


def test_authorized_card_unlocks_before_opening_the_door(
    client: TestClient, operator_headers: dict[str, str], monkeypatch
) -> None:
    del operator_headers
    app = client.app
    sent: list[dict[str, object]] = []
    events: list[dict[str, object]] = []
    monkeypatch.setattr(app.state.serial_bridge, "send_command", sent.append)
    monkeypatch.setattr(
        app.state.mqtt,
        "publish_access_event",
        lambda _node, payload: events.append(payload),
    )
    app.state.system_lock.observe("NODE-01", True)

    app.state.serial_bridge.on_access_event(
        parse_serial_access_event("RFID:A1B2C3D4", "NODE-01")
    )

    assert sent[0] == UNLOCK_COMMAND
    assert sent[1]["type"] == "access" and sent[1]["authorized"] is True
    assert [event["event"] for event in events] == ["system_unlocked", "authorized"]
    assert app.state.system_lock.is_locked("NODE-01") is False


def test_unknown_card_does_not_unlock(
    client: TestClient, incubator: dict, monkeypatch
) -> None:
    del incubator
    app = client.app
    sent: list[dict[str, object]] = []
    monkeypatch.setattr(app.state.serial_bridge, "send_command", sent.append)
    app.state.system_lock.observe("NODE-01", True)

    app.state.serial_bridge.on_access_event(
        parse_serial_access_event("RFID:00112233", "NODE-01")
    )

    assert UNLOCK_COMMAND not in sent
    assert app.state.system_lock.is_locked("NODE-01") is True
