# Base de datos

SmartEgg utiliza PostgreSQL como motor relacional. La base se ejecuta como un servicio
independiente definido en `docker-compose.yml` y persiste sus datos en el volumen
nombrado `postgres_data`.

El esquema se administra mediante Alembic desde `server/migrations`; no se debe editar
manualmente en producción. `schema.dbml` documenta las entidades y relaciones para
importarlas en dbdiagram.io.

## Inicio local

Desde la raíz de `Proyecto_1_SmartEgg`:

```bash
cp .env.example .env
docker compose up -d database
cd server
cp .env.example .env
uv sync
uv run alembic upgrade head
```

La contraseña de `POSTGRES_PASSWORD` en el `.env` raíz debe coincidir con la incluida
en `SMARTEGG_DATABASE_URL` dentro de `server/.env`.

## Migraciones

```bash
# Aplicar todas las migraciones
uv run alembic upgrade head

# Crear una migración después de modificar los modelos
uv run alembic revision --autogenerate -m "describe el cambio"

# Revertir la última migración
uv run alembic downgrade -1
```
