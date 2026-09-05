"""Emit realistic samples to a running SmartEgg API without physical hardware."""

from __future__ import annotations

import json
import math
import os
import random
import time
import urllib.error
import urllib.request

BASE_URL = os.getenv("SMARTEGG_SIM_BASE_URL", "http://127.0.0.1:8000/api/v1")
USERNAME = os.getenv("SMARTEGG_SIM_USERNAME")
PASSWORD = os.getenv("SMARTEGG_SIM_PASSWORD")
NODE_CODE = os.getenv("SMARTEGG_SIM_NODE", "NODE-01")
INTERVAL = float(os.getenv("SMARTEGG_SIM_INTERVAL_SECONDS", "2"))


def request_json(path: str, payload: dict, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())


def main() -> None:
    if not USERNAME or not PASSWORD:
        raise SystemExit("Set SMARTEGG_SIM_USERNAME and SMARTEGG_SIM_PASSWORD")
    token = request_json("/auth/login", {"username": USERNAME, "password": PASSWORD})[
        "access_token"
    ]
    tick = 0
    print(f"Simulating {NODE_CODE} every {INTERVAL:g}s; Ctrl+C to stop")
    while True:
        temperature = 37.5 + math.sin(tick / 12) * 0.45 + random.uniform(-0.08, 0.08)
        humidity = 58 + math.sin(tick / 17) * 3 + random.uniform(-0.5, 0.5)
        payload = {
            "incubator_code": NODE_CODE,
            "temperature_c": round(temperature, 2),
            "humidity_pct": round(humidity, 1),
            "door_open": False,
            "occupied_slots": 3,
            "source": "simulator",
        }
        try:
            reading = request_json("/telemetry", payload, token)
            print(
                reading["recorded_at"],
                reading["temperature_c"],
                reading["humidity_pct"],
            )
        except urllib.error.HTTPError as exc:
            print(exc.read().decode())
        tick += 1
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
