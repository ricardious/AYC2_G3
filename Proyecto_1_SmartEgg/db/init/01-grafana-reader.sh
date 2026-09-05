#!/bin/sh
set -eu

: "${GRAFANA_DB_USER:?GRAFANA_DB_USER is required}"
: "${GRAFANA_DB_PASSWORD:?GRAFANA_DB_PASSWORD is required}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=grafana_user="$GRAFANA_DB_USER" \
  --set=grafana_password="$GRAFANA_DB_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L',
  :'grafana_user',
  :'grafana_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'grafana_user'
) \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L',
  :'grafana_user',
  :'grafana_password'
) \gexec

SELECT format(
  'GRANT CONNECT ON DATABASE %I TO %I',
  current_database(),
  :'grafana_user'
) \gexec

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'grafana_user') \gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'grafana_user') \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I',
  :'grafana_user'
) \gexec
SQL
