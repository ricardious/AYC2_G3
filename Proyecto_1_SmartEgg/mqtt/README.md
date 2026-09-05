# Broker MQTT

Para el proyecto usamos Eclipse Mosquitto como broker MQTT. Por medio de este broker
conectamos el backend con el frontend y Grafana para enviar la telemetría y las alarmas
en tiempo real.

Dejamos habilitada la autenticación por usuario y contraseña. La ACL permite trabajar
únicamente con los topics de `smartegg/#` y consultar el estado del broker en `$SYS/#`.

## Levantar Mosquitto

Primero creamos el archivo de variables de entorno:

```bash
cp .env.example .env
```

En ese archivo cambiamos `MQTT_PASSWORD` y `POSTGRES_PASSWORD`. Luego levantamos el
broker desde la raíz del proyecto:

```bash
docker compose up -d broker
docker compose ps
```

Usamos los siguientes puertos:

- `1883` para la conexión MQTT del backend y Grafana.
- `9001` para la conexión MQTT sobre WebSocket del frontend.

El servicio `mqtt-password-init` genera el archivo de contraseñas usando las variables
`MQTT_USERNAME` y `MQTT_PASSWORD`. Este archivo y los datos del broker se guardan en
volúmenes de Docker, por lo que no subimos credenciales al repositorio.

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
