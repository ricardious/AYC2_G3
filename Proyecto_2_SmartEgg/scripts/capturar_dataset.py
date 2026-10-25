#!/usr/bin/env python3
"""Captura guiada de las 50 fotos extra (objeto y huevo).

Uso:
    python scripts/capturar_dataset.py webcam objeto --url http://127.0.0.1:8080/video
    python scripts/capturar_dataset.py webcam huevo  --url http://127.0.0.1:8080/video
    python scripts/capturar_dataset.py camara objeto --camara 0

Argumentos:
    fuente          webcam (IP Webcam) o camara (webcam local).
    clase           objeto | huevo.
    --url URL       URL de video de IP Webcam.
    --camara N      Índice de la webcam local (por defecto: 0).
    --salida DIR    Carpeta base del dataset (por defecto: dataset).
    --rotar GRADOS  0, 90, 180 o 270.
    --desde TANDA   Empezar (y rehacer) una tanda concreta
                    (1-8 en objeto, 1-2 en huevo).

Teclas en la ventana:
    R      Inicia o detiene la ráfaga (una foto cada 0,5 s).
    U      Borra la última tanda con fotos y vuelve a ella.
    Q/ESC  Sale guardando el progreso.

La ráfaga se detiene sola al llegar a 5 fotos. Si la detienes antes con R,
puedes continuarla después: el progreso parcial queda guardado.

Las fotos se guardan como:
    dataset/<clase>/<clase>_extra_t<TT>_<F>_<timestamp_ms>.jpg
"""

import argparse
import json
import os
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

# OpenCV usa Qt. En GNOME/Wayland conviene forzar XCB (XWayland) antes de
# importar cv2 para que la ventana de vista previa no se quede bloqueada.
if os.environ.get("DISPLAY") and "QT_QPA_PLATFORM" not in os.environ:
    os.environ["QT_QPA_PLATFORM"] = "xcb"

import cv2

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

FOTOS_POR_TANDA = 5
INTERVALO_SEGUNDOS = 0.5
ESPERA_ENTRE_TANDAS = 3.0
ESPERA_CAMBIO_LUZ = 60.0
CALIDAD_JPEG = 95

MAX_ANCHO_VISTA = 1280
MAX_ALTO_VISTA = 800

LUCES = {
    "L1": "foco encendido, luz del cuarto apagada (muy rojo/sobreexpuesto)",
    "L2": "foco encendido, luz del cuarto encendida (rojizo, más parejo)",
    "L3": "foco apagado, luz del cuarto encendida (colores normales)",
    "L4": "foco apagado, luz del cuarto apagada (penumbra)",
}

MENSAJES_CAMBIO_LUZ = {
    "L1": "CAMBIO DE LUZ -> L1: enciende el foco y apaga la luz del cuarto",
    "L2": "CAMBIO DE LUZ -> L2: enciende el foco y la luz del cuarto",
    "L3": "CAMBIO DE LUZ -> L3: apaga el foco y enciende la luz del cuarto",
    "L4": "CAMBIO DE LUZ -> L4: apaga el foco y la luz del cuarto (solo ventana/pasillo)",
}

# Plan de tandas extra. Cada tanda siempre toma 5 fotos.
PLAN = {
    "objeto": [
        {
            "numero": 1,
            "luz": "L1",
            "huevos": 3,
            "objeto": "tapita amarilla",
            "donde": "espacio de arriba a la derecha",
        },
        {
            "numero": 2,
            "luz": "L1",
            "huevos": 3,
            "objeto": "tapita amarilla",
            "donde": "espacio de abajo a la izquierda",
        },
        {
            "numero": 3,
            "luz": "L1",
            "huevos": 2,
            "objeto": "borrador o tapita de otro color",
            "donde": "encima o pegado a un huevo",
        },
        {
            "numero": 4,
            "luz": "L1",
            "huevos": 1,
            "objeto": "2 objetos pequeños",
            "donde": "los dos en espacios distintos",
        },
        {
            "numero": 5,
            "luz": "L2",
            "huevos": 3,
            "objeto": "moneda o llave",
            "donde": "espacio libre",
        },
        {
            "numero": 6,
            "luz": "L2",
            "huevos": 2,
            "objeto": "canica o pelotita",
            "donde": "espacio libre",
        },
        {
            "numero": 7,
            "luz": "L3",
            "huevos": 3,
            "objeto": "tapita amarilla",
            "donde": "espacio libre",
        },
        {
            "numero": 8,
            "luz": "L4",
            "huevos": 0,
            "objeto": "tapita amarilla",
            "donde": "en la bandeja vacía",
        },
    ],
    "huevo": [
        {
            "numero": 1,
            "luz": "L1",
            "huevos": 4,
            "objeto": "ninguno",
            "donde": "bandeja llena",
        },
        {
            "numero": 2,
            "luz": "L4",
            "huevos": 2,
            "objeto": "ninguno",
            "donde": "espacios distintos a los de antes",
        },
    ],
}


