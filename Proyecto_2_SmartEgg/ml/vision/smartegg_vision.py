"""Entrenamiento del clasificador de visión de SmartEgg (huevo / objeto / vacio).

Transfer learning con MobileNetV2 preentrenada en ImageNet. El modelo se
evalúa con validación cruzada por tandas y después se entrena el modelo final
con todas las fotos. El notebook `entrenar_vision.ipynb` usa estas funciones
paso a paso; también se puede correr todo de una vez desde la terminal:

  python ml/vision/smartegg_vision.py
  python ml/vision/smartegg_vision.py --particiones 3 --epocas-cabeza 5 --epocas-ajuste 5

Salidas:
  modelo/smartegg_vision.onnx   modelo final para el servicio de visión (cv2.dnn u onnxruntime)
  modelo/clases.json            clases y formato de entrada del modelo
  resultados/                   validación cruzada, matriz de confusión, curvas, errores y reporte con F1
"""

import argparse
import copy
import json
import pathlib
import random
import re
import time
from dataclasses import dataclass, field

import numpy as np
import torch
from PIL import Image, ImageOps
from torch import nn
from torchvision import models
from torchvision.transforms import v2

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_DATASET = HERE.parents[1] / "dataset"
MODEL_DIR = HERE / "modelo"
RESULTS_DIR = HERE / "resultados"

CLASSES = ("huevo", "objeto", "vacio")
IMAGE_SIZE = 224
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
# Las fotos de una misma tanda se toman cada 0.5 s; entre tandas pasan varios
# segundos mientras se acomoda la bandeja.
BURST_GAP_S = 2.0
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
SEED = 42


@dataclass
class Sample:
    path: pathlib.Path
    label: int
    group: str


@dataclass
class Split:
    train: list[Sample] = field(default_factory=list)
    val: list[Sample] = field(default_factory=list)
    test: list[Sample] = field(default_factory=list)


