from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import ActuatorState, Alarm, TelemetryReading

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MqttSnapshot:
    node_code: str
    temperature_c: float
    humidity_pct: float
    door_open: bool | None
    occupied_slots: int
    available_slots: int
    recorded_at: datetime
    heater: bool
    fan: bool
    servo_angle: float | None
    buzzer: bool
    critical_alarm: dict[str, object] | None


def build_mqtt_snapshot(
    db: Session, reading: TelemetryReading, node_code: str
) -> MqttSnapshot:
    actuator_rows = db.scalars(
        select(ActuatorState).where(ActuatorState.incubator_id == reading.incubator_id)
    )
    actuators = {row.kind: row for row in actuator_rows}
    critical_alarm = db.scalar(
        select(Alarm)
        .where(
            Alarm.incubator_id == reading.incubator_id,
            Alarm.severity == "critical",
            Alarm.resolved_at.is_(None),
        )
        .order_by(Alarm.occurred_at.desc())
    )
    alarm_payload = None
    if critical_alarm is not None:
        alarm_payload = {
            "kind": critical_alarm.kind,
            "severity": critical_alarm.severity,
            "message": critical_alarm.message,
            "value": critical_alarm.value,
            "occurred_at": critical_alarm.occurred_at.isoformat(),
        }

    return MqttSnapshot(
        node_code=node_code,
        temperature_c=reading.temperature_c,
        humidity_pct=reading.humidity_pct,
        door_open=reading.door_open,
        occupied_slots=reading.occupied_slots,
        available_slots=reading.available_slots,
        recorded_at=reading.recorded_at,
        heater=actuators.get("heater").enabled if actuators.get("heater") else False,
        fan=actuators.get("fan").enabled if actuators.get("fan") else False,
        servo_angle=actuators.get("servo").value if actuators.get("servo") else None,
        buzzer=actuators.get("buzzer").enabled if actuators.get("buzzer") else False,
        critical_alarm=alarm_payload,
    )


class MqttPublisher:
    def __init__(
        self,
        settings: Settings,
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
    ) -> None:
        self.enabled = settings.mqtt_enabled
        self.host = settings.mqtt_host
        self.port = settings.mqtt_port
        self.username = settings.mqtt_username
        self.password = settings.mqtt_password
        self.client_id = settings.mqtt_client_id
        self.keepalive = settings.mqtt_keepalive_seconds
        self.tls_enabled = settings.mqtt_tls_enabled
        self.ca_cert = settings.mqtt_ca_cert
        self.status_node_code = settings.default_incubator_code
        self.connected = False
        self.last_error: str | None = None
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None

    def start(self) -> None:
        if not self.enabled or self._client is not None:
            return

        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.client_id,
            protocol=mqtt.MQTTv311,
        )
        client.on_connect = self._on_connect
        client.on_connect_fail = self._on_connect_fail
        client.on_disconnect = self._on_disconnect
        if self.username:
            client.username_pw_set(self.username, self.password)
        if self.tls_enabled:
            client.tls_set(ca_certs=str(self.ca_cert) if self.ca_cert else None)

        client.will_set(
            self._topic(self.status_node_code, "status"),
            self._encode(
                {
                    "status": "offline",
                    "reason": "unexpected_disconnect",
                }
            ),
            qos=1,
            retain=True,
        )
        self._client = client
        client.connect_async(self.host, self.port, self.keepalive)
        client.loop_start()

    def stop(self) -> None:
        if self._client is None:
            return
        if self.connected:
            pending = self.publish_status(
                self.status_node_code, "offline", "graceful_shutdown"
            )
            if pending is not None:
                pending.wait_for_publish(timeout=2)
        self._client.disconnect()
        self._client.loop_stop()
        self._client = None
        self.connected = False

    def publish_status(
        self, node_code: str, status: str, reason: str | None = None
    ) -> mqtt.MQTTMessageInfo | None:
        payload: dict[str, object] = {
            "status": status,
            "recorded_at": datetime.now(UTC).isoformat(),
        }
        if reason:
            payload["reason"] = reason
        return self._publish(
            self._topic(node_code, "status"), payload, qos=1, retain=True
        )

    def publish_snapshot(self, snapshot: MqttSnapshot) -> None:
        recorded_at = snapshot.recorded_at.isoformat()
        prefix = snapshot.node_code
        self._publish(
            self._topic(prefix, "sensores/temperatura"),
            {
                "value": snapshot.temperature_c,
                "unit": "celsius",
                "recorded_at": recorded_at,
            },
            qos=0,
            retain=True,
        )
        self._publish(
            self._topic(prefix, "sensores/humedad"),
            {
                "value": snapshot.humidity_pct,
                "unit": "percent",
                "recorded_at": recorded_at,
            },
            qos=0,
            retain=True,
        )
        self._publish(
            self._topic(prefix, "telemetria"),
            {
                "temperature_c": snapshot.temperature_c,
                "humidity_pct": snapshot.humidity_pct,
                "door_open": snapshot.door_open,
                "occupied_slots": snapshot.occupied_slots,
                "available_slots": snapshot.available_slots,
                "recorded_at": recorded_at,
            },
            qos=0,
            retain=True,
        )
        self._publish(
            self._topic(prefix, "actuadores/estado"),
            {
                "heater": snapshot.heater,
                "fan": snapshot.fan,
                "servo_angle": snapshot.servo_angle,
                "buzzer": snapshot.buzzer,
                "recorded_at": recorded_at,
            },
            qos=1,
            retain=True,
        )
        alarm_topic = self._topic(prefix, "alarmas/critica")
        if snapshot.critical_alarm is None:
            self._publish_raw(alarm_topic, b"", qos=1, retain=True)
        else:
            self._publish(alarm_topic, snapshot.critical_alarm, qos=1, retain=True)

    def _publish(
        self, topic: str, payload: dict[str, object], *, qos: int, retain: bool
    ) -> mqtt.MQTTMessageInfo | None:
        return self._publish_raw(topic, self._encode(payload), qos=qos, retain=retain)

    def _publish_raw(
        self, topic: str, payload: str | bytes, *, qos: int, retain: bool
    ) -> mqtt.MQTTMessageInfo | None:
        if not self.enabled or self._client is None:
            return None
        result = self._client.publish(topic, payload, qos=qos, retain=retain)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            self.last_error = mqtt.error_string(result.rc)
            logger.warning("MQTT publish failed for %s: %s", topic, self.last_error)
        return result

    def _on_connect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _flags: Any,
        reason_code: Any,
        _properties: Any,
    ) -> None:
        if reason_code == 0:
            self.connected = True
            self.last_error = None
            self.publish_status(self.status_node_code, "online")
            logger.info("Connected to MQTT broker at %s:%s", self.host, self.port)
            return
        self.connected = False
        self.last_error = str(reason_code)
        logger.error("MQTT broker rejected connection: %s", reason_code)

    def _on_connect_fail(self, _client: mqtt.Client, _userdata: Any) -> None:
        self.connected = False
        self.last_error = f"Could not connect to {self.host}:{self.port}"
        logger.warning(self.last_error)

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _disconnect_flags: Any,
        reason_code: Any,
        _properties: Any,
    ) -> None:
        self.connected = False
        if reason_code != 0:
            self.last_error = str(reason_code)
            logger.warning("Unexpected MQTT disconnection: %s", reason_code)

    @staticmethod
    def _topic(node_code: str, suffix: str) -> str:
        return f"smartegg/{node_code}/{suffix}"

    @staticmethod
    def _encode(payload: dict[str, object]) -> str:
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
