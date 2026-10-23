from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

import paho.mqtt.client as mqtt

from ..config import Settings
from ..schemas import TelemetryCreate
from .serial_bridge import SerialAccessEvent, SerialBridge

logger = logging.getLogger(__name__)


class GatewayLink(SerialBridge):
    """Node link through the USB ↔ MQTT gateway that runs next to the ESP32.

    The gateway forwards every serial line to ``smartegg/{node}/gateway/rx`` and
    writes ``gateway/tx`` messages to the serial port, so this class keeps the
    SerialBridge contract (callbacks, ``send_command``, status fields) while the
    backend runs in the cloud without direct USB access.
    """

    def __init__(
        self,
        settings: Settings,
        *,
        on_payload: Callable[[TelemetryCreate], None],
        on_live_payload: Callable[[TelemetryCreate], None] | None = None,
        on_access_event: Callable[[SerialAccessEvent], None] | None = None,
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
    ) -> None:
        node = settings.default_incubator_code
        super().__init__(
            enabled=settings.mqtt_enabled,
            port=f"mqtt://{settings.mqtt_host}:{settings.mqtt_port}",
            baudrate=0,
            timeout=0,
            reconnect_seconds=0,
            default_incubator_code=node,
            on_payload=on_payload,
            on_live_payload=on_live_payload,
            on_access_event=on_access_event,
        )
        self.settings = settings
        self.rx_topic = f"smartegg/{node}/gateway/rx"
        self.tx_topic = f"smartegg/{node}/gateway/tx"
        self.status_topic = f"smartegg/{node}/gateway/status"
        self.gateway_online = False
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None

    def start(self) -> None:
        if not self.enabled or self._client is not None:
            return
        self._stop.clear()
        self._start_payload_worker()
        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self.settings.mqtt_client_id}-gateway-link",
            protocol=mqtt.MQTTv311,
        )
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        if self.settings.mqtt_username:
            client.username_pw_set(
                self.settings.mqtt_username, self.settings.mqtt_password
            )
        if self.settings.mqtt_tls_enabled:
            ca_cert = self.settings.mqtt_ca_cert
            client.tls_set(ca_certs=str(ca_cert) if ca_cert else None)
        self._client = client
        client.connect_async(
            self.settings.mqtt_host,
            self.settings.mqtt_port,
            self.settings.mqtt_keepalive_seconds,
        )
        client.loop_start()

    def stop(self) -> None:
        self._stop.set()
        if self._client is not None:
            self._client.disconnect()
            self._client.loop_stop()
            self._client = None
        if self._payload_thread:
            self._payload_thread.join(timeout=2)
        self.connected = False

    def send_command(self, command: dict[str, object]) -> None:
        if not self.connected or self._client is None:
            raise RuntimeError("SmartEgg gateway is offline")
        result = self._client.publish(
            self.tx_topic,
            json.dumps(command, separators=(",", ":")),
            qos=1,
            retain=False,
        )
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(mqtt.error_string(result.rc))

    def _on_connect(
        self,
        client: mqtt.Client,
        _userdata: Any,
        _flags: Any,
        reason_code: Any,
        _properties: Any,
    ) -> None:
        if reason_code != 0:
            self.last_error = f"MQTT broker rejected connection: {reason_code}"
            logger.error(self.last_error)
            return
        client.subscribe([(self.rx_topic, 1), (self.status_topic, 1)])
        logger.info("Listening to the SmartEgg gateway on %s", self.rx_topic)

    def _on_message(
        self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage
    ) -> None:
        text = message.payload.decode("utf-8", errors="replace")
        if message.topic == self.status_topic:
            self._update_status(text)
        elif message.topic == self.rx_topic:
            self._handle_line(text)

    def _update_status(self, text: str) -> None:
        try:
            status = json.loads(text) if text else {}
        except json.JSONDecodeError:
            status = {}
        self.gateway_online = status.get("status") == "online"
        self.connected = self.gateway_online and status.get("serial") == "connected"
        if not self.gateway_online:
            self.last_error = f"Gateway offline: {status.get('reason', 'unknown')}"
        elif not self.connected:
            self.last_error = "Gateway online without the ESP32 serial port"
        else:
            self.last_error = None
