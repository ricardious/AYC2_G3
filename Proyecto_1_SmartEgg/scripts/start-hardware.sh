#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$project_dir/.env"

if [[ ! -f "$env_file" ]]; then
  echo "Falta $env_file; copia .env.example y configura SERIAL_DEVICE." >&2
  exit 1
fi

serial_device="$(sed -n 's/^SERIAL_DEVICE=//p' "$env_file" | tail -n 1)"
if [[ -z "$serial_device" ]]; then
  echo "Falta SERIAL_DEVICE en $env_file." >&2
  exit 1
fi

echo "Esperando el dispositivo SmartEgg: $serial_device"
for _ in {1..30}; do
  if [[ -e "$serial_device" ]]; then
    cd "$project_dir"
    docker compose -f docker-compose.yml -f docker-compose.serial.yml \
      up -d --no-deps --force-recreate backend
    echo "Backend recreado con el dispositivo serial actual."
    exit 0
  fi
  sleep 1
done

echo "No apareció el dispositivo serial después de 30 segundos." >&2
exit 1