def set_seed(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def capture_time_ms(path: pathlib.Path) -> int:
    """Hora de captura según el timestamp del nombre (<...>_<ms>.jpg) o la fecha del archivo."""
    match = re.search(r"_(\d{13})$", path.stem)
    if match:
        return int(match.group(1))
    return int(path.stat().st_mtime * 1000)


def list_samples(dataset: pathlib.Path = DEFAULT_DATASET) -> list[Sample]:
    """Lista las fotos y las agrupa por tanda.

    Las 5 fotos de una tanda son casi idénticas. Si unas quedan en
    entrenamiento y otras en prueba, la exactitud sale inflada, así que cada
    tanda completa va a un solo conjunto.
    """
    samples = []
    for label, name in enumerate(CLASSES):
        folder = dataset / name
        if not folder.is_dir():
            raise SystemExit(f"Falta la carpeta {folder}.")
        paths = sorted((p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS),
                       key=capture_time_ms)
        if not paths:
            raise SystemExit(f"La carpeta {folder} no tiene fotos.")
        group_index = 0
        previous_ms = None
        for path in paths:
            current_ms = capture_time_ms(path)
            if previous_ms is not None and current_ms - previous_ms > BURST_GAP_S * 1000:
                group_index += 1
            previous_ms = current_ms
            samples.append(Sample(path, label, f"{name}-{group_index:03d}"))
    return samples


def split_by_group(samples: list[Sample], val_ratio: float = 0.15, test_ratio: float = 0.15,
                   seed: int = SEED) -> Split:
    """Separa en entrenamiento, validación y prueba por tandas, clase por clase."""
    rng = random.Random(seed)
    split = Split()
    for label in range(len(CLASSES)):
        groups: dict[str, list[Sample]] = {}
        for sample in samples:
            if sample.label == label:
                groups.setdefault(sample.group, []).append(sample)
        names = sorted(groups)
        rng.shuffle(names)
        total = sum(len(groups[name]) for name in names)
        targets = ((split.test, test_ratio), (split.val, val_ratio))
        remaining = names
        for subset, ratio in targets:
            taken = 0
            # Siempre deja al menos una tanda para entrenamiento.
            while remaining[1:] and taken < total * ratio:
                name = remaining[0]
                remaining = remaining[1:]
                subset.extend(groups[name])
                taken += len(groups[name])
        for name in remaining:
            split.train.extend(groups[name])
    return split


def kfold_splits(samples: list[Sample], folds: int = 5, val_ratio: float = 0.15,
                 seed: int = SEED) -> list[Split]:
    """Validación cruzada por tandas: cada tanda queda en prueba en una sola partición.

    Con pocas tandas por clase, un único conjunto de prueba depende mucho de
    qué tandas caen en él; promediar varias particiones da una medida estable.
    """
    rng = random.Random(seed)
    splits = [Split() for _ in range(folds)]
    for label in range(len(CLASSES)):
        groups: dict[str, list[Sample]] = {}
        for sample in samples:
            if sample.label == label:
                groups.setdefault(sample.group, []).append(sample)
        names = sorted(groups)
        if len(names) < folds:
            raise SystemExit(f"La clase {CLASSES[label]} tiene menos de {folds} tandas.")
        rng.shuffle(names)
        # Reparte las tandas en partes con un número parecido de fotos.
        parts: list[list[str]] = [[] for _ in range(folds)]
        sizes = [0] * folds
        for name in names:
            smallest = sizes.index(min(sizes))
            parts[smallest].append(name)
            sizes[smallest] += len(groups[name])
        total = sum(sizes)
        for index, split in enumerate(splits):
            split.test.extend(s for name in parts[index] for s in groups[name])
            remaining = [name for other, part in enumerate(parts) if other != index for name in part]
            rng.shuffle(remaining)
            taken = 0
            while remaining[1:] and taken < total * val_ratio:
                name = remaining.pop(0)
                split.val.extend(groups[name])
                taken += len(groups[name])
            split.train.extend(s for name in remaining for s in groups[name])
    return splits


def describe_split(split: Split) -> str:
    rows = [f"{'conjunto':<14}" + "".join(f"{name:>8}" for name in CLASSES) + f"{'total':>8}"]
    for title, subset in (("entrenamiento", split.train), ("validación", split.val),
                          ("prueba", split.test)):
        counts = [sum(s.label == label for s in subset) for label in range(len(CLASSES))]
        rows.append(f"{title:<14}" + "".join(f"{c:>8}" for c in counts) + f"{len(subset):>8}")
    return "\n".join(rows)


def load_image(path: pathlib.Path) -> torch.Tensor:
    """Foto como tensor uint8 3×224×224, estirada sin recortar.

    No se recorta el centro porque un objeto en la orilla de la imagen debe
    seguir viéndose (cv2.dnn.blobFromImage hace el mismo redimensionado).
    """
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.BILINEAR)
        return torch.from_numpy(np.asarray(image).copy()).permute(2, 0, 1)


