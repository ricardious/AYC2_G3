"""Puente USB ↔ MQTT entre la ESP32 y el broker de SmartEgg.

Corre en la laptop conectada por USB a la ESP32. No interpreta las tramas:
reenvía cada línea del puerto serial al broker y escribe en el serial cada
comando que el backend publica. Así la ESP32 no necesita Wi-Fi y el backend
puede correr en la nube. Si se configura una cámara (IP Webcam en el celular),
también envía una foto de la bandeja cada segundo al servicio de visión.

Topics (prefijo smartegg/{nodo}/gateway):
  rx      ESP32 → backend. Una línea serial por mensaje, texto plano. QoS 1.
  tx      backend → ESP32. Un comando JSON por mensaje.                QoS 1.
  status  online/offline del gateway, del serial y de la cámara. Retenido, con LWT.
Y smartegg/{nodo}/camara/foto: JPEG de la bandeja para el servicio de visión. QoS 0.

Uso:
  python gateway/gateway.py --puerto /dev/ttyUSB0 --broker 3.85.10.20
  python gateway/gateway.py            # toma la configuración de gateway/.env
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
import threading
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
import serial

logger = logging.getLogger("smartegg.gateway")

ENV_FILE = pathlib.Path(__file__).resolve().parent / ".env"
JPEG_MAGIC = b"\xff\xd8"
MAX_PHOTO_BYTES = 1_000_000


def fetch_photo(url: str, timeout: float = 3.0) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read(MAX_PHOTO_BYTES + 1)


@dataclass(frozen=True)
class GatewayConfig:
    serial_port: str
    baudrate: int
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    node_code: str
    client_id: str
    tls: bool = False
    ca_cert: str | None = None
    reconnect_seconds: float = 3.0
    camera_url: str | None = None
    camera_interval_seconds: float = 1.0

    @property
    def topic_prefix(self) -> str:
        return f"smartegg/{self.node_code}/gateway"


class Gateway:
    def __init__(
        self,
        config: GatewayConfig,
        serial_factory: Callable[..., serial.Serial] = serial.serial_for_url,
        client_factory: Callable[..., mqtt.Client] = mqtt.Client,
        photo_fetcher: Callable[[str], bytes] = fetch_photo,
    ) -> None:
        self.config = config
        self.rx_topic = f"{config.topic_prefix}/rx"
        self.tx_topic = f"{config.topic_prefix}/tx"
        self.status_topic = f"{config.topic_prefix}/status"
        self.photo_topic = f"smartegg/{config.node_code}/camara/foto"
        self.serial_connected = False
        self.camera_ok: bool | None = None
        self._photo_fetcher = photo_fetcher
        self._serial: serial.Serial | None = None
        self._serial_factory = serial_factory
        self._client_factory = client_factory
        self._client: mqtt.Client | None = None
        self._write_lock = threading.Lock()
        self._stop = threading.Event()

    # MQTT ---------------------------------------------------------------

    def start_mqtt(self) -> None:
        client = self._client_factory(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.config.client_id,
            protocol=mqtt.MQTTv311,
        )
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        if self.config.mqtt_username:
            client.username_pw_set(self.config.mqtt_username, self.config.mqtt_password)
        if self.config.tls:
            client.tls_set(ca_certs=self.config.ca_cert)
        client.will_set(
            self.status_topic,
            self._encode({"status": "offline", "reason": "unexpected_disconnect"}),
            qos=1,
            retain=True,
        )
        # Las tramas se encolan mientras el broker no responde y salen al
        # reconectar; el límite evita acumular minutos de telemetría vieja.
        client.max_queued_messages_set(200)
        client.reconnect_delay_set(min_delay=1, max_delay=10)
        self._client = client
        client.connect_async(self.config.mqtt_host, self.config.mqtt_port, keepalive=30)
        client.loop_start()

    def stop(self) -> None:
        self._stop.set()
        if self._client is not None:
            info = self._publish_status("offline", reason="graceful_shutdown")
            if info is not None:
                info.wait_for_publish(timeout=2)
            self._client.disconnect()
            self._client.loop_stop()
        if self._serial is not None and self._serial.is_open:
            self._serial.close()

    def _on_connect(
        self, client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any,
        _properties: Any,
    ) -> None:
        if reason_code != 0:
            logger.error("El broker rechazó la conexión: %s", reason_code)
            return
        client.subscribe(self.tx_topic, qos=1)
        self._publish_status("online")
        logger.info("Conectado al broker %s:%s", self.config.mqtt_host,
                    self.config.mqtt_port)

    def _on_disconnect(
        self, _client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any,
        _properties: Any,
    ) -> None:
        if reason_code != 0:
            logger.warning("Se perdió la conexión con el broker: %s", reason_code)

    def _on_message(self, _client: mqtt.Client, _userdata: Any,
                    message: mqtt.MQTTMessage) -> None:
        if message.topic != self.tx_topic:
            return
        command = message.payload.decode("utf-8", errors="replace").strip()
        if not command:
            return
        if not self.write_serial(command):
            logger.warning("Comando descartado, serial desconectado: %s", command)

    def _publish_status(self, status: str, reason: str | None = None
                        ) -> mqtt.MQTTMessageInfo | None:
        if self._client is None:
            return None
        payload: dict[str, object] = {
            "status": status,
            "serial": "connected" if self.serial_connected else "disconnected",
            "port": self.config.serial_port,
            "camera": ("disabled" if not self.config.camera_url
                       else "ok" if self.camera_ok else "error"),
            "recorded_at": datetime.now(UTC).isoformat(),
        }
        if reason:
            payload["reason"] = reason
        return self._client.publish(self.status_topic, self._encode(payload), qos=1,
                                    retain=True)

    # Serial -------------------------------------------------------------

    def write_serial(self, command: str) -> bool:
        with self._write_lock:
            if self._serial is None or not self.serial_connected:
                return False
            self._serial.write((command + "\n").encode())
            self._serial.flush()
        logger.debug("→ ESP32 %s", command)
        return True

    def forward_line(self, raw: bytes) -> None:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line or self._client is None:
            return
        logger.debug("← ESP32 %s", line)
        self._client.publish(self.rx_topic, line, qos=1, retain=False)

    def _set_serial_connected(self, connected: bool) -> None:
        if connected == self.serial_connected:
            return
        self.serial_connected = connected
        # Al cerrar, el "offline" ordenado ya quedó retenido y no se pisa.
        if not self._stop.is_set():
            self._publish_status("online")

    def run_serial(self) -> None:
        while not self._stop.is_set():
            try:
                connection = self._serial_factory(
                    self.config.serial_port,
                    self.config.baudrate,
                    timeout=1,
                    do_not_open=True,
                )
                # En la ESP32 DevKit, DTR y RTS van a BOOT y EN: si quedan
                # activos al abrir el puerto, la placa se reinicia.
                connection.dtr = False
                connection.rts = False
                connection.open()
                connection.reset_input_buffer()
                with connection:
                    self._serial = connection
                    self._set_serial_connected(True)
                    logger.info("Puerto serial abierto: %s", self.config.serial_port)
                    while not self._stop.is_set():
                        raw = connection.readline()
                        if raw:
                            self.forward_line(raw)
            except Exception as exc:
                if not self._stop.is_set():
                    logger.warning("Serial no disponible (%s); reintento en %.0f s",
                                   exc, self.config.reconnect_seconds)
            finally:
                with self._write_lock:
                    self._serial = None
                self._set_serial_connected(False)
            self._stop.wait(self.config.reconnect_seconds)

    # Cámara -------------------------------------------------------------

    def capture_photo(self) -> bool:
        """Toma una foto y la publica; devuelve si la cámara respondió."""
        try:
            photo = self._photo_fetcher(self.config.camera_url or "")
            if not photo.startswith(JPEG_MAGIC) or len(photo) > MAX_PHOTO_BYTES:
                raise ValueError(f"respuesta inválida ({len(photo)} bytes)")
        except Exception as exc:
            if self.camera_ok is not False:
                logger.warning("Cámara no disponible: %s", exc)
            self._set_camera_ok(False)
            return False
        if self.camera_ok is not True:
            logger.info("Cámara conectada: %s", self.config.camera_url)
        self._set_camera_ok(True)
        if self._client is not None:
            # QoS 0 y sin retener: si el broker va lento, mejor perder una
            # foto que procesar fotos viejas.
            self._client.publish(self.photo_topic, photo, qos=0, retain=False)
        return True

    def _set_camera_ok(self, ok: bool) -> None:
        if ok == self.camera_ok:
            return
        self.camera_ok = ok
        if not self._stop.is_set():
            self._publish_status("online")

    def run_camera(self) -> None:
        while not self._stop.is_set():
            self.capture_photo()
            self._stop.wait(self.config.camera_interval_seconds)

    @staticmethod
    def _encode(payload: dict[str, object]) -> str:
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def load_env_file(path: pathlib.Path = ENV_FILE) -> None:
    """Carga gateway/.env sin pisar variables ya definidas en el entorno."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and not key.startswith("#"):
            os.environ.setdefault(key.strip(), value.strip())


