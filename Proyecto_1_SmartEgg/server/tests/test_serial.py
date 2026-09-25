import pytest
from sqlalchemy import select

from app.main import create_app
from app.models import AccessSession, DoorEvent
from app.services.serial_access import process_serial_access_event
from app.services.serial_bridge import (
    SerialBridge,
    parse_serial_access_event,
    parse_serial_line,
)


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


def test_serial_bridge_keeps_freshest_telemetry_when_queue_is_full() -> None:
    bridge = SerialBridge(
        enabled=False,
        port=None,
        baudrate=115200,
        timeout=0.1,
        reconnect_seconds=0.1,
        default_incubator_code="NODE-01",
        on_payload=lambda payload: None,
    )
    for temperature in range(1, 6):
        bridge._enqueue_payload(  # noqa: SLF001 - verifies bounded queue policy
            parse_serial_line(f"TEMP:{temperature},HUM:60", "NODE-01")
        )

    queued = [bridge._payload_queue.get_nowait() for _ in range(4)]  # noqa: SLF001
    assert [payload.temperature_c for payload in queued] == [2, 3, 4, 5]


def test_serial_bridge_opens_with_modem_control_lines_inactive(monkeypatch) -> None:
    bridge = SerialBridge(
        enabled=True,
        port="/dev/test-serial",
        baudrate=115200,
        timeout=0.1,
        reconnect_seconds=0.1,
        default_incubator_code="NODE-01",
        on_payload=lambda payload: None,
    )

    class FakeConnection:
        dtr = True
        rts = True
        is_open = False
        input_was_reset = False

        def open(self) -> None:
            assert self.dtr is False
            assert self.rts is False
            self.is_open = True

        def reset_input_buffer(self) -> None:
            self.input_was_reset = True

        def readline(self) -> bytes:
            bridge._stop.set()  # noqa: SLF001
            return b""

        def close(self) -> None:
            self.is_open = False

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            self.close()

    connection = FakeConnection()

    def fake_serial_for_url(port, baudrate, **kwargs):
        assert port == "/dev/test-serial"
        assert baudrate == 115200
        assert kwargs["do_not_open"] is True
        return connection

    monkeypatch.setattr(
        "app.services.serial_bridge.serial.serial_for_url", fake_serial_for_url
    )
    bridge._run()  # noqa: SLF001

    assert connection.input_was_reset is True


def test_serial_bridge_forwards_live_reading_before_persistence_queue(monkeypatch) -> None:
    order: list[str] = []
    bridge = SerialBridge(
        enabled=True,
        port="/dev/test-serial",
        baudrate=115200,
        timeout=0.1,
        reconnect_seconds=0.1,
        default_incubator_code="NODE-01",
        on_payload=lambda payload: None,
        on_live_payload=lambda payload: order.append("mqtt"),
    )
    monkeypatch.setattr(bridge, "_enqueue_payload", lambda payload: order.append("db"))

    class FakeConnection:
        is_open = False

        def open(self) -> None:
            self.is_open = True

        def reset_input_buffer(self) -> None:
            pass

        def readline(self) -> bytes:
            bridge._stop.set()  # noqa: SLF001
            return b"TEMP:37.5,HUM:58,SLOTS:2\n"

        def close(self) -> None:
            self.is_open = False

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            self.close()

    monkeypatch.setattr(
        "app.services.serial_bridge.serial.serial_for_url",
        lambda *args, **kwargs: FakeConnection(),
    )
    bridge._run()  # noqa: SLF001

    assert order == ["mqtt", "db"]


def test_parse_rfid_serial_event() -> None:
    event = parse_serial_access_event("RFID:A1B2C3D4", "NODE-01")
    assert event.kind == "rfid"
    assert event.uid == "A1B2C3D4"
    assert event.incubator_code == "NODE-01"


def test_parse_door_and_cancel_serial_events() -> None:
    opened = parse_serial_access_event("ACCESS:DOOR,SESSION:12,STATE:OPEN", "NODE-01")
    cancelled = parse_serial_access_event("ACCESS:CANCEL,SESSION:12", "NODE-01")
    assert opened.kind == "door"
    assert opened.session_id == 12
    assert opened.door_open is True
    assert cancelled.kind == "cancel"
    assert cancelled.session_id == 12


def test_reject_invalid_rfid_serial_event() -> None:
    with pytest.raises(ValueError):
        parse_serial_access_event("RFID:not-a-card", "NODE-01")


def test_rfid_serial_access_lifecycle(client, operator_headers, incubator) -> None:
    del operator_headers, incubator
    settings = client.app.state.settings
    session_factory = client.app.state.session_factory

    with session_factory() as db:
        authorization = process_serial_access_event(
            db,
            parse_serial_access_event("RFID:A1B2C3D4", "NODE-01"),
            settings,
        )
        assert authorization.command is not None
        assert authorization.command["authorized"] is True
        assert authorization.command["operator_name"] == "OPERADOR DE PRUEBA"
        session_id = int(authorization.command["session_id"])

        opened = process_serial_access_event(
            db,
            parse_serial_access_event(
                f"ACCESS:DOOR,SESSION:{session_id},STATE:OPEN", "NODE-01"
            ),
            settings,
        )
        assert opened.mqtt_payload["event"] == "door_opened"

        closed = process_serial_access_event(
            db,
            parse_serial_access_event(
                f"ACCESS:DOOR,SESSION:{session_id},STATE:CLOSED", "NODE-01"
            ),
            settings,
        )
        assert closed.mqtt_payload["event"] == "door_closed"
        access_session = db.get(AccessSession, session_id)
        assert access_session is not None
        assert access_session.ended_reason == "door_closed"
        assert (
            db.scalar(
                select(DoorEvent).where(DoorEvent.access_session_id == session_id)
            )
            is not None
        )


def test_unknown_rfid_is_denied_over_serial(client, incubator) -> None:
    del incubator
    with client.app.state.session_factory() as db:
        outcome = process_serial_access_event(
            db,
            parse_serial_access_event("RFID:00112233", "NODE-01"),
            client.app.state.settings,
        )
    assert outcome.command is not None
    assert outcome.command["authorized"] is False
    assert outcome.mqtt_payload["reason"] == "card_not_authorized"


def test_rfid_database_failure_sends_denial(client, monkeypatch) -> None:
    def fail_processing(*args, **kwargs) -> None:
        del args, kwargs
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("app.main.process_serial_access_event", fail_processing)
    app = create_app(client.app.state.settings)
    sent_commands: list[dict[str, object]] = []
    monkeypatch.setattr(app.state.serial_bridge, "send_command", sent_commands.append)

    handler = app.state.serial_bridge.on_access_event
    assert handler is not None
    handler(parse_serial_access_event("RFID:00112233", "NODE-01"))

    assert sent_commands == [
        {
            "type": "access",
            "action": "authorize",
            "authorized": False,
            "session_id": 0,
            "servo_angle": client.app.state.settings.access_servo_lock_degrees,
        }
    ]
    app.state.engine.dispose()