# ---------------------------------------------------------------------------
# Validación y progreso
# ---------------------------------------------------------------------------


def validar_plan():
    """Comprueba que el plan sume 40 fotos de objeto y 10 de huevo."""
    objeto = len(PLAN["objeto"]) * FOTOS_POR_TANDA
    huevo = len(PLAN["huevo"]) * FOTOS_POR_TANDA
    if objeto != 40 or huevo != 10:
        raise SystemExit(
            f"ERROR en el plan: objeto={objeto} fotos (esperado 40), "
            f"huevo={huevo} fotos (esperado 10)."
        )
    for clase, tandas in PLAN.items():
        for tanda in tandas:
            if tanda["luz"] not in LUCES:
                raise SystemExit(f"ERROR: luz desconocida {tanda['luz']} en {clase}.")
    print("Plan OK: objeto = 8 tandas / 40 fotos; huevo = 2 tandas / 10 fotos; total 50.")


class ProgresoExtra:
    """Guarda el avance de las fotos extra en .progreso_extra.json."""

    def __init__(self, ruta: Path, clase: str):
        self.ruta = ruta
        self.clase = clase
        self.datos = {"clase": clase, "tandas": {}, "ultima_luz": None}
        self.cargar()

    def cargar(self):
        if not self.ruta.exists():
            return
        try:
            datos = json.loads(self.ruta.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"AVISO: no se pudo leer {self.ruta}: {error}. Se empieza de cero.")
            return
        if not isinstance(datos, dict) or datos.get("clase") != self.clase:
            print(f"AVISO: {self.ruta} no corresponde a la clase '{self.clase}'.")
            return
        if not isinstance(datos.get("tandas"), dict):
            print(f"AVISO: {self.ruta} no tiene tandas válidas.")
            return
        self.datos = datos
        self.datos.setdefault("ultima_luz", None)

    def guardar(self):
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        temporal = self.ruta.with_suffix(".json.tmp")
        temporal.write_text(
            json.dumps(self.datos, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporal.replace(self.ruta)

    def registro(self, clave: str):
        return self.datos["tandas"].get(
            clave, {"estado": "pendiente", "archivos": []}
        )

    def estado(self, clave: str) -> str:
        return self.registro(clave).get("estado", "pendiente")

    def archivos(self, clave: str):
        return list(self.registro(clave).get("archivos", []))

    def marcar_en_progreso(self, clave: str, archivos):
        self.datos["tandas"][clave] = {
            "estado": "en_progreso",
            "archivos": list(archivos),
        }
        self.guardar()

    def marcar_hecha(self, clave: str, archivos, luz: str):
        self.datos["tandas"][clave] = {
            "estado": "hecha",
            "archivos": list(archivos),
            "luz": luz,
        }
        self.datos["ultima_luz"] = luz
        self.guardar()

    def reiniciar(self, clave: str):
        self.datos["tandas"][clave] = {"estado": "pendiente", "archivos": []}
        self.guardar()

    def limpiar_inexistentes(self, clase_dir: Path):
        """Quita del progreso los archivos que ya no existen en disco."""
        cambio = False
        for clave, registro in list(self.datos["tandas"].items()):
            archivos = [
                nombre for nombre in registro.get("archivos", [])
                if (clase_dir / nombre).exists()
            ]
            if archivos != registro.get("archivos", []):
                registro["archivos"] = archivos
                if registro.get("estado") == "hecha" and len(archivos) < FOTOS_POR_TANDA:
                    registro["estado"] = "en_progreso"
                self.datos["tandas"][clave] = registro
                cambio = True
        if cambio:
            self.guardar()

    def total_extra(self) -> int:
        return sum(
            len(registro.get("archivos", []))
            for registro in self.datos["tandas"].values()
        )


# ---------------------------------------------------------------------------
# Cámara y guardado
# ---------------------------------------------------------------------------


def normalizar_url_video(url: str) -> str:
    """Acepta http://IP:8080 y lo convierte en http://IP:8080/video."""
    url = url.strip().rstrip("/")
    if not url:
        raise ValueError("La URL no puede estar vacía.")
    if not url.startswith(("http://", "https://")):
        url = "http://" + url
    partes = urlparse(url)
    if partes.path.endswith("/shot.jpg"):
        url = url[:-9] + "/video"
    elif partes.path in ("", "/"):
        url += "/video"
    return url


def abrir_captura(url, camara: int):
    """Abre IP Webcam o la webcam local."""
    if url:
        captura = cv2.VideoCapture(url)
    else:
        captura = cv2.VideoCapture(camara, cv2.CAP_V4L2)
        if not captura.isOpened():
            captura.release()
            captura = cv2.VideoCapture(camara)
    if captura.isOpened():
        captura.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return captura


def leer_frame(captura):
    try:
        correcto, frame = captura.read()
    except cv2.error:
        correcto, frame = False, None
    return frame if correcto and frame is not None else None


def leer_frame_fresco(captura):
    """Descarta frames viejos antes de guardar."""
    for _ in range(3):
        try:
            captura.grab()
        except cv2.error:
            break
    return leer_frame(captura)


def reconectar(url, camara: int, intentos: int = 3):
    for intento in range(1, intentos + 1):
        print(f"[!] Cámara sin respuesta. Reconectando ({intento}/{intentos})...")
        time.sleep(1.0)
        captura = abrir_captura(url, camara)
        if captura.isOpened():
            for _ in range(20):
                frame = leer_frame(captura)
                if frame is not None:
                    print("[OK] Cámara reconectada.")
                    return captura, frame
                time.sleep(0.1)
        captura.release()
    return None, None


def mensaje_error_camara(url, camara: int):
    print("\nNo se pudo abrir la cámara.", file=sys.stderr)
    if url:
        print(f"URL: {url}", file=sys.stderr)
        print("¿Corriste adb forward tcp:8080 tcp:8080 y abriste IP Webcam?", file=sys.stderr)
        print("Revisa también que la pantalla del celular esté despierta.", file=sys.stderr)
    else:
        print(f"Webcam: /dev/video{camara}", file=sys.stderr)
        print("Revisa que la webcam exista y que tengas permisos para leerla.", file=sys.stderr)


def rotar(frame, grados: int):
    if grados == 90:
        return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    if grados == 180:
        return cv2.rotate(frame, cv2.ROTATE_180)
    if grados == 270:
        return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return frame


def guardar_foto(frame, clase_dir: Path, clase: str, tanda: int, foto: int) -> str:
    milisegundos = int(time.time() * 1000)
    while True:
        nombre = f"{clase}_extra_t{tanda:02d}_{foto}_{milisegundos}.jpg"
        ruta = clase_dir / nombre
        if not ruta.exists():
            break
        milisegundos += 1
    try:
        correcto = cv2.imwrite(
            str(ruta), frame, [cv2.IMWRITE_JPEG_QUALITY, CALIDAD_JPEG]
        )
    except cv2.error as error:
        raise RuntimeError(f"No se pudo guardar {ruta}: {error}") from error
    if not correcto:
        raise RuntimeError(f"OpenCV no pudo escribir {ruta}")
    return nombre


def borrar_archivos(clase_dir: Path, nombres):
    for nombre in nombres:
        try:
            (clase_dir / nombre).unlink()
        except FileNotFoundError:
            pass
        except OSError as error:
            print(f"AVISO: no se pudo borrar {nombre}: {error}")


# ---------------------------------------------------------------------------
# Interfaz
# ---------------------------------------------------------------------------


def sin_acentos(texto: str) -> str:
    return "".join(
        caracter
        for caracter in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caracter)
    )


def envolver(texto: str, maximo: int = 62):
    palabras = sin_acentos(texto).split()
    lineas = []
    actual = ""
    for palabra in palabras:
        candidato = f"{actual} {palabra}".strip()
        if len(candidato) <= maximo:
            actual = candidato
        else:
            if actual:
                lineas.append(actual)
            actual = palabra
    if actual:
        lineas.append(actual)
    return lineas


def ajustar_vista(frame):
    alto, ancho = frame.shape[:2]
    escala = min(1.0, MAX_ANCHO_VISTA / ancho, MAX_ALTO_VISTA / alto)
    if escala < 1.0:
        frame = cv2.resize(
            frame, None, fx=escala, fy=escala, interpolation=cv2.INTER_AREA
        )
    return frame


def dibujar_panel(vista, lineas):
    alto_linea = 22
    margen = 10
    alto_panel = margen * 2 + alto_linea * len(lineas)
    overlay = vista.copy()
    cv2.rectangle(overlay, (0, 0), (vista.shape[1], alto_panel), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.62, vista, 0.38, 0, vista)
    for indice, (texto, color, escala, grosor) in enumerate(lineas):
        y = margen + alto_linea * (indice + 1) - 5
        cv2.putText(
            vista,
            sin_acentos(texto),
            (margen, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            escala,
            color,
            grosor,
            cv2.LINE_AA,
        )
    return alto_panel


def dibujar_banner(vista, texto, color_fondo, color_texto=(255, 255, 255)):
    lineas = envolver(texto, 58)
    alto = 14 + 24 * len(lineas)
    y0 = vista.shape[0] - alto
    overlay = vista.copy()
    cv2.rectangle(overlay, (0, y0), (vista.shape[1], vista.shape[0]), color_fondo, -1)
    cv2.addWeighted(overlay, 0.82, vista, 0.18, 0, vista)
    for indice, linea in enumerate(lineas):
        cv2.putText(
            vista,
            linea,
            (12, y0 + 26 + 24 * indice),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.62,
            color_texto,
            2,
            cv2.LINE_AA,
        )


def dibujar_centrado(vista, texto, escala, color, grosor=4):
    (ancho_texto, alto_texto), _ = cv2.getTextSize(
        texto, cv2.FONT_HERSHEY_SIMPLEX, escala, grosor
    )
    x = (vista.shape[1] - ancho_texto) // 2
    y = (vista.shape[0] + alto_texto) // 2
    cv2.putText(
        vista, texto, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala,
        (0, 0, 0), grosor + 6, cv2.LINE_AA,
    )
    cv2.putText(
        vista, texto, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala,
        color, grosor, cv2.LINE_AA,
    )


def dibujar_interfaz(vista, ctx):
    lineas = [
        (
            f"EXTRA {ctx['clase'].upper()}  {ctx['total_extra']} / {ctx['meta']} fotos",
            (255, 255, 255),
            0.7,
            2,
        )
    ]

    if ctx.get("terminado"):
        lineas.append(("LISTO: tandas extra completas", (0, 255, 0), 0.75, 2))
        lineas.append(("Q/ESC para salir  |  U=borrar última tanda", (210, 210, 210), 0.55, 1))
    else:
        tanda = ctx["tanda"]
        texto_fotos = (
            f"Tanda {tanda['numero']}/{ctx['total_tandas']}  |  "
            f"Fotos de esta tanda: {ctx['fotos_tanda']}/{FOTOS_POR_TANDA}"
        )
        if ctx.get("rafaga"):
            texto_fotos += "  |  RAFAGA ACTIVA"
            color_fotos = (0, 0, 255)
        else:
            color_fotos = (255, 255, 255)
        lineas.append((texto_fotos, color_fotos, 0.62, 1))
        lineas.append((f"Huevos: {tanda['huevos']}", (255, 255, 255), 0.6, 1))
        lineas.append((f"Objeto: {tanda['objeto']}", (255, 255, 255), 0.6, 1))
        lineas.append((f"Dónde: {tanda['donde']}", (235, 235, 235), 0.58, 1))
        for linea in envolver(f"LUZ: {tanda['luz']} - {LUCES[tanda['luz']]}"):
            lineas.append((linea, (255, 220, 120), 0.58, 2))
        lineas.append(("MANO: FUERA de la imagen", (0, 255, 0), 0.65, 2))
        lineas.append(
            (
                "R: iniciar/detener rafaga  |  U: borrar ultima  |  Q: salir",
                (200, 200, 200),
                0.52,
                1,
            )
        )

    dibujar_panel(vista, lineas)

    if ctx.get("cambio_luz"):
        dibujar_banner(
            vista,
            ctx["mensaje_luz"] + "  |  Cambia la luz ahora y espera",
            (0, 0, 170),
        )

    if ctx.get("espera", 0) > 0:
        dibujar_centrado(vista, f"Espera {ctx['espera']} s", 1.3, (0, 255, 255), 3)

    if ctx.get("foto_actual"):
        dibujar_centrado(
            vista,
            f"Foto {ctx['foto_actual']}/{FOTOS_POR_TANDA}",
            1.3,
            (0, 255, 0),
            3,
        )

    if ctx.get("terminado"):
        dibujar_centrado(vista, "LISTO", 2.2, (0, 255, 0), 5)


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Captura guiada de las 50 fotos extra (objeto y huevo).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("fuente", choices=("webcam", "camara"), help="webcam o camara.")
    parser.add_argument("clase", choices=("objeto", "huevo"), help="Clase a capturar.")
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8080/video",
        help="URL de video de IP Webcam.",
    )
    parser.add_argument(
        "--camara", type=int, default=0, metavar="N",
        help="Índice de la webcam local (por defecto: 0).",
    )
    parser.add_argument(
        "--salida", default="dataset",
        help="Carpeta base del dataset (por defecto: dataset).",
    )
    parser.add_argument(
        "--rotar", type=int, choices=(0, 90, 180, 270), default=0,
        help="Rotación horaria en grados (por defecto: 0).",
    )
    parser.add_argument(
        "--desde", type=int, default=None, metavar="TANDA",
        help="Tanda por la que empezar; si ya tiene fotos, las borra y la rehace.",
    )
    args = parser.parse_args()

    validar_plan()

    clase = args.clase
    tandas = PLAN[clase]
    if args.desde is not None and not 1 <= args.desde <= len(tandas):
        parser.error(f"--desde debe estar entre 1 y {len(tandas)} para '{clase}'")

    salida = Path(args.salida).expanduser()
    clase_dir = salida / clase
    clase_dir.mkdir(parents=True, exist_ok=True)
    progreso = ProgresoExtra(clase_dir / ".progreso_extra.json", clase)
    progreso.limpiar_inexistentes(clase_dir)

    def clave_de(indice):
        return f"t{tandas[indice]['numero']:02d}"

    # Índice inicial.
    if args.desde is not None:
        indice = args.desde - 1
        clave = clave_de(indice)
        if progreso.archivos(clave):
            print(f"Rehaciendo la tanda {args.desde}; se borran sus fotos extra.")
            borrar_archivos(clase_dir, progreso.archivos(clave))
            progreso.reiniciar(clave)
    else:
        indice = next(
            (i for i in range(len(tandas)) if progreso.estado(clave_de(i)) != "hecha"),
            None,
        )

    total_jpg = len(list(clase_dir.glob("*.jpg")))
    meta = len(tandas) * FOTOS_POR_TANDA

    if indice is None:
        print(f"LISTO: las {len(tandas)} tandas extra de '{clase}' ya están hechas.")
        print(f"Fotos extra: {progreso.total_extra()}/{meta}")
        print(f"Fotos totales en {clase_dir}: {total_jpg}")
        return 0

    print(f"Clase: {clase}")
    print(f"Fotos extra objetivo: {meta} ({len(tandas)} tandas x {FOTOS_POR_TANDA})")
    print(f"Fotos extra ya hechas: {progreso.total_extra()}/{meta}")
    print(f"Fotos totales en {clase_dir}: {total_jpg}")
    print(f"Próxima tanda: {tandas[indice]['numero']}/{len(tandas)} - {tandas[indice]['luz']}")

    url = normalizar_url_video(args.url) if args.fuente == "webcam" else None
    if url:
        print(f"Fuente: {url}")
    else:
        print(f"Fuente: /dev/video{args.camara}")

    captura = abrir_captura(url, args.camara)
    if not captura.isOpened():
        mensaje_error_camara(url, args.camara)
        captura.release()
        return 1

    frame = None
    for _ in range(50):
        frame = leer_frame(captura)
        if frame is not None:
            break
        time.sleep(0.1)
    if frame is None:
        mensaje_error_camara(url, args.camara)
        captura.release()
        return 1

    ventana = f"SmartEgg - Fotos extra {clase.capitalize()}"

    ultima_luz = progreso.datos.get("ultima_luz")
    if args.desde is not None:
        # Al forzar una tanda, comparar con la luz de la tanda anterior del plan.
        ultima_luz = (
            tandas[indice - 1]["luz"] if indice > 0 else tandas[indice]["luz"]
        )
    elif ultima_luz is None:
        ultima_luz = tandas[indice]["luz"]

    estado = {
        "espera_hasta": 0.0,
        "motivo_espera": "",
        "cambio_luz": False,
        "rafaga": False,
        "ultimo_disparo": 0.0,
        "foto_actual": 0,
        "foto_hasta": 0.0,
        "terminado": False,
    }

    archivos_tanda = progreso.archivos(clave_de(indice))
    fotos_tanda = len(archivos_tanda)
    fallos_camara = 0

    def preparar_tanda(nuevo_indice, espera_entre_tandas=False):
        nonlocal archivos_tanda, fotos_tanda
        estado["rafaga"] = False
        estado["espera_hasta"] = 0.0
        estado["motivo_espera"] = ""
        estado["cambio_luz"] = False
        estado["foto_actual"] = 0
        if nuevo_indice >= len(tandas):
            estado["terminado"] = True
            return
        tanda = tandas[nuevo_indice]
        if tanda["luz"] != ultima_luz:
            estado["espera_hasta"] = time.monotonic() + ESPERA_CAMBIO_LUZ
            estado["motivo_espera"] = "luz"
            estado["cambio_luz"] = True
            print(
                f"{MENSAJES_CAMBIO_LUZ[tanda['luz']]}. "
                f"Espera {int(ESPERA_CAMBIO_LUZ)} s antes de capturar."
            )
        elif espera_entre_tandas:
            estado["espera_hasta"] = time.monotonic() + ESPERA_ENTRE_TANDAS
            estado["motivo_espera"] = "tanda"
        archivos_tanda = progreso.archivos(clave_de(nuevo_indice))
        fotos_tanda = len(archivos_tanda)

    preparar_tanda(indice)

    try:
        cv2.namedWindow(ventana, cv2.WINDOW_NORMAL)
        while True:
            if indice >= len(tandas):
                estado["terminado"] = True

            frame = leer_frame(captura)
            if frame is None:
                fallos_camara += 1
                if fallos_camara < 10:
                    time.sleep(0.05)
                    continue
                captura.release()
                captura, frame = reconectar(url, args.camara)
                if captura is None:
                    mensaje_error_camara(url, args.camara)
                    return 1
                fallos_camara = 0
            else:
                fallos_camara = 0

            frame = rotar(frame, args.rotar)
            vista = ajustar_vista(frame.copy())
            ahora = time.monotonic()

            espera = 0
            if estado["espera_hasta"] > ahora:
                espera = int(estado["espera_hasta"] - ahora + 0.999)
            elif estado["espera_hasta"]:
                estado["espera_hasta"] = 0.0
                estado["motivo_espera"] = ""
                estado["cambio_luz"] = False

            if indice < len(tandas):
                tanda = tandas[indice]
                ctx = {
                    "clase": clase,
                    "total_extra": progreso.total_extra(),
                    "meta": meta,
                    "tanda": tanda,
                    "total_tandas": len(tandas),
                    "fotos_tanda": fotos_tanda,
                    "espera": espera,
                    "cambio_luz": estado["cambio_luz"],
                    "mensaje_luz": MENSAJES_CAMBIO_LUZ[tanda["luz"]],
                    "rafaga": estado["rafaga"],
                    "foto_actual": (
                        estado["foto_actual"]
                        if ahora < estado["foto_hasta"]
                        else 0
                    ),
                    "terminado": False,
                }
            else:
                ctx = {
                    "clase": clase,
                    "total_extra": progreso.total_extra(),
                    "meta": meta,
                    "terminado": True,
                    "espera": 0,
                    "cambio_luz": False,
                    "mensaje_luz": "",
                    "rafaga": False,
                    "foto_actual": 0,
                }

            dibujar_interfaz(vista, ctx)
            cv2.imshow(ventana, vista)
            tecla = cv2.waitKey(20) & 0xFF

            try:
                if cv2.getWindowProperty(ventana, cv2.WND_PROP_VISIBLE) < 1:
                    break
            except cv2.error:
                break

            if tecla in (27, ord("q"), ord("Q")):
                break

            # U: borrar la última tanda con fotos y volver a ella.
            if tecla in (ord("u"), ord("U")):
                candidatos = [
                    (i, info) for i, info in enumerate(tandas)
                    if progreso.archivos(clave_de(i))
                ]
                if not candidatos:
                    print("No hay tandas con fotos para borrar.")
                    continue
                idx_borrar, info_borrar = candidatos[-1]
                clave_borrar = clave_de(idx_borrar)
                archivos_borrar = progreso.archivos(clave_borrar)
                borrar_archivos(clase_dir, archivos_borrar)
                progreso.reiniciar(clave_borrar)
                indice = idx_borrar
                estado["terminado"] = False
                estado["rafaga"] = False
                ultima_luz = (
                    tandas[indice - 1]["luz"] if indice > 0 else tandas[indice]["luz"]
                )
                progreso.datos["ultima_luz"] = ultima_luz
                progreso.guardar()
                preparar_tanda(indice)
                print(
                    f"Borrada la tanda {info_borrar['numero']} "
                    f"({len(archivos_borrar)} fotos)."
                )
                continue

            if estado["terminado"]:
                continue

            # Mientras se espera (3 s de escena o 60 s de luz), no se captura.
            if estado["espera_hasta"] > ahora:
                continue

            if tecla in (ord("r"), ord("R")):
                if estado["rafaga"]:
                    estado["rafaga"] = False
                    progreso.marcar_en_progreso(clave_de(indice), archivos_tanda)
                    print(
                        f"Ráfaga detenida en {fotos_tanda}/{FOTOS_POR_TANDA}. "
                        "Pulsa R para continuar o U para borrar la tanda."
                    )
                    continue
                if fotos_tanda >= FOTOS_POR_TANDA:
                    print("Esta tanda ya tiene 5 fotos.")
                    continue
                estado["rafaga"] = True
                estado["ultimo_disparo"] = 0.0
                print(
                    f"Ráfaga iniciada en la tanda {tandas[indice]['numero']} "
                    f"({fotos_tanda}/{FOTOS_POR_TANDA} fotos)."
                )

            # Captura de la ráfaga.
            if estado["rafaga"] and (ahora - estado["ultimo_disparo"]) >= INTERVALO_SEGUNDOS:
                frame_fresco = leer_frame_fresco(captura)
                if frame_fresco is None:
                    estado["rafaga"] = False
                    mensaje_error_camara(url, args.camara)
                    return 1
                frame_fresco = rotar(frame_fresco, args.rotar)
                numero_foto = fotos_tanda + 1
                nombre = guardar_foto(
                    frame_fresco,
                    clase_dir,
                    clase,
                    tandas[indice]["numero"],
                    numero_foto,
                )
                archivos_tanda.append(nombre)
                fotos_tanda += 1
                progreso.marcar_en_progreso(clave_de(indice), archivos_tanda)
                estado["ultimo_disparo"] = ahora
                estado["foto_actual"] = fotos_tanda
                estado["foto_hasta"] = ahora + 0.6
                print(f"Foto {fotos_tanda}/{FOTOS_POR_TANDA} -> {nombre}", flush=True)

                if fotos_tanda >= FOTOS_POR_TANDA:
                    estado["rafaga"] = False
                    progreso.marcar_hecha(
                        clave_de(indice), archivos_tanda, tandas[indice]["luz"]
                    )
                    ultima_luz = tandas[indice]["luz"]
                    print(
                        f"Tanda {tandas[indice]['numero']} completa (5/5). "
                        f"Fotos extra: {progreso.total_extra()}/{meta}."
                    )
                    indice += 1
                    preparar_tanda(indice, espera_entre_tandas=True)

    except KeyboardInterrupt:
        print("\nCaptura interrumpida por el usuario.")
    except RuntimeError as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        return 1
    except cv2.error as error:
        print(f"\nERROR de OpenCV: {error}", file=sys.stderr)
        return 1
    finally:
        progreso.guardar()
        if captura is not None:
            captura.release()
        try:
            cv2.destroyAllWindows()
        except cv2.error:
            pass

        total_jpg = len(list(clase_dir.glob("*.jpg")))
        extra = progreso.total_extra()
        print("\n" + "=" * 60)
        print(f"RESUMEN EXTRA - {clase.upper()}")
        print("=" * 60)
        print(f"Fotos extra: {extra}/{meta}")
        print(f"Fotos totales en {clase_dir}: {total_jpg}")
        if clase == "objeto":
            print(f"Esperado al terminar: 290 fotos (250 + 40 extra)")
        else:
            print(f"Esperado al terminar: 260 fotos (250 + 10 extra)")
        print("=" * 60)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
