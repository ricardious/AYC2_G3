# Broker MQTT

Mosquitto funciona como broker de tiempo real entre el backend, Grafana y el frontend.
Requiere autenticación y solo permite acceso a `$SYS/#` y `smartegg/#` mediante la ACL.

## Uso local

Desde la raíz de `Proyecto_1_SmartEgg`:

```bash
cp .env.example .env
# Cambie MQTT_PASSWORD y POSTGRES_PASSWORD antes de continuar.
docker compose up -d broker
docker compose ps
```

Puertos predeterminados:

- `1883`: MQTT TCP para backend, Grafana y herramientas de prueba.
- `9001`: MQTT sobre WebSocket para el frontend.

El contenedor auxiliar `mqtt-password-init` genera el archivo de contraseñas a partir de
`MQTT_USERNAME` y `MQTT_PASSWORD`. El archivo generado y la persistencia del broker se
guardan en volúmenes Docker; ninguna contraseña se versiona.

## Prueba manual

Con los clientes de Mosquitto instalados:

```bash
mosquitto_sub -h localhost -p 1883 \
  -u smartegg -P '<contraseña>' \
  -t 'smartegg/#' -v
```

En otra terminal:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u smartegg -P '<contraseña>' \
  -t 'smartegg/NODE-01/status' \
  -m '{"status":"online"}' -q 1 -r
```

La jerarquía, QoS, uso de retained y payloads están definidos en `TOPICS.md`.

## Despliegue en AWS

La configuración predeterminada sirve para desarrollo y para comunicación privada entre
contenedores. **No exponga directamente los puertos 1883 o 9001 a Internet.**

En AWS se puede desplegar el mismo contenedor en EC2, ECS o una plataforma equivalente.
Para acceso público hay dos alternativas:

1. Terminar TLS en la infraestructura de entrada de AWS y reenviar tráfico privado hacia
   Mosquitto.
2. Montar certificados en `/mosquitto/certs` y usar como base
   `config/mosquitto-tls.conf.example` para MQTT TLS y WebSocket seguro.

Los certificados, contraseñas y archivos `.env` no deben almacenarse en Git. En el
despliegue final también deben limitarse los puertos mediante reglas de red y conservar
`/mosquitto/data` en almacenamiento persistente.
