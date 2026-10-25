"""Entrenamiento del detector de anomalías de SmartEgg (Local Outlier Factor).

Aprende cómo se comporta la incubadora en operación normal con la telemetría
histórica de la Fase 2 (Neon) y marca como anómala cualquier lectura que no se
parezca: picos, fallas del sensor, calentamiento descontrolado o cambios
bruscos de humedad. Se evalúa con validación cruzada dejando fuera un día a la
vez, se compara con Isolation Forest y One-Class SVM, y el modelo final se
entrena con todo. El notebook `entrenar_anomalias.ipynb`
usa estas funciones paso a paso; también se puede correr todo desde la terminal:

  python ml/anomalias/smartegg_anomalias.py

Las características se calculan con `FeatureBuilder` del servicio
(anomalias/anomaly_service.py), el mismo código que corre en vivo.

Salidas:
  modelo/smartegg_anomalias.joblib  pipeline, umbral y estadísticas para el servicio
  resultados/                       métricas, gráficas y reporte
"""

from __future__ import annotations

import json
import pathlib
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import OneClassSVM

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "anomalias"))

from anomaly_service import (  # noqa: E402
    FEATURES,
    WINDOW_SECONDS,
    AnomalyModel,
    FeatureBuilder,
    Reading,
)

DATA_FILE = HERE / "datos" / "telemetria_fase2.csv"
MODEL_DIR = HERE / "modelo"
RESULTS_DIR = HERE / "resultados"
SEED = 42
# Validación cruzada por día: cada día fue una sesión distinta (otro clima, otra
# carga de huevos). Los días con muy pocas lecturas van con el día más cercano.
DAY_GROUPS = {
    "2026-09-18": "18-22 sep", "2026-09-22": "18-22 sep",
    "2026-09-23": "23 sep",
    "2026-09-25": "25-26 sep", "2026-09-26": "25-26 sep",
    "2026-10-02": "2 oct",
}
# Umbral: percentil de los puntajes de operación normal del entrenamiento. 99.9
# marca ~0.1 % de las lecturas con que se entrenó; en un día nuevo son más
# (~1.3 %), por eso la alerta pide además 3 lecturas anómalas seguidas.
THRESHOLD_PERCENTILE = 99.9
ALERT_NEEDED, ALERT_WINDOW = 3, 3

ANOMALY_TYPES = {
    "pico": "Pico de temperatura (+6 °C en 2 lecturas)",
    "sobrecalentamiento": "Calentamiento descontrolado (+0.5 °C por lectura)",
    "foco_sin_calentar": "Foco encendido y la temperatura baja",
    "humedad": "Caída brusca de humedad (−25 %)",
    "sensor": "Sensor desconectado (0 °C y 0 %)",
}


def load_telemetry(path: pathlib.Path = DATA_FILE) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["recorded_at"])
    df["time"] = (df["recorded_at"] - pd.Timestamp(0, tz="UTC")).dt.total_seconds()
    df["sensor_fault"] = ((df["sensor_ok"] == 0) | (df["humidity_pct"] <= 0)
                          | (df["temperature_c"] < 5))
    df["fold"] = df["recorded_at"].dt.strftime("%Y-%m-%d").map(DAY_GROUPS)
    return df.reset_index(drop=True)


