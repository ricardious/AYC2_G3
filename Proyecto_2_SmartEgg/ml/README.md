# Modelos de machine learning

Aquí está el código de **entrenamiento**. Se corre en la laptop (o en Colab) cuando cambia el dataset. El servidor en la nube no lo usa: solo carga el modelo ya exportado.

| Carpeta | Modelo | Estado |
| --- | --- | --- |
| [`vision/`](vision/) | Clasificador de fotos `huevo` / `objeto` / `vacio` (MobileNetV2, transfer learning) | listo para entrenar |
| `anomalias/` | Detección de anomalías en la telemetría | pendiente |

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

Ejecutar todas las celdas (*Run → Run All Cells*). En CPU tarda unos 10 a 15 minutos con 750 fotos.

**Desde la terminal**, con el mismo resultado y sin gráficas en pantalla:

```bash
python ml/vision/smartegg_vision.py
```

Las dos formas generan:

- `ml/vision/modelo/smartegg_vision.onnx` y `clases.json`.
- `ml/vision/resultados/`: `matriz_confusion.png`, `curvas_entrenamiento.png`, `errores.png`, `reporte.txt` (precision, recall y F1 por clase) y `metricas.json`.

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
