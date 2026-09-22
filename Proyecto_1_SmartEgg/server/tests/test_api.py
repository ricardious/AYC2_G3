from datetime import UTC, datetime

from fastapi.testclient import TestClient


def test_health_and_authentication(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/v1/incubators").status_code == 401
    first = client.post(
        "/api/v1/auth/bootstrap",
        json={
            "username": "admin",
            "full_name": "Ana Técnica",
            "age": 31,
            "gender": "femenino",
            "password": "password123",
        },
    )
    assert first.status_code == 201
    assert (
        client.post(
            "/api/v1/auth/bootstrap",
            json={
                "username": "other",
                "full_name": "Otro Técnico",
                "password": "password123",
            },
        ).status_code
        == 409
    )
    login = client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "password123"}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert (
        client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        ).json()["full_name"]
        == "Ana Técnica"
    )
    assert login.json()["technician"]["age"] == 31
    assert login.json()["technician"]["gender"] == "femenino"


def test_lot_egg_capacity_and_slot_reuse(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    lot = client.post(
        "/api/v1/lots",
        headers=auth_headers,
        json={
            "code": "LOTE-A",
            "species": "Gallina",
            "started_on": datetime.now(UTC).date().isoformat(),
        },
    )
    assert lot.status_code == 201, lot.text
    egg_payload = {
        "code": "H-001",
        "lot_id": lot.json()["id"],
        "incubator_id": incubator["id"],
        "slot_number": 1,
    }
    egg = client.post("/api/v1/eggs", headers=auth_headers, json=egg_payload)
    assert egg.status_code == 201, egg.text
    duplicate_slot = client.post(
        "/api/v1/eggs", headers=auth_headers, json={**egg_payload, "code": "H-002"}
    )
    assert duplicate_slot.status_code == 409
    assert (
        client.patch(
            f"/api/v1/eggs/{egg.json()['id']}",
            headers=auth_headers,
            json={"status": "removed"},
        ).status_code
        == 200
    )
    reused = client.post(
        "/api/v1/eggs", headers=auth_headers, json={**egg_payload, "code": "H-002"}
    )
    assert reused.status_code == 201
    occupancy = client.get(
        f"/api/v1/incubators/{incubator['id']}/occupancy", headers=auth_headers
    ).json()
    assert occupancy == {"capacity": 4, "occupied": 1, "available": 3}


def test_telemetry_updates_state_and_alarm(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    reading = client.post(
        "/api/v1/telemetry",
        headers=auth_headers,
        json={
            "incubator_code": incubator["code"],
            "temperature_c": 39.5,
            "humidity_pct": 40,
            "door_open": True,
            "occupied_slots": 2,
            "source": "simulator",
        },
    )
    assert reading.status_code == 201, reading.text
    state = client.get(
        f"/api/v1/incubators/{incubator['id']}/state", headers=auth_headers
    )
    assert state.status_code == 200, state.text
    body = state.json()
    assert body["latest"]["temperature_c"] == 39.5
    assert {sensor["code"] for sensor in body["sensors"]} == {
        "temperature",
        "humidity",
        "door",
        "slots",
    }
    enabled = {item["kind"]: item["enabled"] for item in body["actuators"]}
    assert (
        enabled["fan"] is True
        and enabled["buzzer"] is True
        and enabled["heater"] is False
    )
    assert {alarm["kind"] for alarm in body["active_alarms"]} == {
        "temperature_high",
        "humidity_low",
        "door_open",
    }

    normalized = client.post(
        "/api/v1/telemetry",
        headers=auth_headers,
        json={
            "incubator_code": incubator["code"],
            "temperature_c": 37.5,
            "humidity_pct": 58,
            "door_open": False,
        },
    )
    assert normalized.status_code == 201
    assert (
        client.get(
            f"/api/v1/incubators/{incubator['id']}/alarms?active_only=true",
            headers=auth_headers,
        ).json()
        == []
    )
    stats = client.get(
        f"/api/v1/incubators/{incubator['id']}/telemetry/stats", headers=auth_headers
    ).json()
    assert stats["samples"] == 2
    assert stats["temperature_max_c"] == 39.5
    assert reading.json()["available_slots"] == 2


def test_door_events_are_audited(
    client: TestClient, operator_headers: dict[str, str], incubator: dict
) -> None:
    created = client.post(
        f"/api/v1/incubators/{incubator['id']}/door-events",
        headers=operator_headers,
        json={
            "event_type": "egg_entry",
            "eggs_added": 2,
            "notes": "Ingreso del lote de prueba",
        },
    )
    assert created.status_code == 201, created.text
    event = created.json()
    assert event["operator_id"] > 0
    assert event["closed_at"] is None

    duplicate = client.post(
        f"/api/v1/incubators/{incubator['id']}/door-events",
        headers=operator_headers,
        json={"event_type": "inspection"},
    )
    assert duplicate.status_code == 409

    closed = client.patch(
        f"/api/v1/incubators/{incubator['id']}/door-events/{event['id']}/close",
        headers=operator_headers,
        json={},
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["closed_at"] is not None

    history = client.get(
        f"/api/v1/incubators/{incubator['id']}/door-events",
        headers=operator_headers,
    )
    assert history.status_code == 200
    assert history.json()[0]["eggs_added"] == 2


def test_rfid_access_locks_servo_and_invalidates_session_when_door_closes(
    client: TestClient, incubator: dict, operator_headers: dict[str, str]
) -> None:
    del operator_headers
    device_headers = {"X-Device-Key": "esp32-test-key"}
    denied = client.post(
        "/api/v1/access/rfid/authorize",
        headers=device_headers,
        json={"uid": "FFFFFFFF", "incubator_code": incubator["code"]},
    )
    assert denied.status_code == 401

    access_ws_url = f"/api/v1/access/ws/{incubator['code']}?key=kiosk-test-key"
    with client.websocket_connect(access_ws_url) as access_websocket:
        assert access_websocket.receive_json()["type"] == "rfid_ready"
        granted = client.post(
            "/api/v1/access/rfid/authorize",
            headers=device_headers,
            json={"uid": "A1 B2 C3 D4", "incubator_code": incubator["code"]},
        )
        automatic_login = access_websocket.receive_json()
        assert automatic_login["type"] == "rfid_authenticated"
        assert automatic_login["access_token"] == granted.json()["access_token"]
    assert granted.status_code == 200, granted.text
    access = granted.json()
    assert access["technician"]["role"] == "operator"
    assert access["technician"]["rfid_uid"] == "A1B2C3D4"
    assert access["servo_action"] == "unlock"
    assert access["servo_angle"] == 90
    session_headers = {"Authorization": f"Bearer {access['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=session_headers).status_code == 200
    websocket_url = (
        f"/api/v1/ws/incubators/{incubator['id']}?token={access['access_token']}"
    )
    with client.websocket_connect(websocket_url) as websocket:
        assert websocket.receive_json()["type"] == "connected"
        opened = client.post(
            f"/api/v1/access/sessions/{access['session_id']}/door",
            headers=device_headers,
            json={"state": "open"},
        )
        assert opened.status_code == 200, opened.text
        assert opened.json()["session"]["door_opened_at"] is not None
        assert opened.json()["servo_action"] == "unlock"
        assert websocket.receive_json()["type"] == "door_opened"

        operation = client.post(
            f"/api/v1/incubators/{incubator['id']}/door-events",
            headers=session_headers,
            json={"event_type": "egg_entry", "eggs_added": 2},
        )
        assert operation.status_code == 201, operation.text
        assert operation.json()["access_session_id"] == access["session_id"]
        assert operation.json()["access_method"] == "rfid"

        closed = client.post(
            f"/api/v1/access/sessions/{access['session_id']}/door",
            headers=device_headers,
            json={"state": "closed"},
        )
        websocket_event = websocket.receive_json()
        assert websocket_event["type"] == "door_closed"
        assert websocket_event["session_closed"] is True
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["servo_action"] == "lock"
    assert body["servo_angle"] == 0
    assert body["session"]["ended_reason"] == "door_closed"
    assert body["door_event"]["access_method"] == "rfid"
    assert body["door_event"]["eggs_added"] == 2
    assert client.get("/api/v1/auth/me", headers=session_headers).status_code == 401

    second_grant = client.post(
        "/api/v1/access/rfid/authorize",
        headers=device_headers,
        json={"uid": "A1B2C3D4", "incubator_code": incubator["code"]},
    ).json()
    cancelled = client.post(
        f"/api/v1/access/sessions/{second_grant['session_id']}/cancel",
        headers=device_headers,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["session"]["ended_reason"] == "unlock_timeout"
    assert cancelled.json()["servo_action"] == "lock"
    cancelled_headers = {"Authorization": f"Bearer {second_grant['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=cancelled_headers).status_code == 401


def test_report_is_a_pdf(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    response = client.get(
        f"/api/v1/reports/incubators/{incubator['id']}/daily.pdf", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 1000


def test_configuration_commands_and_additional_technician(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    technician = client.post(
        "/api/v1/auth/technicians",
        headers=auth_headers,
        json={
            "username": "tecnico2",
            "full_name": "Segundo Técnico",
            "password": "otra-clave-segura",
        },
    )
    assert technician.status_code == 201, technician.text

    config_url = f"/api/v1/incubators/{incubator['id']}/config"
    invalid = client.put(
        config_url,
        headers=auth_headers,
        json={
            "temperature_min_c": 38,
            "temperature_max_c": 37,
            "humidity_min_pct": 50,
            "humidity_max_pct": 65,
            "critical_temperature_c": 39,
            "rotation_interval_seconds": 120,
            "rotation_angle_degrees": 45,
        },
    )
    assert invalid.status_code == 422

    config = client.get(config_url, headers=auth_headers).json()
    assert config["temperature_min_c"] == 37
    assert config["rotation_interval_seconds"] == 120

    actuator = client.post(
        f"/api/v1/incubators/{incubator['id']}/actuators/fan/commands",
        headers=auth_headers,
        json={"enabled": True, "mode": "manual"},
    )
    assert actuator.status_code == 200
    assert actuator.json()["enabled"] is True

    rotation = client.post(
        f"/api/v1/incubators/{incubator['id']}/rotations",
        headers=auth_headers,
        json={"angle_degrees": 45, "direction": "left"},
    )
    assert rotation.status_code == 201
    assert rotation.json()["source"] == "manual"
    serial_status = client.get("/api/v1/serial/status", headers=auth_headers)
    assert serial_status.json()["connected"] is False


def test_websocket_receives_live_telemetry(
    client: TestClient, auth_headers: dict[str, str], incubator: dict
) -> None:
    initial_position = client.post(
        "/api/v1/telemetry",
        headers=auth_headers,
        json={
            "incubator_code": incubator["code"],
            "temperature_c": 37.5,
            "humidity_pct": 56,
            "servo_angle": 0,
            "source": "simulator",
        },
    )
    assert initial_position.status_code == 201

    token = auth_headers["Authorization"].removeprefix("Bearer ")
    websocket_url = f"/api/v1/ws/incubators/{incubator['id']}?token={token}"
    with client.websocket_connect(websocket_url) as websocket:
        assert websocket.receive_json() == {
            "type": "connected",
            "incubator_id": incubator["id"],
        }
        response = client.post(
            "/api/v1/telemetry",
            headers=auth_headers,
            json={
                "incubator_code": incubator["code"],
                "temperature_c": 37.7,
                "humidity_pct": 57,
                "servo_angle": -45,
                "source": "simulator",
            },
        )
        assert response.status_code == 201
        event = websocket.receive_json()
        assert event["type"] == "telemetry"
        assert event["data"]["temperature_c"] == 37.7

    rotations = client.get(
        f"/api/v1/incubators/{incubator['id']}/rotations", headers=auth_headers
    ).json()
    assert len(rotations) == 1
    assert rotations[0]["angle_degrees"] == 45
    assert rotations[0]["direction"] == "left"
