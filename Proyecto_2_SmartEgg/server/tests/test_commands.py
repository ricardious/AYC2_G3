from __future__ import annotations

import json

from fastapi.testclient import TestClient


def listener_with_node(client: TestClient) -> tuple[object, list[dict[str, object]]]:
    sent: list[dict[str, object]] = []
    listener = client.app.state.commands
    listener.send_to_node = sent.append
    return listener, sent


def test_actuator_command_is_recorded_and_forwarded(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    listener, sent = listener_with_node(client)

    result = listener.handle(
        "NODE-01",
        "actuador",
        json.dumps(
            {"kind": "fan", "enabled": True, "mode": "manual", "request_id": "a1"}
        ).encode(),
    )

    assert result["ok"] is True
    assert result["delivered"] is True
    assert result["request_id"] == "a1"
    assert sent == [
        {
            "type": "actuator",
            "kind": "fan",
            "enabled": True,
            "mode": "manual",
            "value": None,
        }
    ]
    actuators = client.get(
        f"/api/v1/incubators/{incubator['id']}/actuators", headers=auth_headers
    ).json()
    fan = next(item for item in actuators if item["kind"] == "fan")
    assert (fan["enabled"], fan["mode"]) == (True, "manual")


def test_rotation_command_records_event_with_signed_angle(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    listener, sent = listener_with_node(client)

    result = listener.handle(
        "NODE-01", "rotar", b'{"angle_degrees":30,"direction":"left"}'
    )

    assert result["ok"] is True
    assert sent == [{"type": "rotate", "angle_degrees": -30}]
    rotations = client.get(
        f"/api/v1/incubators/{incubator['id']}/rotations", headers=auth_headers
    ).json()
    assert rotations[0]["direction"] == "left"
    assert rotations[0]["source"] == "manual"


def test_config_command_updates_thresholds(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    listener, sent = listener_with_node(client)
    config = {
        "temperature_min_c": 37.2,
        "temperature_max_c": 38.1,
        "humidity_min_pct": 52,
        "humidity_max_pct": 62,
        "critical_temperature_c": 39.5,
        "rotation_interval_seconds": 300,
        "rotation_angle_degrees": 40,
    }

    result = listener.handle("NODE-01", "config", json.dumps(config).encode())

    assert result["ok"] is True
    assert sent[0]["type"] == "config"
    stored = client.get(
        f"/api/v1/incubators/{incubator['id']}/config", headers=auth_headers
    ).json()
    assert stored["temperature_min_c"] == 37.2
    assert stored["rotation_interval_seconds"] == 300


def test_invalid_commands_are_rejected_without_reaching_the_node(
    client: TestClient, incubator: dict
) -> None:
    listener, sent = listener_with_node(client)

    unknown_node = listener.handle("NODE-99", "rotar", b'{"angle_degrees":30}')
    bad_payload = listener.handle("NODE-01", "rotar", b'{"angle_degrees":500}')
    bad_json = listener.handle("NODE-01", "actuador", b"encender")
    bad_kind = listener.handle("NODE-01", "actuador", b'{"kind":"lamp","enabled":true}')

    assert unknown_node["error"] == "rejected"
    assert bad_payload["error"] == "invalid_payload"
    assert bad_json["error"] == "rejected"
    assert bad_kind["error"] == "rejected"
    assert sent == []


def test_command_is_recorded_when_gateway_is_offline(
    client: TestClient, incubator: dict
) -> None:
    # The serial bridge is disabled in tests, so sending raises RuntimeError.
    result = client.app.state.commands.handle(
        "NODE-01", "actuador", b'{"kind":"heater","enabled":false}'
    )

    assert result["ok"] is True
    assert result["delivered"] is False