def readings(df: pd.DataFrame) -> list[Reading]:
    return [Reading(time=row.time, temperature=row.temperature_c, humidity=row.humidity_pct)
            for row in df.itertuples()]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Recorre las lecturas en orden con el mismo FeatureBuilder del servicio."""
    builder = FeatureBuilder()
    rows = []
    for index, reading in zip(df.index, readings(df), strict=True):
        features = builder.add(reading)
        if features is not None:
            rows.append({"index": index, **features})
    return pd.DataFrame(rows).set_index("index")[list(FEATURES)]


def affected_by(df: pd.DataFrame, flags: pd.Series) -> pd.Series:
    """Lecturas cuya ventana de 60 s incluye una lectura marcada."""
    times = df["time"].to_numpy()
    flagged = times[flags.to_numpy()]
    result = np.zeros(len(df), dtype=bool)
    for t in flagged:
        # El FeatureBuilder usa como referencia la última lectura de hace al
        # menos 60 s, que puede tener unos segundos más; de ahí el margen.
        result |= (times >= t) & (times <= t + WINDOW_SECONDS + 15)
    return pd.Series(result, index=df.index)


@dataclass
class Injection:
    data: pd.DataFrame        # lecturas con las fallas metidas
    label: pd.Series          # 1 = anómala, 0 = normal, -1 = se ignora (ventana posterior)
    kind: pd.Series           # tipo de falla por lectura ("" si es normal)
    event: pd.Series          # número de evento por lectura (-1 si es normal)


def inject_anomalies(df: pd.DataFrame, per_1000: float = 6.0, seed: int = SEED) -> Injection:
    """Mete fallas simuladas en lecturas normales y las etiqueta.

    El histórico no tiene etiquetas, así que para medir recall se simulan las
    fallas que el sistema debe detectar. Las lecturas del minuto siguiente a
    cada falla se ignoran: su velocidad de cambio todavía arrastra la falla.
    """
    rng = np.random.default_rng(seed)
    per_type = max(2, round(len(df) / 1000 * per_1000))
    data = df.copy()
    label = pd.Series(0, index=df.index)
    kind = pd.Series("", index=df.index)
    event = pd.Series(-1, index=df.index)
    label[affected_by(df, df["sensor_fault"])] = -1  # fallas reales: se evalúan aparte
    gaps = df["time"].diff().fillna(1e9) > 120
    session = gaps.cumsum()
    busy = np.zeros(len(df), dtype=bool)
    lengths = {"pico": 2, "sobrecalentamiento": 10, "foco_sin_calentar": 12,
               "humedad": 6, "sensor": 3}
    event_id = 0
    for name, length in lengths.items():
        placed = attempts = 0
        while placed < per_type and attempts < 20000:
            attempts += 1
            start = int(rng.integers(30, len(df) - length - 30))
            span = slice(start - 10, start + length + 25)
            if (busy[span].any() or session.iloc[start - 10] != session.iloc[start + length + 25]
                    or (df["system_enabled"].iloc[start:start + length] != 1).any()
                    or (label.iloc[span] != 0).any()):
                continue
            rows = df.index[start:start + length]
            base_t = df.loc[rows[0], "temperature_c"]
            steps = np.arange(1, length + 1)
            if name == "pico":
                data.loc[rows, "temperature_c"] = df.loc[rows, "temperature_c"] + 6
            elif name == "sobrecalentamiento":
                data.loc[rows, "temperature_c"] = base_t + 0.5 * steps
                data.loc[rows, "heater"] = 1
            elif name == "foco_sin_calentar":
                data.loc[rows, "temperature_c"] = base_t - 0.15 * steps
                data.loc[rows, "heater"] = 1
                data.loc[rows, "door_open"] = 0
            elif name == "humedad":
                data.loc[rows, "humidity_pct"] = (df.loc[rows, "humidity_pct"] - 25).clip(lower=1)
            elif name == "sensor":
                data.loc[rows, ["temperature_c", "humidity_pct"]] = 0.0
            after = df.index[(df["time"] > df.loc[rows[-1], "time"])
                             & (df["time"] <= df.loc[rows[-1], "time"] + WINDOW_SECONDS + 15)]
            label[after] = -1
            label[rows] = 1
            kind[rows] = name
            event[rows] = event_id
            busy[span] = True
            event_id += 1
            placed += 1
    return Injection(data, label, kind, event)


def build_model(seed: int = SEED) -> Pipeline:
    """LOF en modo novedad: compara la densidad de cada lectura con la de sus 35 vecinas."""
    del seed  # LOF es determinista
    return Pipeline([
        ("escala", StandardScaler()),
        ("lof", LocalOutlierFactor(n_neighbors=35, novelty=True)),
    ])


# Alternativas evaluadas con la misma validación cruzada (ver compare_models).
MODELS = {
    "Local Outlier Factor": build_model,
    "Isolation Forest": lambda seed=SEED: Pipeline([
        ("escala", StandardScaler()),
        ("bosque", IsolationForest(n_estimators=300, max_samples=256, contamination="auto",
                                   random_state=seed)),
    ]),
    "One-Class SVM": lambda seed=SEED: Pipeline([
        ("escala", StandardScaler()),
        ("svm", OneClassSVM(nu=0.01, gamma="scale")),
    ]),
}


def anomaly_scores(model: Pipeline, features: pd.DataFrame) -> np.ndarray:
    """Mayor = más raro (el signo contrario de decision_function)."""
    return -model.decision_function(features[list(FEATURES)].to_numpy())


def normal_mask(df: pd.DataFrame, features: pd.DataFrame) -> pd.Series:
    """Operación normal para entrenar: sistema encendido y sin fallas del sensor."""
    clean = (df["system_enabled"] == 1) & ~affected_by(df, df["sensor_fault"])
    return clean.loc[features.index]


def alerts(flags: np.ndarray, needed: int = ALERT_NEEDED,
           window: int = ALERT_WINDOW) -> np.ndarray:
    """La alerta del servicio: `needed` de las últimas `window` lecturas anómalas."""
    out = np.zeros(len(flags), dtype=bool)
    recent: list[bool] = []
    for i, flag in enumerate(flags):
        recent = (recent + [bool(flag)])[-window:]
        out[i] = sum(recent) >= needed
    return out


def evaluate(scores: np.ndarray, threshold: float, injection: Injection,
             index: pd.Index) -> dict:
    from sklearn.metrics import (
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )

    label = injection.label.loc[index].to_numpy()
    kind = injection.kind.loc[index].to_numpy()
    event = injection.event.loc[index].to_numpy()
    predicted = scores > threshold
    use = label >= 0
    y, p = label[use], predicted[use]
    alert = alerts(predicted)
    events = {e: kind[event == e][0] for e in np.unique(event[event >= 0])}
    detected = {e: bool(alert[event == e].any() or predicted[event == e].sum() >= 2)
                for e in events}
    hours = (len(y) - y.sum()) * 2.6 / 3600
    normal_alerts = alert[use][y == 0]
    return {
        "lecturas": int(use.sum()),
        "anomalas": int(y.sum()),
        "precision": float(precision_score(y, p, zero_division=0)),
        "recall": float(recall_score(y, p, zero_division=0)),
        "f1": float(f1_score(y, p, zero_division=0)),
        "roc_auc": float(roc_auc_score(y, scores[use])),
        "falsos_positivos_pct": float(p[y == 0].mean() * 100),
        "matriz_confusion": confusion_matrix(y, p, labels=[0, 1]).tolist(),
        "recall_por_tipo": {name: float(predicted[kind == name].mean())
                            for name in ANOMALY_TYPES if (kind == name).any()},
        "eventos_detectados": {name: [sum(detected[e] for e in events if events[e] == name),
                                      sum(1 for e in events if events[e] == name)]
                               for name in ANOMALY_TYPES},
        "alertas_falsas_por_hora": float(normal_alerts.sum() / hours) if hours else 0.0,
    }


def rule_baseline(data: pd.DataFrame, index: pd.Index) -> np.ndarray:
    """Reglas fijas de la Fase 2 (rangos de temperatura y humedad) para comparar."""
    rows = data.loc[index]
    return ((rows["temperature_c"] < 36.5) | (rows["temperature_c"] > 38.5)
            | (rows["humidity_pct"] < 40) | (rows["humidity_pct"] > 75)).to_numpy()


def fit(normal: pd.DataFrame, make_model=build_model) -> tuple[Pipeline, float]:
    """Entrena con lecturas normales; el umbral es un percentil de sus puntajes."""
    # Sin nombres de columna: el servicio califica arreglos de numpy.
    model = make_model(SEED).fit(normal[list(FEATURES)].to_numpy())
    threshold = float(np.percentile(anomaly_scores(model, normal), THRESHOLD_PERCENTILE))
    return model, threshold


def cross_validate(df: pd.DataFrame, make_model=build_model, verbose: bool = True) -> dict:
    """Deja fuera un día a la vez: entrena con los demás y mete fallas en ese día."""
    folds, pooled = [], {"scores": [], "label": [], "kind": [], "rule": [], "real": [],
                         "real_flag": []}
    for index, fold in enumerate(sorted(df["fold"].unique()), start=1):
        train_df, test_df = df[df["fold"] != fold], df[df["fold"] == fold]
        train_features = build_features(train_df)
        model, threshold = fit(train_features[normal_mask(train_df, train_features)],
                               make_model)
        injection = inject_anomalies(test_df, seed=SEED + index)
        test_features = build_features(injection.data)
        scores = anomaly_scores(model, test_features)
        metrics = evaluate(scores, threshold, injection, test_features.index)
        rule = rule_baseline(injection.data, test_features.index)
        clean_features = build_features(test_df)
        faults = test_df.loc[clean_features.index, "sensor_fault"].to_numpy()
        real_scores = anomaly_scores(model, clean_features)[faults]
        metrics.update(dia=fold, umbral=threshold,
                       fallas_reales=[int((real_scores > threshold).sum()), int(faults.sum())])
        folds.append(metrics)
        if verbose:
            print(f"{fold:>10}: precisión {metrics['precision']:.3f}"
                  f"  recall {metrics['recall']:.3f}"
                  f"  F1 {metrics['f1']:.3f}  falsos positivos"
                  f" {metrics['falsos_positivos_pct']:.1f} %"
                  f"  alertas falsas/h {metrics['alertas_falsas_por_hora']:.1f}", flush=True)
        pooled["scores"].append(scores - threshold)  # relativo al umbral de su modelo
        pooled["label"].append(injection.label.loc[test_features.index].to_numpy())
        pooled["kind"].append(injection.kind.loc[test_features.index].to_numpy())
        pooled["rule"].append(rule)
        pooled["real"].append(real_scores - threshold)
    merged = {key: np.concatenate(value) for key, value in pooled.items() if value}
    use = merged["label"] >= 0
    return {"particiones": folds, "scores": merged["scores"], "label": merged["label"],
            "kind": merged["kind"], "rule": merged["rule"], "use": use,
            "real": merged["real"]}


def summary(cv: dict) -> dict:
    from sklearn.metrics import (
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )

    use = cv["use"]
    y = cv["label"][use]
    predicted = cv["scores"][use] > 0
    rule = cv["rule"][use]
    kind = cv["kind"][use]
    folds = cv["particiones"]
    def stats(key: str) -> list[float]:
        values = np.array([fold[key] for fold in folds])
        return [float(values.mean()), float(values.std())]
    events = {name: [sum(fold["eventos_detectados"][name][0] for fold in folds),
                     sum(fold["eventos_detectados"][name][1] for fold in folds)]
              for name in ANOMALY_TYPES}
    return {
        "lecturas": int(use.sum()), "anomalas": int(y.sum()),
        "global": {
            "precision": float(precision_score(y, predicted, zero_division=0)),
            "recall": float(recall_score(y, predicted, zero_division=0)),
            "f1": float(f1_score(y, predicted, zero_division=0)),
            "roc_auc": float(roc_auc_score(y, cv["scores"][use])),
            "falsos_positivos_pct": float(predicted[y == 0].mean() * 100),
            "matriz_confusion": confusion_matrix(y, predicted, labels=[0, 1]).tolist(),
        },
        "reglas_fijas": {
            "precision": float(precision_score(y, rule, zero_division=0)),
            "recall": float(recall_score(y, rule, zero_division=0)),
            "f1": float(f1_score(y, rule, zero_division=0)),
            "falsos_positivos_pct": float(rule[y == 0].mean() * 100),
        },
        "por_dia": {key: stats(key) for key in ("precision", "recall", "f1",
                                                 "falsos_positivos_pct",
                                                 "alertas_falsas_por_hora")},
        "recall_por_tipo": {name: float(predicted[kind == name].mean())
                            for name in ANOMALY_TYPES if (kind == name).any()},
        "eventos_detectados": events,
        "fallas_reales": [int((cv["real"] > 0).sum()), int(len(cv["real"]))],
    }


def compare_models(df: pd.DataFrame, chosen: dict | None = None) -> pd.DataFrame:
    """Misma validación cruzada, mismo umbral y misma alerta para cada algoritmo.

    `chosen` reutiliza el resumen ya calculado del modelo elegido.
    """
    rows = []
    for name, make_model in MODELS.items():
        result = chosen if chosen is not None and make_model is build_model else summary(
            cross_validate(df, make_model, verbose=False))
        g = result["global"]
        rows.append({
            "modelo": name, "precision": g["precision"], "recall": g["recall"], "f1": g["f1"],
            "roc_auc": g["roc_auc"], "falsos_positivos_pct": g["falsos_positivos_pct"],
            "alertas_falsas_por_hora": result["por_dia"]["alertas_falsas_por_hora"][0],
            **{f"eventos_{kind}": "{}/{}".format(*result["eventos_detectados"][kind])
               for kind in ANOMALY_TYPES},
        })
    return pd.DataFrame(rows).set_index("modelo")


def export_model(model: Pipeline, features: pd.DataFrame, threshold: float,
                 model_dir: pathlib.Path = MODEL_DIR) -> pathlib.Path:
    import joblib
    import sklearn

    model_dir.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": model,
        "features": list(FEATURES),
        "threshold": float(threshold),
        "mean": features[list(FEATURES)].mean().tolist(),
        "std": features[list(FEATURES)].std().tolist(),
        "sklearn": sklearn.__version__,
        "entrenado": datetime.now(UTC).isoformat(),
        "lecturas": int(len(features)),
    }
    path = model_dir / "smartegg_anomalias.joblib"
    joblib.dump(bundle, path)
    (model_dir / "modelo.json").write_text(json.dumps(
        {key: value for key, value in bundle.items() if key != "pipeline"},
        indent=2, ensure_ascii=False) + "\n")
    AnomalyModel(bundle)  # comprueba que el servicio puede cargarlo
    return path



def plot_distribution(scores: np.ndarray, threshold: float, label: np.ndarray,
                      path: pathlib.Path | None = None):
    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(7, 4))
    bins = np.linspace(scores.min(), scores.max(), 60)
    axis.hist(scores[label == 0], bins=bins, alpha=0.7, label="normal", color="#4c72b0")
    axis.hist(scores[label == 1], bins=bins, alpha=0.7, label="anómala", color="#dd8452")
    axis.axvline(threshold, color="#c44e52", linestyle="--", label="umbral")
    axis.set_yscale("log")
    axis.set_xlabel("Puntaje de anomalía")
    axis.set_ylabel("Lecturas (escala log)")
    axis.set_title("Distribución del puntaje en prueba")
    axis.legend()
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=150)
    return figure


def plot_confusion(metrics: dict, path: pathlib.Path | None = None):
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay

    figure, axis = plt.subplots(figsize=(4.5, 4))
    ConfusionMatrixDisplay(np.array(metrics["matriz_confusion"]),
                           display_labels=["normal", "anómala"]).plot(
        ax=axis, cmap="Blues", colorbar=False, values_format="d")
    axis.set_title(f"Matriz de confusión (prueba)\nF1 = {metrics['f1']:.3f}")
    axis.set_xlabel("Predicción")
    axis.set_ylabel("Real")
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=150)
    return figure


def report(result: dict, final: dict, comparison: pd.DataFrame | None = None) -> str:
    g, r, d = result["global"], result["reglas_fijas"], result["por_dia"]
    lines = [
        "SmartEgg - detector de anomalías (Local Outlier Factor)", "",
        f"Validación cruzada dejando fuera un día ({len(set(DAY_GROUPS.values()))}"
        f" particiones): {result['lecturas']} lecturas de prueba, {result['anomalas']} con"
        " fallas simuladas.",
        f"Umbral: percentil {THRESHOLD_PERCENTILE:g} del puntaje en operación normal."
        f" Alerta: {ALERT_NEEDED} de las últimas {ALERT_WINDOW} lecturas anómalas.", "",
        f"{'métrica (global)':<28}{'LOF':>18}{'reglas fijas':>14}",
    ]
    for key, title in (("precision", "precisión"), ("recall", "recall"), ("f1", "F1"),
                       ("falsos_positivos_pct", "falsos positivos (%)")):
        lines.append(f"{title:<28}{g[key]:>18.3f}{r[key]:>14.3f}")
    lines += [f"{'ROC-AUC':<28}{g['roc_auc']:>18.3f}", "", "Por día (media ± desv.):"]
    for key, title in (("precision", "precisión"), ("recall", "recall"), ("f1", "F1"),
                       ("falsos_positivos_pct", "falsos positivos (%)"),
                       ("alertas_falsas_por_hora", "alertas falsas por hora")):
        lines.append(f"  {title:<26}{d[key][0]:>8.3f} ± {d[key][1]:.3f}")
    lines += ["", "Recall por tipo de falla (lecturas) y eventos detectados:"]
    for name, title in ANOMALY_TYPES.items():
        found, total = result["eventos_detectados"][name]
        lines.append(f"  {title:<52}{result['recall_por_tipo'].get(name, 0):>6.2f}"
                     f"   {found}/{total} eventos")
    if comparison is not None:
        lines += ["", "Comparación de algoritmos (misma validación, umbral y alerta):",
                  f"  {'modelo':<22}{'precisión':>10}{'recall':>8}{'F1':>7}{'AUC':>7}"
                  f"{'FP %':>7}{'alertas falsas/h':>18}"]
        for name, row in comparison.iterrows():
            lines.append(f"  {name:<22}{row['precision']:>10.3f}{row['recall']:>8.3f}"
                         f"{row['f1']:>7.3f}{row['roc_auc']:>7.3f}"
                         f"{row['falsos_positivos_pct']:>7.2f}"
                         f"{row['alertas_falsas_por_hora']:>18.1f}")
    found, total = result["fallas_reales"]
    lines += ["", f"Fallas reales del sensor (lecturas con SENSOR:0, 0 % o < 5 °C): "
              f"{found} de {total} detectadas", "",
              f"Modelo final: {final['lecturas']} lecturas normales, umbral {final['umbral']:.4f}"]
    return "\n".join(lines) + "\n"


def plot_cross_validation(cv: dict, path: pathlib.Path | None = None):
    import matplotlib.pyplot as plt

    folds = cv["particiones"]
    names = [fold["dia"] for fold in folds]
    series = {"precisión": [f["precision"] for f in folds], "recall": [f["recall"] for f in folds],
              "F1": [f["f1"] for f in folds]}
    x = np.arange(len(folds))
    width = 0.8 / len(series)
    figure, axis = plt.subplots(figsize=(8, 4))
    for offset, (title, values) in enumerate(series.items()):
        axis.bar(x + (offset - 1) * width, values, width,
                 label=f"{title} (media {np.mean(values):.2f})")
    axis.set_xticks(x, names)
    axis.set_ylim(0, 1.05)
    axis.set_xlabel("Día que quedó fuera del entrenamiento")
    axis.set_title("Validación cruzada por día")
    axis.legend(loc="lower right")
    axis.grid(axis="y", alpha=0.3)
    figure.tight_layout()
    if path:
        figure.savefig(path, dpi=150)
    return figure


def main() -> None:
    import matplotlib

    matplotlib.use("Agg")
    df = load_telemetry()
    cv = cross_validate(df)
    result = summary(cv)

    all_features = build_features(df)
    final_normal = all_features[normal_mask(df, all_features)]
    final_model, final_threshold = fit(final_normal)
    path = export_model(final_model, final_normal, final_threshold)
    final = {"lecturas": len(final_normal), "umbral": final_threshold}
    comparison = compare_models(df, chosen=result)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    comparison.to_csv(RESULTS_DIR / "comparacion_modelos.csv", float_format="%.4f")
    text = report(result, final, comparison)
    print(text)
    (RESULTS_DIR / "reporte.txt").write_text(text)
    (RESULTS_DIR / "metricas.json").write_text(json.dumps(
        {**result, "particiones": cv["particiones"], "modelo_final": final},
        indent=2, ensure_ascii=False, default=float) + "\n")
    plot_cross_validation(cv, RESULTS_DIR / "validacion_cruzada.png")
    plot_distribution(cv["scores"][cv["use"]], 0.0, cv["label"][cv["use"]],
                      RESULTS_DIR / "distribucion.png")
    plot_confusion({"matriz_confusion": result["global"]["matriz_confusion"],
                    "f1": result["global"]["f1"]}, RESULTS_DIR / "matriz_confusion.png")
    print(f"Modelo final: {path}")


if __name__ == "__main__":
    main()
