"""System lock driven by the vision service.

The vision service publishes one result per photo on
``smartegg/{node}/vision/resultado``. When it confirms a foreign object (3 of
the last 5 photos), the backend sends ``{"type":"system","action":"lock"}`` to
the node. The ESP32 keeps the lock (buzzer, red LED, LCD) and reports it as
``LOCK:1`` in its telemetry, which is the state everybody else trusts. An
authorized RFID card unlocks it.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

import paho.mqtt.client as mqtt

from ..config import Settings

logger = logging.getLogger(__name__)

LOCK_COMMAND: dict[str, object] = {"type": "system", "action": "lock"}
UNLOCK_COMMAND: dict[str, object] = {"type": "system", "action": "unlock"}


class SystemLock:
    def __init__(
        self,
        send_to_node: Callable[[dict[str, object]], None],
        *,
        resend_seconds: float = 5.0,
        unlock_grace_seconds: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.send_to_node = send_to_node
        self.resend_seconds = resend_seconds
        self.unlock_grace_seconds = unlock_grace_seconds
        self._clock = clock
        self._locked: dict[str, bool] = {}
        self._last_lock_sent: dict[str, float] = {}
        self._grace_until: dict[str, float] = {}
        self._mutex = threading.Lock()

    def observe(self, node_code: str, locked: bool | None) -> None:
        """Record the state confirmed by the node's telemetry."""
        if locked is None:
            return
        with self._mutex:
            self._locked[node_code] = locked

    def is_locked(self, node_code: str) -> bool:
        with self._mutex:
            return self._locked.get(node_code, False)

    def on_vision_result(self, node_code: str, result: dict[str, Any]) -> bool:
        """Lock the node when vision confirms an object; return whether it was sent."""
        if result.get("objeto_detectado") is not True:
            return False
        now = self._clock()
        with self._mutex:
            if self._locked.get(node_code, False):
                return False
            # After a card unlocks the node the operator needs time to take
            # the object out, while the camera still sees it.
            if now < self._grace_until.get(node_code, 0.0):
                return False
            last = self._last_lock_sent.get(node_code)
            if last is not None and now - last < self.resend_seconds:
                return False
            self._last_lock_sent[node_code] = now
        try:
            self.send_to_node(LOCK_COMMAND)
        except RuntimeError as exc:
            logger.warning("Could not lock %s: %s", node_code, exc)
            return False
        logger.warning("Foreign object confirmed on %s; lock sent", node_code)
        return True

    def unlock(self, node_code: str) -> bool:
        """Unlock after an authorized card; return whether the node was locked."""
        if not self.is_locked(node_code):
            return False
        self.send_to_node(UNLOCK_COMMAND)
        with self._mutex:
            self._locked[node_code] = False
            self._grace_until[node_code] = self._clock() + self.unlock_grace_seconds
        logger.info("Authorized card unlocked %s", node_code)
        return True


class VisionListener:
    """Subscribes to the vision results and feeds them to ``SystemLock``."""

    def __init__(
        self,
        settings: Settings,
        system_lock: SystemLock,
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
    ) -> None:
        self.settings = settings
        self.enabled = settings.mqtt_enabled
        self.system_lock = system_lock
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None

    def start(self) -> None:
        if not self.enabled or self._client is not None:
            return
        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self.settings.mqtt_client_id}-vision",
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
        if self._client is None:
            return
        self._client.disconnect()
        self._client.loop_stop()
        self._client = None

    def _on_connect(
        self,
        client: mqtt.Client,
        _userdata: Any,
        _flags: Any,
        reason_code: Any,
        _properties: Any,
    ) -> None:
        if reason_code != 0:
            logger.error("MQTT broker rejected the vision listener: %s", reason_code)
            return
        client.subscribe("smartegg/+/vision/resultado", qos=0)

    def _on_message(
        self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage
    ) -> None:
        parts = message.topic.split("/")
        if len(parts) != 4 or parts[2:] != ["vision", "resultado"]:
            return
        # The broker replays the retained result on every reconnect; it may be
        # minutes old, so only live results can lock the node.
        if message.retain:
            return
        try:
            result = json.loads(message.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.warning("Ignoring malformed vision result on %s", message.topic)
            return
        if isinstance(result, dict):
            self.system_lock.on_vision_result(parts[1], result)
