from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vision_service import (  # noqa: E402, I001
    DEFAULT_MODEL,
    Classifier,
    ObjectVote,
    VisionConfig,
    VisionService,
)

DATASET = Path(__file__).resolve().parents[2] / "dataset"


class FakeMessage:
    def __init__(self, topic: str, payload: bytes) -> None:
        self.topic = topic
        self.payload = payload


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


class FixedClassifier:
    """Devuelve las clases en el orden indicado, sin cargar el modelo."""

    classes = ["huevo", "objeto", "vacio"]

    def __init__(self, sequence: list[str]) -> None:
        self.sequence = list(sequence)

    def classify(self, _jpeg: bytes) -> np.ndarray:
        probabilities = np.full(3, 0.05, dtype=np.float32)
        probabilities[self.classes.index(self.sequence.pop(0))] = 0.9
        return probabilities


CONFIG = VisionConfig(
    model_path=DEFAULT_MODEL,
    mqtt_host="broker",
    mqtt_port=1883,
    mqtt_username="smartegg-vision",
    mqtt_password="secret",
    client_id="test-vision",
)


def build_service(classifier: Any) -> tuple[VisionService, FakeClient]:
    fake = FakeClient()
    service = VisionService(CONFIG, classifier, client_factory=lambda *_a, **_k: fake)
    service.start()
    return service, fake


def results(fake: FakeClient, node: str = "NODE-01") -> list[dict[str, Any]]:
    topic = f"smartegg/{node}/vision/resultado"
    return [json.loads(payload) for name, payload, _q, _r in fake.published if name == topic]


def test_vote_needs_three_of_the_last_five_photos() -> None:
    vote = ObjectVote(window=5, needed=3)

    assert [vote.add(x) for x in (True, False, True, False)] == [False] * 4
    assert vote.add(True) is True             # 3 de 5
    assert vote.add(True) is True             # sale un "no": quedan 4 de 5
    assert vote.add(False) is True            # sale un objeto: quedan 3
    assert vote.add(False) is False           # sale otro objeto: quedan 2


def test_isolated_object_photo_does_not_confirm_detection() -> None:
    service, fake = build_service(FixedClassifier(["huevo", "objeto", "huevo", "huevo"]))

    for _ in range(4):
        service.handle_photo("NODE-01", b"jpeg")

    assert [r["objeto_detectado"] for r in results(fake)] == [False] * 4


def test_three_object_photos_confirm_and_publish_retained_result() -> None:
    service, fake = build_service(FixedClassifier(["objeto", "huevo", "objeto", "objeto"]))

    for _ in range(4):
        service.handle_photo("NODE-01", b"jpeg")

    last = results(fake)[-1]
    assert last["clase"] == "objeto"
    assert last["votos_objeto"] == 3
    assert last["objeto_detectado"] is True
    assert set(last["probabilidades"]) == {"huevo", "objeto", "vacio"}
    topic, _payload, qos, retain = fake.published[-1]
    assert (topic, qos, retain) == ("smartegg/NODE-01/vision/resultado", 0, True)


def test_each_node_keeps_its_own_window() -> None:
    service, fake = build_service(FixedClassifier(["objeto", "objeto", "objeto", "huevo"]))

    for _ in range(3):
        service.handle_photo("NODE-01", b"jpeg")
    service.handle_photo("NODE-02", b"jpeg")

    assert results(fake, "NODE-01")[-1]["objeto_detectado"] is True
    assert results(fake, "NODE-02")[-1]["votos_objeto"] == 0


def test_connect_subscribes_to_photos_and_reports_online() -> None:
    _service, fake = build_service(FixedClassifier([]))

    fake.on_connect(fake, None, None, 0, None)

    assert fake.subscribed == [("smartegg/+/camara/foto", 0)]
    topic, payload, qos, retain = fake.published[-1]
    assert topic == "smartegg/vision/estado" and (qos, retain) == (1, True)
    assert json.loads(payload)["status"] == "online"
    assert json.loads(fake.will[1])["status"] == "offline"


def test_messages_on_other_topics_are_ignored() -> None:
    _service, fake = build_service(FixedClassifier(["objeto"]))

    fake.on_message(fake, None, FakeMessage("smartegg/NODE-01/gateway/rx", b"MSG:1"))

    assert results(fake) == []


@pytest.mark.skipif(not DEFAULT_MODEL.is_file(), reason="falta el modelo entrenado")
def test_real_model_classifies_dataset_photos() -> None:
    classifier = Classifier(DEFAULT_MODEL)
    for name in classifier.classes:
        photo = sorted((DATASET / name).glob("*.jpg"))[0]
        probabilities = classifier.classify(photo.read_bytes())
        assert probabilities.shape == (3,)
        assert abs(float(probabilities.sum()) - 1) < 1e-3
        assert classifier.classes[int(probabilities.argmax())] == name


@pytest.mark.skipif(not DEFAULT_MODEL.is_file(), reason="falta el modelo entrenado")
def test_invalid_photo_is_rejected_without_crashing() -> None:
    service, fake = build_service(Classifier(DEFAULT_MODEL))

    fake.on_message(fake, None, FakeMessage("smartegg/NODE-01/camara/foto", b"not a jpeg"))

    assert results(fake) == []
