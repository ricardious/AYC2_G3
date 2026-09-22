from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.models import Technician
from app.security import hash_password


def create_operator(
    client: TestClient,
    admin_headers: dict[str, str],
    *,
    username: str,
    role: str,
    incubator_ids: list[int],
) -> tuple[dict, dict[str, str]]:
    created = client.post(
        "/api/v1/auth/technicians",
        headers=admin_headers,
        json={
            "username": username,
            "full_name": f"Operador {username}",
            "role": role,
            "password": "clave-operador-segura",
        },
    )
    assert created.status_code == 201, created.text
    assigned = client.put(
        f"/api/v1/auth/technicians/{created.json()['id']}/incubators",
        headers=admin_headers,
        json={"incubator_ids": incubator_ids},
    )
    assert assigned.status_code == 200, assigned.text
    login = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "clave-operador-segura"},
    )
    assert login.status_code == 200, login.text
    return created.json(), {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_legacy_operator_can_create_only_the_first_admin(client: TestClient) -> None:
    with client.app.state.session_factory() as db:
        db.add(
            Technician(
                username="legacy-operator",
                full_name="Operador heredado",
                role="operator",
                password_hash=hash_password("clave-heredada-segura"),
            )
        )
        db.commit()
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "legacy-operator", "password": "clave-heredada-segura"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/v1/auth/admin-status", headers=headers).json() == {
        "exists": False
    }

    first = client.post(
        "/api/v1/auth/technicians",
        headers=headers,
        json={
            "username": "recovered-admin",
            "full_name": "Administrador recuperado",
            "role": "admin",
            "password": "clave-admin-segura",
        },
    )
    assert first.status_code == 201, first.text
    assert client.get("/api/v1/auth/admin-status", headers=headers).json() == {
        "exists": True
    }
    second = client.post(
        "/api/v1/auth/technicians",
        headers=headers,
        json={
            "username": "second-admin",
            "full_name": "Segundo administrador",
            "role": "admin",
            "password": "otra-clave-segura",
        },
    )
    assert second.status_code == 403


def test_roles_enforce_management_and_hardware_permissions(
    client: TestClient,
    auth_headers: dict[str, str],
    incubator: dict,
    operator_headers: dict[str, str],
) -> None:
    create_user = client.post(
        "/api/v1/auth/technicians",
        headers=operator_headers,
        json={
            "username": "forbidden-user",
            "full_name": "Usuario no permitido",
            "role": "operator",
            "password": "clave-no-permitida",
        },
    )
    assert create_user.status_code == 403

    config = client.get(
        f"/api/v1/incubators/{incubator['id']}/config", headers=operator_headers
    ).json()
    update_config = client.put(
        f"/api/v1/incubators/{incubator['id']}/config",
        headers=operator_headers,
        json={
            "temperature_min_c": config["temperature_min_c"],
            "temperature_max_c": config["temperature_max_c"],
            "humidity_min_pct": config["humidity_min_pct"],
            "humidity_max_pct": config["humidity_max_pct"],
            "critical_temperature_c": config["critical_temperature_c"],
            "rotation_interval_seconds": config["rotation_interval_seconds"],
            "rotation_angle_degrees": config["rotation_angle_degrees"],
        },
    )
    assert update_config.status_code == 403
    command = client.post(
        f"/api/v1/incubators/{incubator['id']}/actuators/fan/commands",
        headers=operator_headers,
        json={"enabled": True, "mode": "manual"},
    )
    assert command.status_code == 403
    manual_rotation = client.post(
        f"/api/v1/incubators/{incubator['id']}/rotations",
        headers=operator_headers,
        json={"angle_degrees": 45, "direction": "left"},
    )
    assert manual_rotation.status_code == 403

    admin_door = client.post(
        f"/api/v1/incubators/{incubator['id']}/door-events",
        headers=auth_headers,
        json={"event_type": "inspection"},
    )
    assert admin_door.status_code == 403


def test_operator_data_is_private_and_admin_has_global_visibility(
    client: TestClient,
    auth_headers: dict[str, str],
    incubator: dict,
    operator_headers: dict[str, str],
) -> None:
    second, second_headers = create_operator(
        client,
        auth_headers,
        username="operador2",
        role="operator",
        incubator_ids=[incubator["id"]],
    )
    lot = client.post(
        "/api/v1/lots",
        headers=operator_headers,
        json={
            "code": "LOTE-PRIVADO-1",
            "species": "Gallina",
            "started_on": datetime.now(UTC).date().isoformat(),
        },
    )
    assert lot.status_code == 201, lot.text
    assert lot.json()["created_by_id"] != second["id"]
    egg = client.post(
        "/api/v1/eggs",
        headers=operator_headers,
        json={
            "code": "HUEVO-PRIVADO-1",
            "lot_id": lot.json()["id"],
            "incubator_id": incubator["id"],
            "slot_number": 1,
        },
    )
    assert egg.status_code == 201, egg.text

    assert client.get("/api/v1/lots", headers=second_headers).json() == []
    assert client.get("/api/v1/eggs", headers=second_headers).json() == []
    assert (
        client.get(
            f"/api/v1/lots/{lot.json()['id']}", headers=second_headers
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/eggs/{egg.json()['id']}", headers=second_headers
        ).status_code
        == 403
    )
    assert len(client.get("/api/v1/lots", headers=auth_headers).json()) == 1
    assert len(client.get("/api/v1/eggs", headers=auth_headers).json()) == 1


def test_incubator_assignment_diagnostics_and_report_audit_are_scoped(
    client: TestClient,
    auth_headers: dict[str, str],
    incubator: dict,
) -> None:
    operator, operator_headers = create_operator(
        client,
        auth_headers,
        username="scoped-operator",
        role="operator",
        incubator_ids=[incubator["id"]],
    )
    other = client.post(
        "/api/v1/incubators",
        headers=auth_headers,
        json={"code": "NODE-02", "name": "Incubadora secundaria", "capacity": 4},
    )
    assert other.status_code == 201, other.text
    visible = client.get("/api/v1/incubators", headers=operator_headers)
    assert [item["id"] for item in visible.json()] == [incubator["id"]]
    denied = client.get(
        f"/api/v1/incubators/{other.json()['id']}", headers=operator_headers
    )
    assert denied.status_code == 403

    personal = client.get("/api/v1/me/diagnostics", headers=operator_headers)
    assert personal.status_code == 200, personal.text
    assert personal.json()["operator_id"] == operator["id"]
    assert personal.json()["incubator_ids"] == [incubator["id"]]
    assert (
        client.get("/api/v1/admin/diagnostics", headers=operator_headers).status_code
        == 403
    )
    admin_view = client.get(
        f"/api/v1/admin/diagnostics?operator_id={operator['id']}",
        headers=auth_headers,
    )
    assert admin_view.status_code == 200, admin_view.text
    assert admin_view.json()["operator_id"] == operator["id"]

    report = client.get(
        f"/api/v1/reports/incubators/{incubator['id']}/daily.pdf",
        headers=operator_headers,
    )
    assert report.status_code == 200, report.text
    own_exports = client.get("/api/v1/reports", headers=operator_headers).json()
    assert len(own_exports) == 1
    assert own_exports[0]["scope"] == "personal"
    assert own_exports[0]["subject_operator_id"] == operator["id"]
    assert len(client.get("/api/v1/reports", headers=auth_headers).json()) == 1