def train_transform() -> v2.Compose:
    # Aumento de datos suave: cambios de luz y pequeños movimientos de la
    # bandeja, sin recortes grandes que puedan sacar un objeto de la foto.
    return v2.Compose([
        v2.RandomHorizontalFlip(),
        v2.RandomAffine(degrees=6, translate=(0.04, 0.04), scale=(0.95, 1.05)),
        v2.ColorJitter(brightness=0.35, contrast=0.3, saturation=0.25, hue=0.02),
        v2.RandomApply([v2.GaussianBlur(kernel_size=5, sigma=(0.1, 1.5))], p=0.2),
        v2.ToDtype(torch.float32, scale=True),
        v2.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


def eval_transform() -> v2.Compose:
    return v2.Compose([
        v2.ToDtype(torch.float32, scale=True),
        v2.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


class PhotoDataset(torch.utils.data.Dataset):
    """Carga todas las fotos a memoria una vez (≈750 fotos × 150 KB)."""

    def __init__(self, samples: list[Sample], transform: v2.Compose):
        self.images = [load_image(sample.path) for sample in samples]
        self.labels = [sample.label for sample in samples]
        self.transform = transform

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int):
        return self.transform(self.images[index]), self.labels[index]


def make_loaders(split: Split, batch_size: int = 32):
    generator = torch.Generator().manual_seed(SEED)
    train = torch.utils.data.DataLoader(PhotoDataset(split.train, train_transform()),
                                        batch_size=batch_size, shuffle=True, generator=generator)
    val = torch.utils.data.DataLoader(PhotoDataset(split.val, eval_transform()),
                                      batch_size=batch_size)
    test = torch.utils.data.DataLoader(PhotoDataset(split.test, eval_transform()),
                                       batch_size=batch_size)
    return train, val, test


def build_model(pretrained: bool = True) -> nn.Module:
    weights = models.MobileNet_V2_Weights.IMAGENET1K_V2 if pretrained else None
    model = models.mobilenet_v2(weights=weights)
    model.classifier = nn.Sequential(
        nn.Dropout(0.3),
        nn.Linear(model.last_channel, len(CLASSES)),
    )
    return model


def set_trainable(model: nn.Module, unfrozen_blocks: int) -> None:
    """Congela la base salvo sus últimos `unfrozen_blocks` bloques; la cabeza siempre entrena."""
    for parameter in model.features.parameters():
        parameter.requires_grad = False
    if unfrozen_blocks > 0:
        for block in model.features[-unfrozen_blocks:]:
            for parameter in block.parameters():
                parameter.requires_grad = True
    for parameter in model.classifier.parameters():
        parameter.requires_grad = True


def class_weights(samples: list[Sample]) -> torch.Tensor:
    counts = np.bincount([s.label for s in samples], minlength=len(CLASSES)).astype(np.float32)
    counts[counts == 0] = 1
    return torch.tensor(counts.sum() / (len(CLASSES) * counts))


@torch.no_grad()
def predict(model: nn.Module, loader, device: str = "cpu"):
    model.eval()
    labels, probabilities = [], []
    for images, targets in loader:
        logits = model(images.to(device))
        probabilities.append(torch.softmax(logits, dim=1).cpu())
        labels.append(targets)
    return torch.cat(labels).numpy(), torch.cat(probabilities).numpy()


def macro_f1(labels: np.ndarray, predictions: np.ndarray) -> float:
    from sklearn.metrics import f1_score

    return float(f1_score(labels, predictions, average="macro", labels=range(len(CLASSES)),
                          zero_division=0))


def run_phase(model: nn.Module, train_loader, val_loader, *, epochs: int, lr: float,
              weights: torch.Tensor, history: list[dict], phase: str, patience: int = 4,
              device: str = "cpu") -> None:
    """Entrena y deja en `model` los pesos con mejor F1 macro de validación."""
    parameters = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(parameters, lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))
    loss_fn = nn.CrossEntropyLoss(weight=weights.to(device), label_smoothing=0.05)
    best_f1, best_state, stale = -1.0, copy.deepcopy(model.state_dict()), 0

    for epoch in range(1, epochs + 1):
        started = time.monotonic()
        model.train()
        total_loss, total_correct, total_seen = 0.0, 0, 0
        for images, targets in train_loader:
            images, targets = images.to(device), targets.to(device)
            optimizer.zero_grad()
            logits = model(images)
            loss = loss_fn(logits, targets)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(targets)
            total_correct += (logits.argmax(1) == targets).sum().item()
            total_seen += len(targets)
        scheduler.step()

        val_labels, val_probabilities = predict(model, val_loader, device)
        val_predictions = val_probabilities.argmax(1)
        val_loss = float(nn.functional.cross_entropy(
            torch.from_numpy(np.log(val_probabilities + 1e-9)), torch.from_numpy(val_labels),
            reduction="mean"))
        record = {
            "fase": phase,
            "epoca": len(history) + 1,
            "perdida_entrenamiento": total_loss / total_seen,
            "exactitud_entrenamiento": total_correct / total_seen,
            "perdida_validacion": val_loss,
            "exactitud_validacion": float((val_predictions == val_labels).mean()),
            "f1_validacion": macro_f1(val_labels, val_predictions),
        }
        history.append(record)
        print(f"[{phase}] época {epoch}/{epochs}  "
              f"pérdida {record['perdida_entrenamiento']:.3f}  "
              f"exactitud {record['exactitud_entrenamiento']:.3f}  "
              f"val exactitud {record['exactitud_validacion']:.3f}  "
              f"val F1 {record['f1_validacion']:.3f}  "
              f"({time.monotonic() - started:.0f} s)", flush=True)

        if record["f1_validacion"] > best_f1:
            best_f1, best_state, stale = record["f1_validacion"], copy.deepcopy(model.state_dict()), 0
        else:
            stale += 1
            if stale >= patience:
                print(f"[{phase}] sin mejora en {patience} épocas; se detiene.", flush=True)
                break
    model.load_state_dict(best_state)


def train(model: nn.Module, train_loader, val_loader, weights: torch.Tensor, *,
          head_epochs: int = 8, finetune_epochs: int = 12, unfrozen_blocks: int = 5,
          device: str = "cpu") -> list[dict]:
    """Fase 1: solo la cabeza nueva. Fase 2: ajuste fino de los últimos bloques."""
    model.to(device)
    history: list[dict] = []
    set_trainable(model, unfrozen_blocks=0)
    run_phase(model, train_loader, val_loader, epochs=head_epochs, lr=1e-3, weights=weights,
              history=history, phase="cabeza", device=device)
    if finetune_epochs > 0:
        set_trainable(model, unfrozen_blocks=unfrozen_blocks)
        run_phase(model, train_loader, val_loader, epochs=finetune_epochs, lr=1e-4,
                  weights=weights, history=history, phase="ajuste", device=device)
    return history


def evaluate(labels: np.ndarray, probabilities: np.ndarray) -> dict:
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

    predictions = probabilities.argmax(1)
    report = classification_report(labels, predictions, labels=range(len(CLASSES)),
                                   target_names=CLASSES, digits=3, zero_division=0)
    report_dict = classification_report(labels, predictions, labels=range(len(CLASSES)),
                                        target_names=CLASSES, output_dict=True, zero_division=0)
    return {
        "exactitud": float(accuracy_score(labels, predictions)),
        "f1_macro": macro_f1(labels, predictions),
        "por_clase": {name: {key: float(report_dict[name][key])
                             for key in ("precision", "recall", "f1-score", "support")}
                      for name in CLASSES},
        "matriz_confusion": confusion_matrix(labels, predictions,
                                             labels=range(len(CLASSES))).tolist(),
        "reporte": report,
    }


def cross_validate(samples: list[Sample], folds: int = 5, *, head_epochs: int = 8,
                   finetune_epochs: int = 12, pretrained: bool = True,
                   device: str = "cpu") -> dict:
    """Entrena un modelo por partición y junta sus predicciones de prueba.

    Cada foto se predice una sola vez, con el modelo que no la vio, así que la
    matriz de confusión global cubre todo el dataset.
    """
    folds_results, tested, all_labels, all_probabilities = [], [], [], []
    for index, split in enumerate(kfold_splits(samples, folds), start=1):
        print(f"\n=== Partición {index}/{folds} ===\n{describe_split(split)}", flush=True)
        set_seed(SEED + index)
        train_loader, val_loader, test_loader = make_loaders(split)
        model = build_model(pretrained=pretrained)
        history = train(model, train_loader, val_loader, class_weights(split.train),
                        head_epochs=head_epochs, finetune_epochs=finetune_epochs, device=device)
        labels, probabilities = predict(model, test_loader, device)
        metrics = evaluate(labels, probabilities)
        print(f"Partición {index}: exactitud {metrics['exactitud']:.3f}  "
              f"F1 macro {metrics['f1_macro']:.3f}  "
              f"recall objeto {metrics['por_clase']['objeto']['recall']:.3f}", flush=True)
        folds_results.append({
            "particion": index,
            "fotos_prueba": len(split.test),
            "epocas": len(history),
            **{key: metrics[key] for key in ("exactitud", "f1_macro", "por_clase",
                                             "matriz_confusion")},
        })
        tested.extend(split.test)
        all_labels.append(labels)
        all_probabilities.append(probabilities)
    labels = np.concatenate(all_labels)
    probabilities = np.concatenate(all_probabilities)
    return {"particiones": folds_results, "global": evaluate(labels, probabilities),
            "samples": tested, "labels": labels, "probabilidades": probabilities}


def summarize_cv(cv: dict) -> str:
    """Promedio ± desviación estándar de las particiones."""
    rows = [("exactitud", lambda f: f["exactitud"]), ("F1 macro", lambda f: f["f1_macro"])]
    for name in CLASSES:
        rows.append((f"recall {name}", lambda f, n=name: f["por_clase"][n]["recall"]))
    rows.append(("precisión objeto", lambda f: f["por_clase"]["objeto"]["precision"]))
    folds = cv["particiones"]
    lines = [f"{'métrica':<18}" + "".join(f"{'P' + str(f['particion']):>7}" for f in folds)
             + f"{'media ± desv.':>16}"]
    for title, value in rows:
        values = np.array([value(f) for f in folds])
        lines.append(f"{title:<18}" + "".join(f"{v:>7.3f}" for v in values)
                     + f"{values.mean():>9.3f} ± {values.std():.3f}")
    return "\n".join(lines)


def plot_cross_validation(cv: dict, path: pathlib.Path | None = None):
    import matplotlib.pyplot as plt

    folds = cv["particiones"]
    names = [f"P{f['particion']}" for f in folds]
    series = {
        "F1 macro": [f["f1_macro"] for f in folds],
        "recall objeto": [f["por_clase"]["objeto"]["recall"] for f in folds],
        "precisión objeto": [f["por_clase"]["objeto"]["precision"] for f in folds],
    }
    positions = np.arange(len(folds))
    width = 0.8 / len(series)
    figure, axis = plt.subplots(figsize=(8, 4))
    for offset, (title, values) in enumerate(series.items()):
        bars = axis.bar(positions + (offset - 1) * width, values, width,
                        label=f"{title} (media {np.mean(values):.2f})")
        axis.axhline(np.mean(values), color=bars.patches[0].get_facecolor(),
                     linestyle="--", linewidth=1)
    axis.set_xticks(positions, names)
    axis.set_ylim(0, 1.05)
    axis.set_xlabel("Partición (conjunto de prueba distinto en cada una)")
    axis.set_title("Validación cruzada por tandas")
    axis.legend(loc="lower right")
    axis.grid(axis="y", alpha=0.3)
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=150)
    return figure


def plot_confusion(metrics: dict, path: pathlib.Path | None = None,
                   title: str = "Matriz de confusión (prueba)"):
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay

    figure, axis = plt.subplots(figsize=(5, 4.5))
    ConfusionMatrixDisplay(np.array(metrics["matriz_confusion"]), display_labels=CLASSES).plot(
        ax=axis, cmap="Blues", colorbar=False, values_format="d")
    axis.set_title(f"{title}\nF1 macro = {metrics['f1_macro']:.3f}")
    axis.set_xlabel("Predicción")
    axis.set_ylabel("Real")
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=150)
    return figure