def parse_args(argv: list[str] | None = None) -> tuple[GatewayConfig, bool]:
    load_env_file()
    env = os.environ.get
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--puerto", default=env("GATEWAY_SERIAL_PORT", "/dev/ttyUSB0"),
                        help="puerto de la ESP32; mejor /dev/serial/by-id/...")
    parser.add_argument("--baudios", type=int, default=int(env("GATEWAY_BAUDRATE", "115200")))
    parser.add_argument("--broker", default=env("MQTT_HOST", "localhost"))
    parser.add_argument("--puerto-mqtt", type=int, default=int(env("MQTT_PORT", "1883")))
    parser.add_argument("--usuario", default=env("MQTT_USERNAME", "smartegg-gateway"))
    parser.add_argument("--clave", default=env("MQTT_PASSWORD"))
    parser.add_argument("--nodo", default=env("NODE_CODE", "NODE-01"))
    parser.add_argument("--tls", action="store_true",
                        default=env("MQTT_TLS", "false").lower() == "true")
    parser.add_argument("--ca", default=env("MQTT_CA_CERT"))
    parser.add_argument("--camara-url", default=env("CAMERA_URL"),
                        help="foto de la cámara, p. ej. IP Webcam: http://127.0.0.1:8080/shot.jpg")
    parser.add_argument("--camara-intervalo", type=float,
                        default=float(env("CAMERA_INTERVAL_SECONDS", "1.0")),
                        help="segundos entre fotos (por defecto 1)")
    parser.add_argument("-v", "--detalle", action="store_true",
                        help="mostrar cada trama y comando")
    args = parser.parse_args(argv)
    config = GatewayConfig(
        serial_port=args.puerto,
        baudrate=args.baudios,
        mqtt_host=args.broker,
        mqtt_port=args.puerto_mqtt,
        mqtt_username=args.usuario,
        mqtt_password=args.clave,
        node_code=args.nodo,
        client_id=f"smartegg-gateway-{args.nodo}",
        tls=args.tls,
        ca_cert=args.ca,
        camera_url=args.camara_url or None,
        camera_interval_seconds=args.camara_intervalo,
    )
    return config, args.detalle


def main() -> None:
    config, verbose = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    gateway = Gateway(config)
    gateway.start_mqtt()
    if config.camera_url:
        threading.Thread(target=gateway.run_camera, name="camara", daemon=True).start()
    try:
        gateway.run_serial()
    except KeyboardInterrupt:
        pass
    finally:
        gateway.stop()


if __name__ == "__main__":
    main()
