import pytest

from app.services.serial_bridge import parse_serial_line


def test_parse_json_serial_message() -> None:
    payload = parse_serial_line(
        '{"temperature_c":37.5,"humidity_pct":58,"door_open":false}', "NODE-01"
    )
    assert payload.incubator_code == "NODE-01"
    assert payload.temperature_c == 37.5
    assert payload.source == "serial"


def test_parse_key_value_serial_message() -> None:
    payload = parse_serial_line(
        "NODE:NODE-02,TEMP:38.2,HUM:62,DOOR:0,SLOTS:3,FAN:1", "NODE-01"
    )
    assert payload.incubator_code == "NODE-02"
    assert payload.occupied_slots == 3
    assert payload.fan is True


def test_reject_invalid_serial_message() -> None:
    with pytest.raises(ValueError):
        parse_serial_line("garbage", "NODE-01")