def plot_history(history: list[dict], path: pathlib.Path | None = None):
    import matplotlib.pyplot as plt
    from matplotlib.ticker import MaxNLocator

    epochs = [h["epoca"] for h in history]
    figure, (loss_axis, score_axis) = plt.subplots(1, 2, figsize=(11, 4))
    loss_axis.plot(epochs, [h["perdida_entrenamiento"] for h in history], label="entrenamiento")
    loss_axis.plot(epochs, [h["perdida_validacion"] for h in history], label="validación")
    loss_axis.set_title("Pérdida")
    score_axis.plot(epochs, [h["exactitud_entrenamiento"] for h in history], label="exactitud entrenamiento")
    score_axis.plot(epochs, [h["exactitud_validacion"] for h in history], label="exactitud validación")
    score_axis.plot(epochs, [h["f1_validacion"] for h in history], label="F1 macro validación")
    score_axis.set_ylim(0, 1.02)
    score_axis.set_title("Exactitud y F1")
    switch = next((h["epoca"] for h in history if h["fase"] == "ajuste"), None)
    for axis in (loss_axis, score_axis):
        if switch:
            axis.axvline(switch - 0.5, color="gray", linestyle="--", linewidth=1)
        axis.set_xlabel("Época")
        axis.xaxis.set_major_locator(MaxNLocator(integer=True))
        axis.legend()
        axis.grid(alpha=0.3)
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=150)
    return figure


