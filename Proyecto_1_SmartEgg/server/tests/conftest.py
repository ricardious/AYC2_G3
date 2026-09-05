from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path) -> Generator[TestClient, None, None]:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        jwt_secret="test-only-secret-that-is-long-enough-for-tests",
        serial_enabled=False,
        auto_create_schema=True,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/bootstrap",
        json={
            "username": "tecnico1",
            "full_name": "Técnico de Prueba",
            "password": "segura123",
        },
    )
    assert response.status_code == 201
    response = client.post(
        "/api/v1/auth/login", json={"username": "tecnico1", "password": "segura123"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def incubator(client: TestClient, auth_headers: dict[str, str]) -> dict:
    response = client.post(
        "/api/v1/incubators",
        headers=auth_headers,
        json={"code": "NODE-01", "name": "Incubadora principal", "capacity": 4},
    )
    assert response.status_code == 201, response.text
    return response.json()
