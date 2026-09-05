# Proyecto 1 — SmartEgg

SmartEgg es un sistema de incubadora inteligente IoT. Este proyecto reutiliza como base
el frontend, el servidor y el firmware desarrollados para la Práctica 1.

## Estructura

```text
Proyecto_1_SmartEgg/
├── client/       # Aplicación web en Next.js
├── server/       # API REST y WebSocket en FastAPI
├── db/           # Base de datos SQLite, fuera del servidor
├── firmware/     # Referencia al firmware reutilizado de la Práctica 1
├── docs/         # Documentación y enunciado
├── grafana/      # Configuración de visualización
├── mqtt/         # Configuración de mensajería IoT
└── docker-compose.yml
```

La base de datos local se genera en `db/smartegg.db` y no se incluye en Git.

## Ejecución local

### Servidor

Requiere Python 3.12 o superior y `uv`.

```bash
cd server
uv sync
cp .env.example .env
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