def plot_errors(samples: list[Sample], labels: np.ndarray, probabilities: np.ndarray,
                path: pathlib.Path | None = None, limit: int = 12):
    """Fotos mal clasificadas; devuelve None si no hay errores."""
    import matplotlib.pyplot as plt

    predictions = probabilities.argmax(1)
    wrong = np.flatnonzero(predictions != labels)[:limit]
    if len(wrong) == 0:
        return None
    columns = min(4, len(wrong))
    rows = int(np.ceil(len(wrong) / columns))
    figure, axes = plt.subplots(rows, columns, figsize=(3.2 * columns, 3 * rows), squeeze=False)
    for axis in axes.flat:
        axis.axis("off")
    for axis, index in zip(axes.flat, wrong):
        axis.imshow(load_image(samples[index].path).permute(1, 2, 0).numpy())
        axis.set_title(f"real: {CLASSES[labels[index]]}\n"
                       f"pred: {CLASSES[predictions[index]]} ({probabilities[index].max():.0%})",
                       fontsize=9)
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=120)
    return figure


class ExportWrapper(nn.Module):
    """Recibe la imagen como sale de cv2.dnn.blobFromImage(..., swapRB=True):
    RGB, valores 0-255, 1×3×224×224, y devuelve probabilidades."""

    def __init__(self, model: nn.Module):
        super().__init__()
        self.model = model
        self.register_buffer("mean", torch.tensor(IMAGENET_MEAN).view(1, 3, 1, 1) * 255)
        self.register_buffer("std", torch.tensor(IMAGENET_STD).view(1, 3, 1, 1) * 255)

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.model((image - self.mean) / self.std), dim=1)


