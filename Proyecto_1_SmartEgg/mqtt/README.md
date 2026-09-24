# Broker MQTT

Para el proyecto usamos Eclipse Mosquitto como broker MQTT. Por medio de este broker
conectamos el backend con el frontend y Grafana para enviar la telemetría y las alarmas
en tiempo real.

Dejamos habilitada la autenticación por usuario y contraseña con mínimo privilegio:
`smartegg` publica desde el backend, `smartegg-frontend` sólo lee los tres topics de la
consola y `smartegg-grafana` sólo lee la jerarquía de SmartEgg.

## Levantar Mosquitto

Primero creamos el archivo de variables de entorno:

```bash
cp .env.example .env
```

En ese archivo cambiamos `MQTT_PASSWORD`, `MQTT_FRONTEND_PASSWORD`,
`MQTT_GRAFANA_PASSWORD` y `POSTGRES_PASSWORD`. Luego levantamos el broker desde la raíz
del proyecto:

```bash
docker compose up -d broker
docker compose ps
```

Usamos los siguientes puertos:

- `1883` para la conexión MQTT del backend y Grafana.
- `9001` para la conexión MQTT sobre WebSocket del frontend.

El servicio `mqtt-password-init` regenera las tres cuentas usando esas contraseñas. Para
compatibilidad con instalaciones anteriores, las dos claves de lectura heredan
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

## Despliegue en AWS

El despliegue documentado en este repositorio usa Mosquitto local mediante
Docker Compose. La configuración para AWS queda como alternativa, no como
evidencia de un despliegue remoto ya realizado.

En AWS harían falta TLS y reglas de red para no publicar directamente los puertos inseguros.
Dejamos `config/mosquitto-tls.conf.example` como base para configurar los certificados.
Los certificados, contraseñas y archivos `.env` no se incluyen en Git.
