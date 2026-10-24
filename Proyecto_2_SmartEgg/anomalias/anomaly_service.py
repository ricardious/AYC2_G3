"""Servicio de detección de anomalías de SmartEgg.

Escucha la telemetría del nodo por MQTT, calcula las mismas características con
las que se entrenó el modelo (ml/anomalias) y le pasa cada lectura a un
Local Outlier Factor. Publica el puntaje de cada lectura y una alerta cuando las
últimas 3 lecturas salen anómalas; el backend guarda los puntajes y abre una
alarma con la alerta.

Topics:
  smartegg/{nodo}/telemetria         backend → ML. Lectura de sensores.        QoS 0.
  smartegg/{nodo}/ml/anomalia        ML → backend, Grafana y página. Retenido. QoS 0.
  smartegg/ml/estado                 online/offline del servicio. Retenido, LWT. QoS 1.

Uso:
  python anomaly_service.py --broker localhost --clave '<clave de smartegg-ml>'
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import numpy as np
import paho.mqtt.client as mqtt

logger = logging.getLogger("smartegg.anomalias")

DEFAULT_MODEL = (pathlib.Path(__file__).resolve().parents[1]
                 / "ml/anomalias/modelo/smartegg_anomalias.joblib")
TELEMETRY_TOPIC = "smartegg/+/telemetria"
STATUS_TOPIC = "smartegg/ml/estado"

# Orden fijo: es el orden de las columnas con las que se entrena el modelo.
# Solo la temperatura y cómo cambian las lecturas. No se usan la humedad
# absoluta (depende del clima del día; su rango ya lo vigilan las reglas del
# backend), el ventilador (nunca se encendió en el histórico) ni el foco y la
# puerta: con ellos cada combinación poco común de foco y puerta salía como
# anomalía (~20 % de falsos positivos en la validación cruzada).
FEATURES = ("temperatura", "vel_temp", "vel_hum", "ruido_temp")
FEATURE_LABELS = {
    "temperatura": "temperatura fuera de lo normal",
    "vel_temp": "la temperatura cambia demasiado rápido",
    "vel_hum": "la humedad cambia demasiado rápido",
    "ruido_temp": "lecturas de temperatura inestables",
}

WINDOW_SECONDS = 60.0     # ventana para medir la velocidad de cambio
MIN_SPAN_SECONDS = 20.0   # historial mínimo antes de calificar una lectura
SESSION_GAP_SECONDS = 120.0  # un hueco mayor es un reinicio: el historial no sirve


@dataclass(frozen=True)
class Reading:
    time: float          # segundos (epoch)
    temperature: float
    humidity: float


@dataclass
class FeatureBuilder:
    """Características de una lectura a partir del último minuto del mismo nodo.

    El entrenamiento recorre el histórico con esta misma clase, así que las
    características en vivo son idénticas a las del modelo.
    """

    history: deque[Reading] = field(default_factory=deque)

    def add(self, reading: Reading) -> dict[str, float] | None:
        if self.history:
            last = self.history[-1]
            if reading.time <= last.time:
                return None  # repetida (el backend publica en vivo y al guardar)
            if reading.time - last.time > SESSION_GAP_SECONDS:
                self.history.clear()
        self.history.append(reading)
        # Deja como referencia la última lectura con al menos 60 s de antigüedad.
        while len(self.history) > 2 and self.history[1].time <= reading.time - WINDOW_SECONDS:
            self.history.popleft()
        oldest = self.history[0]
        span = reading.time - oldest.time
        if span < MIN_SPAN_SECONDS:
            return None
        temperatures = np.array([r.temperature for r in self.history])
        steps = np.diff(temperatures)
        return {
            "temperatura": reading.temperature,
            "vel_temp": (reading.temperature - oldest.temperature) / span * 60,
            "vel_hum": (reading.humidity - oldest.humidity) / span * 60,
            "ruido_temp": float(np.abs(steps).mean()) if len(steps) else 0.0,
        }


class AnomalyModel:
    """Local Outlier Factor exportado por ml/anomalias con su umbral y estadísticas."""

    def __init__(self, bundle: Mapping[str, Any]) -> None:
        if tuple(bundle["features"]) != FEATURES:
            raise ValueError("el modelo se entrenó con otras características")
        self.pipeline = bundle["pipeline"]
        self.threshold = float(bundle["threshold"])
        self.mean = np.asarray(bundle["mean"], dtype=float)
        self.std = np.asarray(bundle["std"], dtype=float)

    @classmethod
    def load(cls, path: pathlib.Path) -> AnomalyModel:
        import joblib

        return cls(joblib.load(path))

    def score(self, features: Mapping[str, float]) -> tuple[float, bool, str | None]:
        """Puntaje (mayor = más raro), si supera el umbral y la causa principal."""
        row = np.array([[features[name] for name in FEATURES]], dtype=float)
        score = float(-self.pipeline.decision_function(row)[0])
        anomalous = score > self.threshold
        reason = None
        if anomalous:
            z = np.abs((row[0] - self.mean) / np.where(self.std > 0, self.std, 1))
            reason = FEATURE_LABELS[FEATURES[int(z.argmax())]]
        return score, anomalous, reason


class AlertWindow:
    """Alerta cuando `needed` de las últimas `window` lecturas salen anómalas.

    Una lectura rara suelta es ruido del sensor; una falla real se sostiene.
    """

    def __init__(self, needed: int = 3, window: int = 3) -> None:
        self.needed = needed
        self.recent: deque[bool] = deque(maxlen=window)

    def add(self, anomalous: bool) -> bool:
        self.recent.append(anomalous)
        return sum(self.recent) >= self.needed

    def clear(self) -> None:
        self.recent.clear()


@dataclass(frozen=True)
class AnomalyConfig:
    model_path: pathlib.Path
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    client_id: str
    alert_needed: int = 3
    alert_window: int = 3
    tls: bool = False
    ca_cert: str | None = None


def parse_time(value: object) -> float:
    if not isinstance(value, str):
        raise ValueError("la lectura no trae recorded_at")
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.timestamp()


class AnomalyService:
    def __init__(
        self,
        config: AnomalyConfig,
        model: AnomalyModel,
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
    ) -> None:
        self.config = config
        self.model = model
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None
        self._builders: dict[str, FeatureBuilder] = {}
        self._windows: dict[str, AlertWindow] = {}
        self._alerting: dict[str, bool] = {}

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
        client.subscribe(TELEMETRY_TOPIC, qos=0)
        client.publish(STATUS_TOPIC, self._encode({
            "status": "online",
            "modelo": "Local Outlier Factor",
            "caracteristicas": list(FEATURES),
            "umbral": round(self.model.threshold, 4),
            "regla": (f"{self.config.alert_needed} de {self.config.alert_window} "
                      "lecturas anómalas"),
            "recorded_at": datetime.now(UTC).isoformat(),
        }), qos=1, retain=True)
        logger.info("Conectado al broker %s:%s", self.config.mqtt_host, self.config.mqtt_port)

    def _on_message(self, _client: mqtt.Client, _userdata: Any,
                    message: mqtt.MQTTMessage) -> None:
        parts = message.topic.split("/")
        if len(parts) != 3 or parts[2] != "telemetria":
            return
        # La lectura retenida es vieja: calificarla abriría una ventana falsa.
        if message.retain:
            return
        try:
            self.handle_reading(parts[1], json.loads(message.payload))
        except (ValueError, TypeError, KeyError) as exc:
            logger.warning("Lectura descartada de %s: %s", parts[1], exc)

    def handle_reading(self, node: str, payload: Mapping[str, Any]) -> dict[str, object] | None:
        builder = self._builders.setdefault(node, FeatureBuilder())
        window = self._windows.setdefault(
            node, AlertWindow(self.config.alert_needed, self.config.alert_window))
        if payload.get("system_enabled") is False:
            # Apagada no hay nada que vigilar; al encender se empieza de cero.
            builder.history.clear()
            window.clear()
            return None
        temperature = payload.get("temperature_c")
        humidity = payload.get("humidity_pct")
        # Sin dato el sensor no respondió: se califica como 0 °C y 0 %, igual
        # que las fallas del sensor que quedaron en el histórico.
        reading = Reading(
            time=parse_time(payload.get("recorded_at")),
            temperature=float(temperature) if temperature is not None else 0.0,
            humidity=float(humidity) if humidity is not None else 0.0,
        )
        features = builder.add(reading)
        if features is None:
            return None
        score, anomalous, reason = self.model.score(features)
        alert = window.add(anomalous)
        logger.debug("%s: puntaje %.3f (umbral %.3f)%s", node, score, self.model.threshold,
                     f" anómala: {reason}" if anomalous else "")
        result: dict[str, object] = {
            "puntaje": round(score, 4),
            "umbral": round(self.model.threshold, 4),
            "anomalia": anomalous,
            "alerta": alert,
            "causa": reason,
            "caracteristicas": {name: round(value, 4) for name, value in features.items()},
            "lectura_at": payload["recorded_at"],
            "recorded_at": datetime.now(UTC).isoformat(),
        }
        if alert != self._alerting.get(node, False):
            self._alerting[node] = alert
            if alert:
                logger.warning("%s: anomalía confirmada (%s, puntaje %.2f)", node, reason, score)
            else:
                logger.info("%s: la telemetría volvió a la normalidad", node)
        if self._client is not None:
            self._client.publish(f"smartegg/{node}/ml/anomalia", self._encode(result),
                                 qos=0, retain=True)
        return result

    @staticmethod
    def _encode(payload: Mapping[str, object]) -> str:
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def parse_args(argv: list[str] | None = None) -> tuple[AnomalyConfig, bool]:
    env = os.environ.get
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--modelo", type=pathlib.Path,
                        default=pathlib.Path(env("ML_MODEL_PATH", str(DEFAULT_MODEL))))
    parser.add_argument("--broker", default=env("MQTT_HOST", "localhost"))
    parser.add_argument("--puerto-mqtt", type=int, default=int(env("MQTT_PORT", "1883")))
    parser.add_argument("--usuario", default=env("MQTT_USERNAME", "smartegg-ml"))
    parser.add_argument("--clave", default=env("MQTT_PASSWORD"))
    parser.add_argument("--alerta", type=int, default=int(env("ML_ALERT_NEEDED", "3")),
                        help="lecturas anómalas necesarias en la ventana para alertar")
    parser.add_argument("--ventana", type=int, default=int(env("ML_ALERT_WINDOW", "3")))
    parser.add_argument("--tls", action="store_true",
                        default=env("MQTT_TLS", "false").lower() == "true")
    parser.add_argument("--ca", default=env("MQTT_CA_CERT"))
    parser.add_argument("-v", "--detalle", action="store_true",
                        help="mostrar el puntaje de cada lectura")
    args = parser.parse_args(argv)
    if not 1 <= args.alerta <= args.ventana:
        parser.error("--alerta debe estar entre 1 y --ventana")
    return AnomalyConfig(
        model_path=args.modelo,
        mqtt_host=args.broker,
        mqtt_port=args.puerto_mqtt,
        mqtt_username=args.usuario,
        mqtt_password=args.clave,
        client_id=env("MQTT_CLIENT_ID", "smartegg-ml"),
        alert_needed=args.alerta,
        alert_window=args.ventana,
        tls=args.tls,
        ca_cert=args.ca,
    ), args.detalle


def main() -> None:
    config, verbose = parse_args()
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    model = AnomalyModel.load(config.model_path)
    logger.info("Modelo %s, umbral %.4f", config.model_path, model.threshold)
    service = AnomalyService(config, model)
    try:
        service.run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        service.stop()


if __name__ == "__main__":
    main()
