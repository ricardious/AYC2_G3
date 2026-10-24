# Servicio de visión

Clasifica las fotos de la bandeja con el modelo entrenado en
[`ml/vision`](../ml/vision/) (`huevo` / `objeto` / `vacio`) y avisa al backend
cuando hay un objeto extraño. Corre en Docker junto al broker, en la nube. Solo
usa **OpenCV** (`cv2.dnn`), sin PyTorch.

```mermaid
flowchart LR
    CEL["Celular<br/>IP Webcam"] -->|"USB"| GW["gateway.py<br/>laptop"]
    GW -->|"camara/foto · JPEG"| MQ{{"Mosquitto"}}
    MQ --> VIS["vision_service.py<br/>ONNX + OpenCV"]
    VIS -->|"vision/resultado"| MQ
    MQ --> BE["backend"]
    BE -->|"gateway/tx · lock"| MQ
    MQ --> GW --> ESP["ESP32<br/>buzzer + LED + LCD"]
```

## Regla de 3 de 5

El modelo se equivoca en fotos sueltas, así que una sola foto no bloquea la
incubadora. El servicio guarda las últimas 5 fotos de cada nodo y confirma el
objeto cuando **3 o más** salen como `objeto`. Con una foto por segundo, el
bloqueo llega unos 3 s después de poner el objeto.

## Topics

| Topic | Sentido | QoS | Retenido |
|---|---|---:|:---:|
| `smartegg/{nodo}/camara/foto` | gateway → visión (JPEG) | 0 | No |
| `smartegg/{nodo}/vision/resultado` | visión → backend, Grafana, página | 0 | Sí |
| `smartegg/vision/estado` | online/offline del servicio, con LWT | 1 | Sí |

Ejemplo de `vision/resultado`:

```json
{
  "clase": "objeto",
  "confianza": 0.9132,
  "probabilidades": {"huevo": 0.0521, "objeto": 0.9132, "vacio": 0.0347},
  "votos_objeto": 3,
  "ventana": 5,
  "objeto_detectado": true,
  "inferencia_ms": 18.4,
  "recorded_at": "2026-10-23T22:15:03.512+00:00"
}
```

`objeto_detectado` es el resultado de la regla de 3 de 5: es lo que el backend usa
para bloquear el nodo. `clase` y `confianza` son de la última foto.

## Uso

Con Docker Compose se levanta junto al resto (`docker compose up -d vision`).
Para correrlo fuera de Docker:

```bash
cd Proyecto_2_SmartEgg/vision
uv run vision_service.py --broker localhost --clave '<clave-de-smartegg-vision>' -v
```

| Variable | Opción | Por defecto |
|---|---|---|
| `VISION_MODEL_PATH` | `--modelo` | `../ml/vision/modelo/smartegg_vision.onnx` |
| `MQTT_HOST` / `MQTT_PORT` | `--broker` / `--puerto-mqtt` | `localhost` / `1883` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | `--usuario` / `--clave` | `smartegg-vision` / — |
| `VISION_WINDOW` / `VISION_VOTES` | `--ventana` / `--votos` | `5` / `3` |
| `MQTT_TLS` / `MQTT_CA_CERT` | `--tls` / `--ca` | `false` / — |

## Pruebas

```bash
uv run pytest
```

Las pruebas de la regla usan un clasificador falso; dos pruebas cargan el modelo
real y lo corren sobre fotos del dataset.
