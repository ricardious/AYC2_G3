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

### Plataforma completa

```bash
cp .env.example .env
docker compose up -d --build
```

Con este comando levantamos PostgreSQL, Mosquitto, el backend y Grafana. El backend
aplica las migraciones antes de iniciar y queda disponible en `http://localhost:8000`.
Podemos verificar todos los servicios con:

```bash
docker compose ps
curl http://localhost:8000/health
```

Para conectar el Arduino por `/dev/ttyACM0` usamos el archivo adicional:

```bash
docker compose -f docker-compose.yml -f docker-compose.serial.yml up -d --build
```

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

Para ejecutar el servidor sin Docker requiere Python 3.12 o superior y `uv`.

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

## Visualización de datos

El frontend incluye un **Observatorio** interactivo con p5.js: vista isométrica
de la incubadora, capas de temperatura y humedad, estructura desplegable e
inspección de posiciones. El historial utiliza Chart.js con lecturas reales,
filtros por cantidad de muestras y una tabla de valores. Ambas vistas conservan
los temas claro, oscuro y automático.

La elección de librerías, el flujo de datos y el guion del video están en
[client/README.md](client/README.md#visualización-avanzada). Falta grabar el video
demostrativo con el nodo físico y agregar su enlace.

## Firmware reutilizado

El firmware no se duplicó en este proyecto. Se reutiliza sin cambios el código de
`Practica_1_SmartEgg/firmware`.
