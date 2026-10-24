# Broker MQTT

Para el proyecto usamos Eclipse Mosquitto como broker MQTT. En la Fase 3 es el
**único canal de control**: conecta el gateway de la ESP32, el backend, los servicios de
visión y de anomalías, la consola web y Grafana.

Dejamos habilitada la autenticación por usuario y contraseña con mínimo privilegio
([`config/acl`](config/acl)):

| Cuenta | Uso |
|---|---|
| `smartegg` | Backend; única cuenta que escribe el estado y `gateway/tx` |
| `smartegg-gateway` | Gateway USB ↔ MQTT y fotos de la cámara |
| `smartegg-vision` | Servicio de visión |
| `smartegg-ml` | Servicio de anomalías |
| `smartegg-frontend` | Consola web: lee el estado y solo escribe en `comandos/*` |
| `smartegg-grafana` | Solo lectura de `smartegg/#` |

## Levantar Mosquitto

Primero creamos el archivo de variables de entorno:

```bash
cp .env.example .env
```

En ese archivo cambiamos `MQTT_PASSWORD`, `MQTT_FRONTEND_PASSWORD`,
`MQTT_GRAFANA_PASSWORD`, `MQTT_GATEWAY_PASSWORD`, `MQTT_VISION_PASSWORD`,
`MQTT_ML_PASSWORD` y `POSTGRES_PASSWORD`. Luego levantamos el broker desde la raíz
del proyecto:

```bash
docker compose up -d broker
docker compose ps
```

Usamos los siguientes puertos:

- `1883` para la conexión MQTT del gateway, el backend, los servicios de ML y Grafana.
- `9001` para la conexión MQTT sobre WebSocket del frontend.

El servicio `mqtt-password-init` regenera las seis cuentas usando esas contraseñas. Para
compatibilidad con instalaciones anteriores, las claves que no se definan heredan
`MQTT_PASSWORD` cuando todavía no están definidas; conviene separarlas antes de exponer
el broker. El archivo y los datos se guardan en volúmenes de Docker y no se suben al
repositorio.

## Probar la conexión

Para una prueba aislada del broker, escuchamos un topic de diagnóstico manual:

```bash
mosquitto_sub -h localhost -p 1883 \
  -u smartegg -P '<contraseña>' \
  -t 'smartegg/diagnostico/manual' -v
```

Desde otra terminal publicamos un mensaje de prueba:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u smartegg -P '<contraseña>' \
  -t 'smartegg/diagnostico/manual' \
  -m '{"test":"publish-subscribe"}' -q 1
```

Esta prueba usa un mensaje sintético **sin retención** y no suplanta el status
real de `NODE-01`. Para acreditar la integración hay que observar una lectura
que el backend publique desde la ESP32 y que reciban Grafana y el frontend;
para retained y LWT se siguen las comprobaciones de la hoja de calificación.
El contrato de aplicación, los niveles de QoS y los payloads están en
[`TOPICS.md`](TOPICS.md) y en el README principal.

## Despliegue en la nube

En la Fase 3 el broker corre en la VM de AWS con el mismo `docker-compose.yml`, junto al
backend, la base de datos, los servicios de ML y Grafana. Dentro de la red Docker los
servicios lo encuentran como `broker:1883`; desde fuera, el gateway usa
`100.63.122.66:1883` y la consola `ws://100.63.122.66:9001`. El grupo de seguridad solo
abre esos puertos y todas las conexiones exigen usuario y contraseña. Los pasos completos
están en el [README principal](../README.md#4-infraestructura-en-la-nube).

Para cifrar las conexiones dejamos `config/mosquitto-tls.conf.example` como base.
Los certificados, contraseñas y archivos `.env` no se incluyen en Git.
