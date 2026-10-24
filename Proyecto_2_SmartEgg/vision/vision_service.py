"""Servicio de visión de SmartEgg: clasifica las fotos de la bandeja.

Recibe por MQTT las fotos que publica el gateway, las clasifica con el modelo
ONNX entrenado en ml/vision (huevo / objeto / vacio) usando solo OpenCV y
publica el resultado. Para no bloquear la incubadora por un error aislado, la
detección se confirma cuando 3 de las últimas 5 fotos salen como "objeto"; el
backend recibe esa señal y bloquea el nodo.

Topics:
  smartegg/{nodo}/camara/foto       gateway → visión. JPEG de la bandeja.               QoS 0.
  smartegg/{nodo}/vision/resultado  visión → backend, Grafana y página. JSON. Retenido. QoS 0.
  smartegg/vision/estado            online/offline del servicio. Retenido, con LWT.     QoS 1.

Uso:
  python vision_service.py                       # configuración por variables de entorno
  python vision_service.py --broker localhost --modelo ../ml/vision/modelo/smartegg_vision.onnx
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import cv2
import numpy as np
import paho.mqtt.client as mqtt

logger = logging.getLogger("smartegg.vision")

DEFAULT_MODEL = (pathlib.Path(__file__).resolve().parents[1]
                 / "ml/vision/modelo/smartegg_vision.onnx")
PHOTO_TOPIC = "smartegg/+/camara/foto"
STATUS_TOPIC = "smartegg/vision/estado"
OBJECT_CLASS = "objeto"


@dataclass(frozen=True)
class VisionConfig:
    model_path: pathlib.Path
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    client_id: str
    window: int = 5
    votes_to_alert: int = 3
    tls: bool = False
    ca_cert: str | None = None


class Classifier:
    """Modelo ONNX con la normalización y el softmax incluidos (ver ml/vision)."""

    def __init__(self, model_path: pathlib.Path) -> None:
        info = json.loads((model_path.parent / "clases.json").read_text())
        self.classes: list[str] = info["clases"]
        height, width = info["entrada"]["forma"][2:]
        self.size = (width, height)
        self.net = cv2.dnn.readNetFromONNX(str(model_path))

    def classify(self, jpeg: bytes) -> np.ndarray:
        bgr = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("la foto no es una imagen válida")
        blob = cv2.dnn.blobFromImage(bgr, 1.0, self.size, swapRB=True, crop=False)
        self.net.setInput(blob)
        return self.net.forward()[0]


class ObjectVote:
    """Ventana de las últimas fotos: confirma un objeto con `needed` de `window` votos."""

    def __init__(self, window: int = 5, needed: int = 3) -> None:
        self.needed = needed
        self.recent: deque[bool] = deque(maxlen=window)

    def add(self, is_object: bool) -> bool:
        self.recent.append(is_object)
        return self.votes >= self.needed

    @property
    def votes(self) -> int:
        return sum(self.recent)


class VisionService:
    def __init__(
        self,
        config: VisionConfig,
        classifier: Classifier,
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
    ) -> None:
        self.config = config
        self.classifier = classifier
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None
        self._votes: dict[str, ObjectVote] = {}
        self._detected: dict[str, bool] = {}

    def start(self) -> None:
        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.config.client_id,
            protocol=mqtt.MQTTv311,
        )
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        if self.config.mqtt_username:
            client.username_pw_set(self.config.mqtt_username, self.config.mqtt_password)
        if self.config.tls:
            client.tls_set(ca_certs=self.config.ca_cert)
        client.will_set(STATUS_TOPIC, self._encode({"status": "offline"}),
                        qos=1, retain=True)
        client.reconnect_delay_set(min_delay=1, max_delay=10)
        self._client = client
        client.connect_async(self.config.mqtt_host, self.config.mqtt_port, keepalive=30)

    def run_forever(self) -> None:
        if self._client is None:
            self.start()
        assert self._client is not None
        self._client.loop_forever(retry_first_connection=True)

    def stop(self) -> None:
        if self._client is None:
            return
        info = self._client.publish(STATUS_TOPIC,
                                    self._encode({"status": "offline"}), qos=1, retain=True)
        try:
            info.wait_for_publish(timeout=2)
        except RuntimeError:
            pass  # Sin conexión: el LWT avisa por nosotros.
        self._client.disconnect()

    def _on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any,
                    _properties: Any) -> None:
        if reason_code != 0:
            logger.error("El broker rechazó la conexión: %s", reason_code)
            return
        client.subscribe(PHOTO_TOPIC, qos=0)
        client.publish(STATUS_TOPIC, self._encode({
            "status": "online",
            "modelo": self.config.model_path.name,
            "clases": self.classifier.classes,
            "regla": f"{self.config.votes_to_alert} de {self.config.window} fotos",
            "recorded_at": datetime.now(UTC).isoformat(),
        }), qos=1, retain=True)
        logger.info("Conectado al broker %s:%s", self.config.mqtt_host, self.config.mqtt_port)

    def _on_message(self, _client: mqtt.Client, _userdata: Any,
                    message: mqtt.MQTTMessage) -> None:
        parts = message.topic.split("/")
        if len(parts) != 4 or parts[2:] != ["camara", "foto"]:
            return
        try:
            self.handle_photo(parts[1], message.payload)
        except ValueError as exc:
            logger.warning("Foto descartada de %s: %s", parts[1], exc)

    def handle_photo(self, node: str, jpeg: bytes) -> dict[str, object]:
        started = time.perf_counter()
        probabilities = self.classifier.classify(jpeg)
        elapsed_ms = (time.perf_counter() - started) * 1000
        predicted = self.classifier.classes[int(probabilities.argmax())]
        vote = self._votes.setdefault(node, ObjectVote(self.config.window,
                                                       self.config.votes_to_alert))
        detected = vote.add(predicted == OBJECT_CLASS)
        result: dict[str, object] = {
            "clase": predicted,
            "confianza": round(float(probabilities.max()), 4),
            "probabilidades": {name: round(float(value), 4)
                               for name, value in zip(self.classifier.classes, probabilities,
                                                      strict=True)},
            "votos_objeto": vote.votes,
            "ventana": len(vote.recent),
            "objeto_detectado": detected,
            "inferencia_ms": round(elapsed_ms, 1),
            "recorded_at": datetime.now(UTC).isoformat(),
        }
        logger.debug("%s: %s %.0f%% (%d/%d votos de objeto, %.0f ms)", node, predicted,
                     probabilities.max() * 100, vote.votes, len(vote.recent), elapsed_ms)
        if detected != self._detected.get(node, False):
            self._detected[node] = detected
            if detected:
                logger.warning("%s: objeto confirmado (%d de %d fotos)", node, vote.votes,
                               len(vote.recent))
            else:
                logger.info("%s: la bandeja volvió a la normalidad", node)
        if self._client is not None:
            self._client.publish(f"smartegg/{node}/vision/resultado", self._encode(result),
                                 qos=0, retain=True)
        return result

    @staticmethod
    def _encode(payload: dict[str, object]) -> str:
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def parse_args(argv: list[str] | None = None) -> tuple[VisionConfig, bool]:
    env = os.environ.get
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--modelo", type=pathlib.Path,
                        default=pathlib.Path(env("VISION_MODEL_PATH", str(DEFAULT_MODEL))))
    parser.add_argument("--broker", default=env("MQTT_HOST", "localhost"))
    parser.add_argument("--puerto-mqtt", type=int, default=int(env("MQTT_PORT", "1883")))
    parser.add_argument("--usuario", default=env("MQTT_USERNAME", "smartegg-vision"))
    parser.add_argument("--clave", default=env("MQTT_PASSWORD"))
    parser.add_argument("--ventana", type=int, default=int(env("VISION_WINDOW", "5")))
    parser.add_argument("--votos", type=int, default=int(env("VISION_VOTES", "3")),
                        help="fotos de objeto dentro de la ventana para confirmar")
    parser.add_argument("--tls", action="store_true",
                        default=env("MQTT_TLS", "false").lower() == "true")
    parser.add_argument("--ca", default=env("MQTT_CA_CERT"))
    parser.add_argument("-v", "--detalle", action="store_true",
                        help="mostrar el resultado de cada foto")
    args = parser.parse_args(argv)
    if not 1 <= args.votos <= args.ventana:
        parser.error("--votos debe estar entre 1 y --ventana")
    return VisionConfig(
        model_path=args.modelo,
        mqtt_host=args.broker,
        mqtt_port=args.puerto_mqtt,
        mqtt_username=args.usuario,
        mqtt_password=args.clave,
        client_id=env("MQTT_CLIENT_ID", "smartegg-vision"),
        window=args.ventana,
        votes_to_alert=args.votos,
        tls=args.tls,
        ca_cert=args.ca,
    ), args.detalle


def main() -> None:
    config, verbose = parse_args()
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    service = VisionService(config, Classifier(config.model_path))
    logger.info("Modelo %s con clases %s", config.model_path, service.classifier.classes)
    try:
        service.run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        service.stop()


if __name__ == "__main__":
    main()