def export_onnx(model: nn.Module, model_dir: pathlib.Path = MODEL_DIR) -> pathlib.Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    path = model_dir / "smartegg_vision.onnx"
    wrapper = ExportWrapper(copy.deepcopy(model).cpu()).eval()
    example = torch.zeros(1, 3, IMAGE_SIZE, IMAGE_SIZE)
    torch.onnx.export(wrapper, (example,), path, input_names=["imagen"],
                      output_names=["probabilidades"], opset_version=18, dynamo=True,
                      external_data=False, verbose=False)
    (model_dir / "clases.json").write_text(json.dumps({
        "clases": list(CLASSES),
        "entrada": {
            "nombre": "imagen",
            "forma": [1, 3, IMAGE_SIZE, IMAGE_SIZE],
            "formato": "RGB, float32, valores 0-255, imagen completa estirada a 224x224",
            "opencv": "cv2.dnn.blobFromImage(bgr, 1.0, (224, 224), swapRB=True, crop=False)",
        },
        "salida": {"nombre": "probabilidades", "forma": [1, len(CLASSES)]},
    }, indent=2, ensure_ascii=False) + "\n")
    return path


def verify_onnx(model: nn.Module, onnx_path: pathlib.Path, samples: list[Sample]) -> float:
    """Compara PyTorch con el ONNX leído por OpenCV; devuelve la mayor diferencia."""
    import cv2

    net = cv2.dnn.readNetFromONNX(str(onnx_path))
    wrapper = ExportWrapper(copy.deepcopy(model).cpu()).eval()
    worst = 0.0
    for sample in samples:
        bgr = cv2.imread(str(sample.path))
        blob = cv2.dnn.blobFromImage(bgr, 1.0, (IMAGE_SIZE, IMAGE_SIZE), swapRB=True, crop=False)
        net.setInput(blob)
        from_opencv = net.forward()
        with torch.no_grad():
            from_torch = wrapper(torch.from_numpy(blob)).numpy()
        worst = max(worst, float(np.abs(from_opencv - from_torch).max()))
    return worst


