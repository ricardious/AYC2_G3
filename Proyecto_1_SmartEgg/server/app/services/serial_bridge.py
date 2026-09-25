from __future__ import annotations

import json
import queue
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

import serial

from ..schemas import TelemetryCreate


@dataclass(frozen=True)
class SerialAccessEvent:
    kind: Literal["rfid", "door", "cancel"]
    uid: str | None = None
    session_id: int | None = None
    door_open: bool | None = None
    incubator_code: str | None = None


def _parse_fragments(line: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for fragment in line.strip().split(","):
        key, separator, value = fragment.partition(":")
        if not separator:
            raise ValueError(f"Invalid serial fragment: {fragment}")
        fields[key.strip().upper()] = value.strip()
    return fields


def parse_serial_access_event(
    line: str, default_incubator_code: str
) -> SerialAccessEvent:
    fields = _parse_fragments(line)
    node = fields.get("NODE", default_incubator_code)
    if "RFID" in fields:
        uid = fields["RFID"].replace(":", "").replace("-", "").upper()
        if len(uid) not in {8, 14, 20} or any(
            character not in "0123456789ABCDEF" for character in uid
        ):
            raise ValueError("Invalid RFID UID")
        return SerialAccessEvent(kind="rfid", uid=uid, incubator_code=node)

    action = fields.get("ACCESS", "").upper()
    try:
        session_id = int(fields["SESSION"])
    except (KeyError, ValueError) as exc:
        raise ValueError("Invalid access session") from exc
    if session_id <= 0:
        raise ValueError("Invalid access session")
    if action == "DOOR":
        state = fields.get("STATE", "").upper()
        if state not in {"OPEN", "CLOSED"}:
            raise ValueError("Invalid door state")
        return SerialAccessEvent(
            kind="door",
            session_id=session_id,
            door_open=state == "OPEN",
            incubator_code=node,
        )
    if action == "CANCEL":
        return SerialAccessEvent(
            kind="cancel", session_id=session_id, incubator_code=node
        )
    raise ValueError("Unknown serial access event")


def parse_serial_line(line: str, default_incubator_code: str) -> TelemetryCreate:
    raw = line.strip()
    if not raw:
        raise ValueError("Empty serial message")
    if raw.startswith("{"):
        data = json.loads(raw)
    else:
        data: dict[str, object] = {}
        aliases = {
            "TEMP": "temperature_c",
            "TEMPERATURE": "temperature_c",
            "HUM": "humidity_pct",
            "HUMIDITY": "humidity_pct",
            "DOOR": "door_open",
            "SLOTS": "occupied_slots",
            "HEATER": "heater",
            "FAN": "fan",
            "SERVO": "servo_angle",
            "BUZZER": "buzzer",
            "POWER": "system_enabled",
            "SENSOR": "sensor_ok",
            "NODE": "incubator_code",
        }
        for fragment in raw.split(","):
            key, separator, value = fragment.partition(":")
            if not separator:
                raise ValueError(f"Invalid serial fragment: {fragment}")
            normalized = aliases.get(key.strip().upper(), key.strip().lower())
            value = value.strip()
            if normalized in {
                "door_open",
                "heater",
                "fan",
                "buzzer",
                "system_enabled",
                "sensor_ok",
            }:
                data[normalized] = value.lower() in {"1", "true", "on", "open"}
            elif normalized == "incubator_code":
                data[normalized] = value
            else:
                data[normalized] = float(value)
    data.setdefault("incubator_code", default_incubator_code)
    data["source"] = "serial"
    data["raw_payload"] = raw
    return TelemetryCreate.model_validate(data)


class SerialBridge:
    def __init__(
        self,
        *,
        enabled: bool,
        port: str | None,
        baudrate: int,
        timeout: float,
        reconnect_seconds: float,
        default_incubator_code: str,
        on_payload: Callable[[TelemetryCreate], None],
        on_live_payload: Callable[[TelemetryCreate], None] | None = None,
        on_access_event: Callable[[SerialAccessEvent], None] | None = None,
    ) -> None:
        self.enabled = enabled
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.reconnect_seconds = reconnect_seconds
        self.default_incubator_code = default_incubator_code
        self.on_payload = on_payload
        self.on_live_payload = on_live_payload
        self.on_access_event = on_access_event
        self.connected = False
        self.last_error: str | None = None
        self.last_message_at: datetime | None = None
        self._serial: serial.Serial | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._payload_thread: threading.Thread | None = None
        self._payload_queue: queue.Queue[TelemetryCreate] = queue.Queue(maxsize=4)
        self._write_lock = threading.Lock()

    def start(self) -> None:
        if (
            not self.enabled
            or not self.port
            or (self._thread and self._thread.is_alive())
        ):
            return
        self._stop.clear()
        self._payload_thread = threading.Thread(
            target=self._process_payloads,
            name="smartegg-telemetry",
            daemon=True,
        )
        self._payload_thread.start()
        self._thread = threading.Thread(
            target=self._run, name="smartegg-serial", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._serial and self._serial.is_open:
            self._serial.close()
        if self._thread:
            self._thread.join(timeout=2)
        if self._payload_thread:
            self._payload_thread.join(timeout=2)
        self.connected = False

    def _enqueue_payload(self, payload: TelemetryCreate) -> None:
        try:
            self._payload_queue.put_nowait(payload)
            return
        except queue.Full:
            # Keep the freshest sensor state instead of building a backlog that
            # delays RFID reads when a cloud database is temporarily slow.
            try:
                self._payload_queue.get_nowait()
                self._payload_queue.task_done()
            except queue.Empty:
                pass
        try:
            self._payload_queue.put_nowait(payload)
        except queue.Full:
            pass

    def _process_payloads(self) -> None:
        while not self._stop.is_set():
            try:
                payload = self._payload_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                self.on_payload(payload)
            except Exception as exc:
                self.last_error = f"Rejected telemetry callback: {exc}"
            finally:
                self._payload_queue.task_done()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                connection = serial.serial_for_url(
                    self.port,
                    self.baudrate,
                    timeout=self.timeout,
                    do_not_open=True,
                )
                # CP2102 adapters on ESP32 DevKit boards wire DTR/RTS to the
                # BOOT and EN pins. Configure both inactive before opening so
                # recreating the backend cannot reset or hold the board in its
                # bootloader. Discard only bytes accumulated during startup.
                connection.dtr = False
                connection.rts = False
                connection.open()
                connection.reset_input_buffer()
                with connection:
                    self._serial = connection
                    self.connected = True
                    self.last_error = None
                    while not self._stop.is_set():
                        raw = connection.readline()
                        if not raw:
                            continue
                        line = raw.decode("utf-8", errors="replace")
                        try:
                            stripped = line.strip()
                            if stripped.startswith(("RFID:", "ACCESS:")):
                                if self.on_access_event is not None:
                                    self.on_access_event(
                                        parse_serial_access_event(
                                            stripped, self.default_incubator_code
                                        )
                                    )
                                self.last_message_at = datetime.now(UTC)
                                self.last_error = None
                                continue
                            if stripped.startswith("DIAG:") or (
                                stripped.startswith("MSG:") and "TEMP:" not in stripped
                            ):
                                continue
                            payload = parse_serial_line(
                                line, self.default_incubator_code
                            )
                            # One receive timestamp for both the immediate MQTT
                            # message and the eventually persisted reading.
                            payload = payload.model_copy(
                                update={"recorded_at": datetime.now(UTC)}
                            )
                            if self.on_live_payload is not None:
                                try:
                                    self.on_live_payload(payload)
                                except Exception as exc:
                                    self.last_error = f"Live telemetry callback: {exc}"
                            self._enqueue_payload(payload)
                            self.last_message_at = datetime.now(UTC)
                            self.last_error = None
                        except Exception as exc:
                            self.last_error = f"Rejected message: {exc}"
            except Exception as exc:
                self.connected = False
                self.last_error = str(exc)
                self._stop.wait(self.reconnect_seconds)

    def send_command(self, command: dict[str, object]) -> None:
        if not self.connected or self._serial is None:
            raise RuntimeError("Serial port is not connected")
        encoded = (json.dumps(command, separators=(",", ":")) + "\n").encode()
        with self._write_lock:
            self._serial.write(encoded)
            self._serial.flush()
