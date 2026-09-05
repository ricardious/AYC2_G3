from __future__ import annotations

import json
import threading
from collections.abc import Callable
from datetime import UTC, datetime

import serial

from ..schemas import TelemetryCreate


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
            "NODE": "incubator_code",
        }
        for fragment in raw.split(","):
            key, separator, value = fragment.partition(":")
            if not separator:
                raise ValueError(f"Invalid serial fragment: {fragment}")
            normalized = aliases.get(key.strip().upper(), key.strip().lower())
            value = value.strip()
            if normalized in {"door_open", "heater", "fan", "buzzer"}:
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
    ) -> None:
        self.enabled = enabled
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.reconnect_seconds = reconnect_seconds
        self.default_incubator_code = default_incubator_code
        self.on_payload = on_payload
        self.connected = False
        self.last_error: str | None = None
        self.last_message_at: datetime | None = None
        self._serial: serial.Serial | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._write_lock = threading.Lock()

    def start(self) -> None:
        if (
            not self.enabled
            or not self.port
            or (self._thread and self._thread.is_alive())
        ):
            return
        self._stop.clear()
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
        self.connected = False

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                with serial.Serial(
                    self.port, self.baudrate, timeout=self.timeout
                ) as connection:
                    self._serial = connection
                    self.connected = True
                    self.last_error = None
                    while not self._stop.is_set():
                        raw = connection.readline()
                        if not raw:
                            continue
                        line = raw.decode("utf-8", errors="replace")
                        try:
                            payload = parse_serial_line(
                                line, self.default_incubator_code
                            )
                            self.on_payload(payload)
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
