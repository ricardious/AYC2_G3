"""Exporta la telemetría histórica de la Fase 2 (Neon) a datos/telemetria_fase2.csv.

Lee la cadena de conexión de NEON_DATABASE_URL, o de ml/.env si no está en el
entorno. Los actuadores y el estado del sensor solo vienen en la trama original
(raw_payload, p. ej. "TEMP:37.5,HUM:58,DOOR:0,HEATER:1,...").

  python ml/anomalias/exportar_telemetria.py [--nodo NODE-01]
"""

from __future__ import annotations

import argparse
import os
import pathlib

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
OUTPUT = HERE / "datos" / "telemetria_fase2.csv"
COLUMNS = ["recorded_at", "temperature_c", "humidity_pct", "door_open", "occupied_slots",
           "heater", "fan", "servo_angle", "buzzer", "system_enabled", "sensor_ok"]
# Campo de la trama → columna del CSV.
RAW_FIELDS = {"HEATER": "heater", "FAN": "fan", "SERVO": "servo_angle", "BUZZER": "buzzer",
              "POWER": "system_enabled", "SENSOR": "sensor_ok"}
QUERY = """
    SELECT t.recorded_at, t.temperature_c, t.humidity_pct, t.door_open, t.occupied_slots,
           t.raw_payload
    FROM telemetry_readings t JOIN incubators i ON i.id = t.incubator_id
    WHERE i.code = %s
    ORDER BY t.recorded_at
"""


def database_url() -> str:
    if url := os.environ.get("NEON_DATABASE_URL"):
        return url
    env_file = HERE.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "NEON_DATABASE_URL":
                return value.strip().strip("'\"")
    raise SystemExit("Falta NEON_DATABASE_URL (variable de entorno o ml/.env)")


def parse_raw(raw: str | None) -> dict[str, float]:
    values: dict[str, float] = {}
    for fragment in (raw or "").split(","):
        key, _, value = fragment.partition(":")
        column = RAW_FIELDS.get(key.strip().upper())
        if column:
            try:
                values[column] = float(value)
            except ValueError:
                continue
    return values


def export(node: str, output: pathlib.Path = OUTPUT) -> pd.DataFrame:
    import psycopg

    with psycopg.connect(database_url()) as connection:
        rows = connection.execute(QUERY, (node,)).fetchall()
    records = []
    for recorded_at, temperature, humidity, door, slots, raw in rows:
        record = {"recorded_at": recorded_at, "temperature_c": temperature,
                  "humidity_pct": humidity, "door_open": door, "occupied_slots": slots,
                  **parse_raw(raw)}
        records.append(record)
    df = pd.DataFrame(records).reindex(columns=COLUMNS)
    df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True).dt.strftime(
        "%Y-%m-%dT%H:%M:%S.%fZ")
    # Las columnas system_enabled y sensor_ok de la tabla están vacías en las
    # primeras lecturas (18 sep), pero la trama sí trae POWER y SENSOR. Si una
    # trama no trae un campo, queda vacío y no cuenta como operación normal.
    for column in COLUMNS[3:]:
        df[column] = df[column].astype("Int64")
    output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output, index=False)
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--nodo", default="NODE-01")
    parser.add_argument("--salida", type=pathlib.Path, default=OUTPUT)
    args = parser.parse_args()
    df = export(args.nodo, args.salida)
    print(f"{len(df)} lecturas de {args.nodo} "
          f"({df['recorded_at'].min()} a {df['recorded_at'].max()}) → {args.salida}")


if __name__ == "__main__":
    main()
