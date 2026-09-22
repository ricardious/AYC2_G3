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

Podemos escuchar todos los topics del proyecto con:

```bash
mosquitto_sub -h localhost -p 1883 \
  -u smartegg -P '<contraseña>' \
  -t 'smartegg/#' -v
```

Desde otra terminal publicamos un mensaje de prueba:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u smartegg -P '<contraseña>' \
  -t 'smartegg/NODE-01/status' \
  -m '{"status":"online"}' -q 1 -r
```

La lista completa de topics, los niveles de QoS y los payloads que usamos están en
`TOPICS.md`.

## Despliegue en AWS

Durante el desarrollo podemos ejecutar Mosquitto localmente. Para la entrega tenemos
previsto desplegar solamente el broker en AWS y mantener PostgreSQL en el equipo local.

En AWS usaremos TLS y reglas de red para no publicar directamente los puertos inseguros.
Dejamos `config/mosquitto-tls.conf.example` como base para configurar los certificados.
Los certificados, contraseñas y archivos `.env` no se incluyen en Git.
