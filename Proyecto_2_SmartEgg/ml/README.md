# Modelos de machine learning

Aquí está el código de **entrenamiento**. Se corre en la laptop (o en Colab) cuando cambia el dataset. El servidor en la nube no lo usa: solo carga el modelo ya exportado.

| Carpeta | Modelo | Estado |
| --- | --- | --- |
| [`vision/`](vision/) | Clasificador de fotos `huevo` / `objeto` / `vacio` (MobileNetV2, transfer learning) | entrenado: exactitud 0.89 ± 0.04, recall de objeto 0.74 ± 0.14 (validación cruzada, 800 fotos) |
| [`anomalias/`](anomalias/) | Detección de anomalías en la telemetría (Local Outlier Factor, no supervisado) | entrenado: precisión 0.84, 1.3 % de falsos positivos; detecta 45/47 picos, 7/7 caídas de humedad y 4/4 sensores desconectados (validación cruzada por día, fallas simuladas) |

## Visión

```
vision/
├── entrenar_vision.ipynb   notebook con todo el proceso, las gráficas y las métricas
├── smartegg_vision.py      funciones de entrenamiento (también se corre solo desde la terminal)
├── predecir.py             prueba el modelo exportado sobre fotos o carpetas, solo con OpenCV
├── modelo/                 smartegg_vision.onnx + clases.json (se generan al entrenar)
└── resultados/             matriz de confusión, curvas, errores, reporte y métricas (se generan al entrenar)
```

### 1. Preparar el dataset

Las fotos van en `Proyecto_2_SmartEgg/dataset/`, con una carpeta por clase:

```
dataset/
├── huevo/
├── objeto/
└── vacio/
```

Se toman con `scripts/capturar_dataset.py` (o con los scripts guiados). Los nombres llevan la hora de captura en milisegundos (`..._<ms>.jpg`); con ella, el entrenamiento agrupa las fotos por tanda, para que las 5 fotos casi iguales de una tanda no queden repartidas entre entrenamiento y prueba.

### 2. Instalar

Desde `Proyecto_2_SmartEgg/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

### 3. Entrenar

**Con el notebook** (recomendado, porque deja las gráficas como evidencia):

```bash
jupyter lab ml/vision/entrenar_vision.ipynb
```

Ejecutar todas las celdas (*Run → Run All Cells*). Primero hace una validación cruzada por tandas (5 modelos, uno por partición) para medir el método, y después entrena el modelo final con todas las fotos. En CPU tarda alrededor de 1 hora con 800 fotos.

**Desde la terminal**, con el mismo resultado y sin gráficas en pantalla:

```bash
python ml/vision/smartegg_vision.py
```

Las dos formas generan:

- `ml/vision/modelo/smartegg_vision.onnx` y `clases.json`.
- `ml/vision/resultados/`: `validacion_cruzada.png` (métricas por partición), `matriz_confusion.png` y `errores.png` (de la validación cruzada), `curvas_entrenamiento.png` (del modelo final), `reporte.txt` (media ± desviación y precision, recall y F1 por clase) y `metricas.json`.

### 4. Probar el modelo

```bash
python ml/vision/predecir.py dataset/objeto
python ml/vision/predecir.py foto.jpg
```

### Formato del modelo exportado

| | |
| --- | --- |
| Entrada `imagen` | `1×3×224×224`, RGB, float32, valores 0-255, foto completa estirada (sin recorte) |
| Salida `probabilidades` | `1×3`, en el orden `huevo`, `objeto`, `vacio` |
| Con OpenCV | `cv2.dnn.blobFromImage(bgr, 1.0, (224, 224), swapRB=True, crop=False)` |

La normalización de ImageNet y el `softmax` van dentro del ONNX, así que el servicio de visión no tiene que repetirlos.

## Anomalías

```
anomalias/
├── entrenar_anomalias.ipynb  notebook: exploración, características, validación, comparación y análisis
├── smartegg_anomalias.py     funciones de entrenamiento (también se corre solo desde la terminal)
├── exportar_telemetria.py    baja la telemetría de la Fase 2 desde Neon a datos/
├── datos/                    telemetria_fase2.csv (7 899 lecturas de NODE-01, 18 sep - 2 oct)
├── modelo/                   smartegg_anomalias.joblib + modelo.json (se generan al entrenar)
└── resultados/               matriz de confusión, validación cruzada, comparación, reporte y métricas
```

Las características se calculan con `FeatureBuilder` del servicio
([`anomalias/anomaly_service.py`](../anomalias/anomaly_service.py)): el
entrenamiento y el servicio en vivo usan el mismo código.

### 1. Exportar los datos

Solo hace falta si cambia el histórico. Necesita `NEON_DATABASE_URL` en el
entorno o en `ml/.env` (no se sube al repositorio):

```bash
python ml/anomalias/exportar_telemetria.py
```

### 2. Entrenar

```bash
jupyter lab ml/anomalias/entrenar_anomalias.ipynb   # con gráficas, recomendado
python ml/anomalias/smartegg_anomalias.py           # mismo resultado desde la terminal
```

Tarda menos de un minuto. Hace la validación cruzada dejando fuera un grupo de
días a la vez (4 particiones) con fallas simuladas en el día de prueba, compara
LOF con Isolation Forest y One-Class SVM y entrena el modelo final con todas
las lecturas normales.

### Resultado (validación cruzada)

| Modelo | Precisión | Recall | F1 | ROC-AUC | Falsos positivos | Alertas falsas/h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Local Outlier Factor** (elegido) | 0.84 | 0.28 | 0.42 | 0.77 | 1.3 % | 6.6 |
| Isolation Forest | 0.92 | 0.07 | 0.13 | 0.81 | 0.2 % | 0.0 |
| One-Class SVM | 0.77 | 0.55 | 0.64 | 0.82 | 4.1 % | 28.9 |
| Reglas fijas de la Fase 2 | 0.23 | 0.90 | 0.36 | — | 73.9 % | — |

LOF es el punto medio: detecta casi todos los picos, caídas de humedad y
sensores desconectados sin llenar de alarmas falsas. El recall bajo viene del
calentamiento descontrolado y del foco encendido con la temperatura bajando,
que se parecen al calentamiento y al enfriamiento normales del histórico; un
sobrecalentamiento real pasa de 38.5 °C y lo atrapa la regla fija del backend.
El análisis completo está en el notebook.
