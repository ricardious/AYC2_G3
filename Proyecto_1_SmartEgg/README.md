# Proyecto 1 — SmartEgg

SmartEgg es un sistema de incubadora inteligente IoT. Este proyecto reutiliza como base
el frontend, el servidor y el firmware desarrollados para la Práctica 1.

## Estructura

```text
Proyecto_1_SmartEgg/
├── client/       # Aplicación web en Next.js
├── server/       # API REST y WebSocket en FastAPI
├── db/           # Modelo relacional y consultas de PostgreSQL
├── firmware/     # Referencia al firmware reutilizado de la Práctica 1
├── docs/         # Documentación y enunciado
├── grafana/      # Dashboards y configuración de Grafana
├── mqtt/         # Mosquitto, ACL y contrato de topics MQTT
└── docker-compose.yml
```

La base de datos PostgreSQL se ejecuta fuera del servidor como un servicio independiente
y conserva sus datos en el volumen Docker `postgres_data`. El modelo documentado está
en `db/schema.dbml` y las consultas de Grafana en `db/grafana_queries.sql`.

## Ejecución local

### Base de datos

```bash
cp .env.example .env
docker compose up -d database
```

### Broker MQTT

```bash
docker compose up -d broker
```

Mosquitto escucha en `1883` para MQTT TCP y en `9001` para MQTT sobre WebSocket.
Consulte `mqtt/README.md` antes de desplegarlo fuera de una red local.

### Grafana

```bash
docker compose up -d grafana
```

Grafana estará disponible en `http://localhost:3001`. Al iniciar cargamos los
datasources de PostgreSQL y MQTT junto con los dashboards del proyecto. Los detalles
están en `grafana/README.md`.

### Servidor

Requiere Python 3.12 o superior y `uv`.

```bash
cd server
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run fastapi dev --host 0.0.0.0
```

La API estará disponible en `http://localhost:8000` y su documentación en
`http://localhost:8000/docs`.

### Cliente

Requiere Node.js y `pnpm`.

```bash
cd client
pnpm install
pnpm dev
```

El frontend estará disponible en `http://localhost:3000`.

## Firmware

El firmware no se duplicó en este proyecto. Se reutiliza sin cambios el código de
`Practica_1_SmartEgg/firmware`.