def save_results(cv: dict, history: list[dict], final_split: Split,
                 results_dir: pathlib.Path = RESULTS_DIR) -> None:
    results_dir.mkdir(parents=True, exist_ok=True)
    folds = len(cv["particiones"])
    (results_dir / "reporte.txt").write_text(
        "SmartEgg - clasificador de visión (MobileNetV2, transfer learning)\n\n"
        f"Validación cruzada por tandas ({folds} particiones, {len(cv['samples'])} fotos):\n"
        f"{summarize_cv(cv)}\n\n"
        f"Predicciones de las {folds} particiones juntas (cada foto la predice el modelo que no la vio):\n"
        f"Exactitud: {cv['global']['exactitud']:.3f}\n"
        f"F1 macro:  {cv['global']['f1_macro']:.3f}\n\n"
        f"{cv['global']['reporte']}\n"
        "Modelo final exportado (todas las fotos; la validación solo elige la mejor época):\n"
        f"{describe_split(final_split)}\n")
    summary = {key: value for key, value in cv["global"].items() if key != "reporte"}
    (results_dir / "metricas.json").write_text(json.dumps({
        "validacion_cruzada": {"particiones": cv["particiones"], "global": summary},
        "modelo_final": {"historial": history},
    }, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", type=pathlib.Path, default=DEFAULT_DATASET)
    parser.add_argument("--particiones", type=int, default=5)
    parser.add_argument("--epocas-cabeza", type=int, default=8)
    parser.add_argument("--epocas-ajuste", type=int, default=12)
    parser.add_argument("--modelo", type=pathlib.Path, default=MODEL_DIR)
    parser.add_argument("--resultados", type=pathlib.Path, default=RESULTS_DIR)
    parser.add_argument("--sin-preentrenar", action="store_true",
                        help="no descargar pesos de ImageNet (solo para pruebas rápidas)")
    args = parser.parse_args()

    import matplotlib

    matplotlib.use("Agg")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    samples = list_samples(args.dataset)
    epochs = {"head_epochs": args.epocas_cabeza, "finetune_epochs": args.epocas_ajuste}

    cv = cross_validate(samples, args.particiones, pretrained=not args.sin_preentrenar,
                        device=device, **epochs)
    print(f"\n{summarize_cv(cv)}\n\n{cv['global']['reporte']}", flush=True)
    args.resultados.mkdir(parents=True, exist_ok=True)
    plot_cross_validation(cv, args.resultados / "validacion_cruzada.png")
    plot_confusion(cv["global"], args.resultados / "matriz_confusion.png",
                   title="Matriz de confusión (validación cruzada)")
    plot_errors(cv["samples"], cv["labels"], cv["probabilidades"], args.resultados / "errores.png")

    print("\n=== Modelo final ===", flush=True)
    set_seed()
    final_split = split_by_group(samples, test_ratio=0)
    train_loader, val_loader, _ = make_loaders(final_split)
    model = build_model(pretrained=not args.sin_preentrenar)
    history = train(model, train_loader, val_loader, class_weights(final_split.train),
                    device=device, **epochs)
    plot_history(history, args.resultados / "curvas_entrenamiento.png")
    save_results(cv, history, final_split, args.resultados)

    onnx_path = export_onnx(model, args.modelo)
    difference = verify_onnx(model, onnx_path, final_split.val[:10])
    print(f"Modelo exportado en {onnx_path} (diferencia PyTorch vs OpenCV: {difference:.2e})")


if __name__ == "__main__":
    main()
