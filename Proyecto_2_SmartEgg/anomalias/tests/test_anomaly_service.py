from __future__ import annotations

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from anomaly_service import (  # noqa: E402, I001
    DEFAULT_MODEL,
    FEATURES,
    AlertWindow,
    AnomalyConfig,
    AnomalyModel,
    AnomalyService,
    FeatureBuilder,
    Reading,
    parse_args,
)

START = datetime(2026, 10, 23, 20, 0, tzinfo=UTC)


class FakeMessage:
    def __init__(self, topic: str, payload: dict[str, object], retain: bool = False) -> None:
        self.topic = topic
        self.payload = json.dumps(payload).encode()
        self.retain = retain


class FakeClient:
    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        self.published: list[tuple[str, Any, int, bool]] = []
        self.subscribed: list[tuple[str, int]] = []
        self.will: tuple[str, str, int, bool] | None = None
        self.on_connect = self.on_message = None

    def username_pw_set(self, *_args: Any) -> None:
        pass

    def will_set(self, topic: str, payload: str, qos: int, retain: bool) -> None:
        self.will = (topic, payload, qos, retain)

    def reconnect_delay_set(self, **_kwargs: Any) -> None:
        pass

    def connect_async(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    def subscribe(self, topic: str, qos: int) -> None:
        self.subscribed.append((topic, qos))

    def publish(self, topic: str, payload: Any, qos: int, retain: bool) -> None:
        self.published.append((topic, payload, qos, retain))


CONFIG = AnomalyConfig(
    model_path=DEFAULT_MODEL,
    mqtt_host="broker",
    mqtt_port=1883,
    mqtt_username="smartegg-ml",
    mqtt_password="secreto",
    client_id="smartegg-ml-test",
)


@pytest.fixture(scope="module")
def model() -> AnomalyModel:
    if not DEFAULT_MODEL.exists():
        pytest.skip("falta el modelo exportado por ml/anomalias")
    return AnomalyModel.load(DEFAULT_MODEL)


def reading(seconds: float, temperature: float = 37.5, humidity: float = 58.0,
            **extra: object) -> dict[str, object]:
    return {"temperature_c": temperature, "humidity_pct": humidity, "system_enabled": True,
            "recorded_at": (START + timedelta(seconds=seconds)).isoformat(), **extra}


def stable(service: AnomalyService, count: int = 40, node: str = "NODE-01") -> float:
    """Lecturas normales cada 2.6 s, como manda la ESP32; devuelve el último tiempo."""
    seconds = 0.0
    for index in range(count):
        seconds = index * 2.6
        service.handle_reading(node, reading(seconds, 37.5 + 0.05 * (index % 2)))
    return seconds


def test_features_need_twenty_seconds_and_measure_speed() -> None:
    builder = FeatureBuilder()
    assert builder.add(Reading(0, 37.0, 60.0)) is None
    assert builder.add(Reading(10, 37.2, 59.0)) is None
    features = builder.add(Reading(30, 38.0, 57.0))
    assert features is not None
    assert tuple(features) == FEATURES
    assert features["vel_temp"] == pytest.approx(2.0)  # +1 °C en 30 s → 2 °C/min
    assert features["vel_hum"] == pytest.approx(-6.0)
    assert features["ruido_temp"] == pytest.approx(0.5)


def test_features_skip_duplicates_and_restart_after_a_gap() -> None:
    builder = FeatureBuilder()
    for seconds in (0, 10, 25):
        builder.add(Reading(seconds, 37.5, 58.0))
    # El backend publica cada lectura en vivo y otra vez al guardarla.
    assert builder.add(Reading(25, 37.5, 58.0)) is None
    # Más de 2 minutos sin datos: la ESP32 se reinició.
    assert builder.add(Reading(300, 30.0, 70.0)) is None
    assert len(builder.history) == 1


def test_alert_needs_three_anomalous_readings_in_a_row() -> None:
    window = AlertWindow(needed=3, window=3)
    assert [window.add(flag) for flag in (True, True, False, True, True, True)] == [
        False, False, False, False, False, True]


def test_model_matches_the_service_features(model: AnomalyModel) -> None:
    with pytest.raises(ValueError):
        AnomalyModel({"features": ["temperatura"], "pipeline": None, "threshold": 0,
                      "mean": [0], "std": [1]})
    assert model.threshold > 0


def test_normal_operation_does_not_alert(model: AnomalyModel) -> None:
    service = AnomalyService(CONFIG, model, client_factory=FakeClient)
    stable(service)
    result = service.handle_reading("NODE-01", reading(40 * 2.6, 37.55))
    assert result is not None
    assert result["anomalia"] is False
    assert result["alerta"] is False


def test_temperature_spike_raises_an_alert_with_its_cause(model: AnomalyModel) -> None:
    service = AnomalyService(CONFIG, model, client_factory=FakeClient)
    last = stable(service)
    results = [service.handle_reading("NODE-01", reading(last + 2.6 * step, 44.0))
               for step in range(1, 4)]
    assert all(result["anomalia"] for result in results)
    assert results[-1]["alerta"] is True
    assert results[-1]["causa"] is not None


def test_missing_sensor_values_count_as_a_disconnected_sensor(model: AnomalyModel) -> None:
    service = AnomalyService(CONFIG, model, client_factory=FakeClient)
    last = stable(service)
    results = [service.handle_reading("NODE-01", reading(last + 2.6 * step, None, None,
                                                         sensor_ok=False))
               for step in range(1, 4)]
    assert results[-1]["alerta"] is True


def test_disabled_system_is_not_scored_and_resets_the_alert(model: AnomalyModel) -> None:
    service = AnomalyService(CONFIG, model, client_factory=FakeClient)
    last = stable(service)
    for step in range(1, 3):
        service.handle_reading("NODE-01", reading(last + 2.6 * step, 44.0))
    off = reading(last + 10, 44.0, system_enabled=False)
    assert service.handle_reading("NODE-01", off) is None
    assert service.handle_reading("NODE-01", reading(last + 13, 44.0)) is None


def test_mqtt_wiring_ignores_retained_readings(model: AnomalyModel) -> None:
    service = AnomalyService(CONFIG, model, client_factory=FakeClient)
    service.start()
    client = service._client  # noqa: SLF001
    assert isinstance(client, FakeClient)
    assert client.will == ("smartegg/ml/estado", '{"status":"offline"}', 1, True)
    client.on_connect(client, None, None, 0, None)
    assert client.subscribed == [("smartegg/+/telemetria", 0)]
    status = json.loads(client.published[-1][1])
    assert status["status"] == "online"
    assert status["caracteristicas"] == list(FEATURES)

    client.on_message(client, None, FakeMessage("smartegg/NODE-01/telemetria",
                                                reading(0), retain=True))
    assert len(client.published) == 1
    for index in range(12):
        client.on_message(client, None, FakeMessage("smartegg/NODE-01/telemetria",
                                                    reading(index * 2.6)))
    topic, payload, qos, retain = client.published[-1]
    assert topic == "smartegg/NODE-01/ml/anomalia"
    assert (qos, retain) == (0, True)
    assert set(json.loads(payload)) >= {"puntaje", "umbral", "anomalia", "alerta", "causa"}

    client.on_message(client, None, FakeMessage("smartegg/NODE-01/telemetria",
                                                {"temperature_c": "x"}))  # se descarta


def test_cli_validates_the_alert_rule() -> None:
    config, verbose = parse_args(["--alerta", "2", "--ventana", "3", "-v"])
    assert (config.alert_needed, config.alert_window, verbose) == (2, 3, True)
    with pytest.raises(SystemExit):
        parse_args(["--alerta", "4", "--ventana", "3"])
