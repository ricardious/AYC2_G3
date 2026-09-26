from app.services.serial_bridge import parse_serial_line


def test_firmware_display_states_roundtrip(client, auth_headers, incubator):
    for power, sensor in [(True, True), (False, True), (True, False), (False, False)]:
        payload = parse_serial_line(
            f"NODE:{incubator['code']},TEMP:37.5,HUM:58,POWER:{int(power)},SENSOR:{int(sensor)}",
            incubator["code"],
        )
        assert payload.system_enabled is power
        assert payload.sensor_ok is sensor
        response = client.post(
            "/api/v1/telemetry",
            headers=auth_headers,
            json=payload.model_dump(mode="json"),
        )
        assert response.status_code == 201, response.text
        assert response.json()["system_enabled"] is power
        assert response.json()["sensor_ok"] is sensor
        dashboard = client.get(
            f"/api/v1/incubators/{incubator['id']}/state", headers=auth_headers
        )
        assert dashboard.status_code == 200, dashboard.text
        assert dashboard.json()["latest"]["system_enabled"] is power
        assert dashboard.json()["latest"]["sensor_ok"] is sensor


def test_legacy_states_are_unknown():
    payload = parse_serial_line("TEMP:37.5,HUM:58", "NODE-01")
    assert payload.system_enabled is None
    assert payload.sensor_ok is None
