"""Results of the anomaly detection service.

The service in ``anomalias/`` scores every live reading and publishes the
result on ``smartegg/{node}/ml/anomalia``. The backend stores each score for
Grafana and keeps an ``ml_anomaly`` alarm open while the service reports an
alert (several anomalous readings in a row).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from ..config import Settings
from ..models import AnomalyScore, Incubator
from .telemetry import _sync_alarm

logger = logging.getLogger(__name__)


def record_anomaly_result(
    db: Session, node_code: str, result: dict[str, Any]
) -> AnomalyScore | None:
    """Store one score and sync the alarm; return None for an unknown node."""
    incubator = db.scalar(select(Incubator).where(Incubator.code == node_code))
    if incubator is None:
        return None
    try:
        score = float(result["puntaje"])
        threshold = float(result["umbral"])
        anomalous = bool(result["anomalia"])
        alert = bool(result["alerta"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid anomaly result: {exc}") from exc
    cause = result.get("causa")
    recorded_at = datetime.now(UTC)
    reading_at = result.get("lectura_at")
    if isinstance(reading_at, str):
        try:
            recorded_at = datetime.fromisoformat(reading_at.replace("Z", "+00:00"))
        except ValueError:
            pass
    row = AnomalyScore(
        incubator_id=incubator.id,
        score=score,
        threshold=threshold,
        anomalous=anomalous,
        alert=alert,
        cause=str(cause)[:80] if cause else None,
        recorded_at=recorded_at,
    )
    db.add(row)
    _sync_alarm(
        db,
        incubator.id,
        "ml_anomaly",
        alert,
        "warning",
        f"Anomalía en la telemetría: {cause}" if cause else "Anomalía en la telemetría",
        score,
        recorded_at,
    )
    db.commit()
    return row


class AnomalyListener:
    """Subscribes to the anomaly results and stores them."""

    def __init__(
        self,
        settings: Settings,
        session_factory: sessionmaker[Session],
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
    ) -> None:
        self.settings = settings
        self.enabled = settings.mqtt_enabled
        self.session_factory = session_factory
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None

    def start(self) -> None:
        if not self.enabled or self._client is not None:
            return
        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self.settings.mqtt_client_id}-ml",
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
            logger.error("MQTT broker rejected the anomaly listener: %s", reason_code)
            return
        client.subscribe("smartegg/+/ml/anomalia", qos=0)

    def _on_message(
        self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage
    ) -> None:
        parts = message.topic.split("/")
        if len(parts) != 4 or parts[2:] != ["ml", "anomalia"]:
            return
        # The retained result was already stored when it was live.
        if message.retain:
            return
        try:
            result = json.loads(message.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.warning("Ignoring malformed anomaly result on %s", message.topic)
            return
        if not isinstance(result, dict):
            return
        with self.session_factory() as db:
            try:
                record_anomaly_result(db, parts[1], result)
            except Exception:
                logger.exception("Rejected anomaly result on %s", message.topic)
