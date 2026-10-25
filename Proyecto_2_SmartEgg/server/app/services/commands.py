"""Control commands received over MQTT.

The broker is the only control channel: clients publish to
``smartegg/{node}/comandos/{kind}`` and the backend validates the payload,
records it like the former REST endpoints did, forwards it to the node and
publishes the outcome on ``smartegg/{node}/comandos/resultado``.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from ..config import Settings
from ..models import ActuatorState, Incubator, RotationEvent
from ..schemas import (
    ActuatorCommand,
    EnergyConfigUpdate,
    IncubatorConfigUpdate,
    RotationCommand,
)

logger = logging.getLogger(__name__)

COMMAND_KINDS = ("actuador", "rotar", "config", "energia")
ACTUATOR_KINDS = {"heater", "fan", "servo", "buzzer"}


class CommandError(ValueError):
    """A command that was understood but cannot be applied."""


class SystemLockedError(RuntimeError):
    """The node is locked by the vision service until an RFID unlock."""


class ActuatorMqttCommand(ActuatorCommand):
    kind: str


def apply_actuator_command(
    db: Session, incubator: Incubator, kind: str, payload: ActuatorCommand
) -> dict[str, object]:
    if kind not in ACTUATOR_KINDS:
        raise CommandError("Unknown actuator kind")
    actuator = db.scalar(
        select(ActuatorState).where(
            ActuatorState.incubator_id == incubator.id, ActuatorState.kind == kind
        )
    )
    if actuator is None:
        actuator = ActuatorState(incubator_id=incubator.id, kind=kind)
        db.add(actuator)
    actuator.enabled, actuator.mode, actuator.value = (
        payload.enabled,
        payload.mode,
        payload.value,
    )
    actuator.updated_at = datetime.now(UTC)
    db.commit()
    return {"type": "actuator", "kind": kind, **payload.model_dump()}


def apply_rotation_command(
    db: Session, incubator: Incubator, payload: RotationCommand
) -> dict[str, object]:
    db.add(
        RotationEvent(
            incubator_id=incubator.id,
            angle_degrees=payload.angle_degrees,
            direction=payload.direction,
            source="manual",
        )
    )
    db.commit()
    signed_angle = (
        payload.angle_degrees
        if payload.direction == "right"
        else -payload.angle_degrees
    )
    return {"type": "rotate", "angle_degrees": signed_angle}


def apply_config_command(
    db: Session, incubator: Incubator, payload: IncubatorConfigUpdate
) -> dict[str, object]:
    config = incubator.config
    for key, value in payload.model_dump().items():
        setattr(config, key, value)
    config.updated_at = datetime.now(UTC)
    db.commit()
    return {"type": "config", **payload.model_dump()}


def execute_command(
    db: Session, node_code: str, kind: str, data: dict[str, Any]
) -> dict[str, object] | None:
    """Validate and record one command; return the frame for the node.

    Energy settings stay in the backend, so they return no frame.
    """
    incubator = db.scalar(select(Incubator).where(Incubator.code == node_code))
    if incubator is None:
        raise CommandError("Unknown incubator")
    if kind == "actuador":
        command = ActuatorMqttCommand.model_validate(data)
        return apply_actuator_command(
            db, incubator, command.kind, ActuatorCommand(**command.model_dump())
        )
    if kind == "rotar":
        return apply_rotation_command(
            db, incubator, RotationCommand.model_validate(data)
        )
    if kind == "config":
        return apply_config_command(
            db, incubator, IncubatorConfigUpdate.model_validate(data)
        )
    if kind == "energia":
        from .energy import apply_energy_update

        apply_energy_update(
            db, incubator, EnergyConfigUpdate.model_validate(data), datetime.now(UTC)
        )
        return None
    raise CommandError("Unknown command")


class CommandListener:
    def __init__(
        self,
        settings: Settings,
        session_factory: sessionmaker[Session],
        send_to_node: Callable[[dict[str, object]], None],
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
        is_locked: Callable[[str], bool] = lambda _node_code: False,
        on_energy_change: Callable[[], None] | None = None,
    ) -> None:
        self.settings = settings
        self.on_energy_change = on_energy_change
        self.enabled = settings.mqtt_enabled
        self.session_factory = session_factory
        self.send_to_node = send_to_node
        self.is_locked = is_locked
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None

    def start(self) -> None:
        if not self.enabled or self._client is not None:
            return
        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self.settings.mqtt_client_id}-commands",
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
            logger.error("MQTT broker rejected the command listener: %s", reason_code)
            return
        client.subscribe([(f"smartegg/+/comandos/{kind}", 1) for kind in COMMAND_KINDS])

    def _on_message(
        self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage
    ) -> None:
        parts = message.topic.split("/")
        if len(parts) != 4 or parts[2] != "comandos":
            return
        self.handle(parts[1], parts[3], message.payload)

    def handle(self, node_code: str, kind: str, payload: bytes) -> dict[str, object]:
        result: dict[str, object] = {"command": kind}
        try:
            data = json.loads(payload.decode("utf-8")) if payload else {}
            if not isinstance(data, dict):
                raise CommandError("Command payload must be a JSON object")
            request_id = data.pop("request_id", None)
            if request_id is not None:
                result["request_id"] = request_id
            if kind != "energia" and self.is_locked(node_code):
                # The node rejects them too; answering here keeps the page honest.
                raise SystemLockedError("System locked: present an authorized card")
            with self.session_factory() as db:
                frame = execute_command(db, node_code, kind, data)
            if frame is None:
                if self.on_energy_change is not None:
                    self.on_energy_change()
            else:
                try:
                    self.send_to_node(frame)
                    result["delivered"] = True
                except RuntimeError as exc:
                    # The command stays recorded; the client learns that it did
                    # not reach the node because the gateway is offline.
                    result["delivered"] = False
                    result["detail"] = str(exc)
            result["ok"] = True
        except SystemLockedError as exc:
            result.update(ok=False, error="system_locked", detail=str(exc))
        except ValidationError as exc:
            result.update(
                ok=False, error="invalid_payload", detail=exc.errors()[0]["msg"]
            )
        except (CommandError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            result.update(ok=False, error="rejected", detail=str(exc))
        except Exception as exc:
            logger.exception("Could not apply MQTT command %s", kind)
            result.update(ok=False, error="backend_error", detail=str(exc))
        result["recorded_at"] = datetime.now(UTC).isoformat()
        self._publish_result(node_code, result)
        return result

    def _publish_result(self, node_code: str, result: dict[str, object]) -> None:
        if self._client is None:
            return
        self._client.publish(
            f"smartegg/{node_code}/comandos/resultado",
            json.dumps(result, separators=(",", ":"), ensure_ascii=False),
            qos=1,
            retain=False,
        )
