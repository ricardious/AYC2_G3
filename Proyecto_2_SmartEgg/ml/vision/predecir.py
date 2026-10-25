"""Clasifica fotos con el modelo exportado, usando solo OpenCV (igual que el servicio de visión).

Uso:
  python ml/vision/predecir.py foto.jpg
  python ml/vision/predecir.py dataset/objeto          # todas las fotos de la carpeta
  python ml/vision/predecir.py dataset                 # recorre subcarpetas

Si la foto está dentro de una carpeta con el nombre de una clase
(huevo/, objeto/, vacio/), también indica si acertó y la exactitud total.
"""

import argparse
import json
import pathlib

import cv2
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_MODEL = HERE / "modelo" / "smartegg_vision.onnx"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def load_model(model_path: pathlib.Path):
    info = json.loads((model_path.parent / "clases.json").read_text())
    net = cv2.dnn.readNetFromONNX(str(model_path))
    width, height = info["entrada"]["forma"][3], info["entrada"]["forma"][2]
    return net, info["clases"], (width, height)


def classify(net, size: tuple[int, int], bgr: np.ndarray) -> np.ndarray:
    blob = cv2.dnn.blobFromImage(bgr, 1.0, size, swapRB=True, crop=False)
    net.setInput(blob)
    return net.forward()[0]


def iter_images(paths: list[pathlib.Path]):
    for path in paths:
        if path.is_dir():
            yield from sorted(p for p in path.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS)
        else:
            yield path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("rutas", nargs="+", type=pathlib.Path, help="fotos o carpetas")
    parser.add_argument("--modelo", type=pathlib.Path, default=DEFAULT_MODEL)
    args = parser.parse_args()

    net, classes, size = load_model(args.modelo)
    hits = labeled = 0
    for path in iter_images(args.rutas):
        bgr = cv2.imread(str(path))
        if bgr is None:
            print(f"{path}: no se pudo leer")
            continue
        probabilities = classify(net, size, bgr)
        predicted = classes[int(probabilities.argmax())]
        detail = "  ".join(f"{name} {p:.0%}" for name, p in zip(classes, probabilities))
        mark = ""
        if path.parent.name in classes:
            labeled += 1
            hits += predicted == path.parent.name
            mark = "  ok" if predicted == path.parent.name else f"  ERROR (es {path.parent.name})"
        print(f"{path}: {predicted:<7} [{detail}]{mark}")
    if labeled:
        print(f"\nExactitud: {hits}/{labeled} = {hits / labeled:.1%}")


if __name__ == "__main__":
    main()
