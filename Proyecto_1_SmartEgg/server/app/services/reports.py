from __future__ import annotations

import math
from datetime import UTC, date, datetime, time, timedelta
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Alarm,
    DoorEvent,
    Egg,
    Incubator,
    Lot,
    RotationEvent,
    Technician,
    TelemetryReading,
)

PAGE_W, PAGE_H = A4
MARGIN = 48
CONTENT_W = PAGE_W - MARGIN * 2

# Tinta sobre papel: un acento, y color sólo donde significa algo.
TEXT = colors.HexColor("#1A1A1A")
MUTED = colors.HexColor("#7C7C77")
HAIRLINE = colors.HexColor("#E3E3DE")
BAND = colors.HexColor("#F2F6F6")
ACCENT = colors.HexColor("#0F7F8A")
CHART_TEMPERATURE = colors.HexColor("#C0661A")
CHART_HUMIDITY = ACCENT
DANGER = colors.HexColor("#C2412D")

ALARM_LABELS = {
    "temperature_high": "Temperatura alta",
    "temperature_low": "Temperatura baja",
    "humidity_high": "Humedad alta",
    "humidity_low": "Humedad baja",
    "door_open": "Puerta abierta",
}

LOT_ROWS = 4
ALARM_ROWS = 6
APPENDIX_ROWS = 30


def _day_bounds(day: date, timezone_name: str) -> tuple[datetime, datetime]:
    local_zone = ZoneInfo(timezone_name)
    start = datetime.combine(day, time.min, tzinfo=local_zone)
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)


def build_daily_report(
    db: Session,
    *,
    incubator: Incubator,
    technician: Technician,
    day: date,
    logo_path: Path | None,
    timezone_name: str,
    subject_operator: Technician | None = None,
) -> bytes:
    start, end = _day_bounds(day, timezone_name)
    readings = list(
        db.scalars(
            select(TelemetryReading)
            .where(
                TelemetryReading.incubator_id == incubator.id,
                TelemetryReading.recorded_at >= start,
                TelemetryReading.recorded_at < end,
            )
            .order_by(TelemetryReading.recorded_at)
        ).all()
    )
    lots_query = (
        select(Lot.code, Lot.species, Lot.started_on, func.count(Egg.id))
        .join(Egg, Egg.lot_id == Lot.id)
        .where(
            Egg.incubator_id == incubator.id,
            Lot.status == "active",
            Egg.status == "incubating",
        )
        .group_by(Lot.id)
        .order_by(Lot.code)
    )
    if subject_operator is not None:
        lots_query = lots_query.where(Lot.created_by_id == subject_operator.id)
    lots = db.execute(lots_query).all()
    alarm_query = select(Alarm).where(
        Alarm.incubator_id == incubator.id,
        Alarm.occurred_at >= start,
        Alarm.occurred_at < end,
    )
    if subject_operator is not None:
        alarm_query = alarm_query.where(Alarm.acknowledged_by_id == subject_operator.id)
    alarms = list(db.scalars(alarm_query.order_by(Alarm.occurred_at)).all())
    rotations = int(
        db.scalar(
            select(func.count(RotationEvent.id)).where(
                RotationEvent.incubator_id == incubator.id,
                RotationEvent.performed_at >= start,
                RotationEvent.performed_at < end,
            )
        )
        or 0
    )
    operation_filters = [
        DoorEvent.incubator_id == incubator.id,
        DoorEvent.opened_at >= start,
        DoorEvent.opened_at < end,
    ]
    if subject_operator is not None:
        operation_filters.append(DoorEvent.operator_id == subject_operator.id)
    operations = int(
        db.scalar(select(func.count(DoorEvent.id)).where(*operation_filters)) or 0
    )
    report_technician = subject_operator or technician

    lot_overflow = lots[LOT_ROWS:]
    alarm_overflow = alarms[ALARM_ROWS:]
    appendix_rows = len(lot_overflow) + len(alarm_overflow)
    pages = 1 + math.ceil(appendix_rows / APPENDIX_ROWS)

    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    pdf.setTitle(f"SmartEgg - Reporte diario {day.isoformat()}")
    pdf.setAuthor(technician.full_name)
    _draw_overview(
        pdf,
        incubator=incubator,
        technician=report_technician,
        day=day,
        logo_path=logo_path,
        timezone_name=timezone_name,
        readings=readings,
        lots=lots,
        alarms=alarms,
        rotations=rotations,
        operations=operations,
        pages=pages,
    )
    if appendix_rows:
        _draw_appendix(
            pdf,
            incubator=incubator,
            technician=report_technician,
            day=day,
            timezone_name=timezone_name,
            lots=lot_overflow,
            alarms=alarm_overflow,
            pages=pages,
        )

    pdf.save()
    return output.getvalue()


def _draw_overview(
    pdf: canvas.Canvas,
    *,
    incubator: Incubator,
    technician: Technician,
    day: date,
    logo_path: Path | None,
    timezone_name: str,
    readings: list[TelemetryReading],
    lots: list,
    alarms: list[Alarm],
    rotations: int,
    operations: int,
    pages: int,
) -> None:
    config = incubator.config
    temperature_range = (
        getattr(config, "temperature_min_c", 37.0),
        getattr(config, "temperature_max_c", 38.0),
    )
    humidity_range = (
        getattr(config, "humidity_min_pct", 50.0),
        getattr(config, "humidity_max_pct", 65.0),
    )
    _draw_header(pdf, day=day, logo_path=logo_path)

    # Título y ficha del documento.
    _text(pdf, MARGIN, 742, "Control diario", "Helvetica-Bold", 24)
    status = "En línea" if incubator.is_online else "Sin enlace"
    _text(
        pdf,
        MARGIN,
        724,
        f"{incubator.name}  ·  {incubator.code}  ·  {status}",
        "Helvetica",
        8.5,
        MUTED,
    )
    occupied = sum(int(row[3]) for row in lots)
    local_now = datetime.now(ZoneInfo(timezone_name))
    _key_values(
        pdf,
        y=686,
        items=[
            ("FECHA", day.strftime("%d/%m/%Y")),
            ("RESPONSABLE", _ellipsize(technician.full_name, 26)),
            ("OCUPACIÓN", f"{occupied} de {incubator.capacity} posiciones"),
            ("GENERADO", local_now.strftime("%d/%m/%Y %H:%M")),
        ],
    )

    # 01 · Resumen: cuatro cifras, cada una con su contexto debajo.
    temperatures = [item.temperature_c for item in readings]
    humidities = [item.humidity_pct for item in readings]
    _section(pdf, 650, "01", "RESUMEN", f"{len(readings)} lecturas")
    t_in = _in_range(temperatures, temperature_range)
    h_in = _in_range(humidities, humidity_range)
    _figures(
        pdf,
        y=596,
        items=[
            (
                "TEMPERATURA MEDIA",
                _metric(temperatures, _average, " °C"),
                _spread(temperatures, "°C"),
                CHART_TEMPERATURE,
            ),
            (
                "HUMEDAD MEDIA",
                _metric(humidities, _average, " %"),
                _spread(humidities, "%"),
                CHART_HUMIDITY,
            ),
            (
                "TIEMPO EN RANGO",
                "—" if t_in is None else f"{t_in} %",
                "de temperatura"
                + ("" if h_in is None else f"  ·  {h_in} % de humedad"),
                TEXT,
            ),
            (
                "ACTIVIDAD",
                str(rotations),
                f"rotaciones  ·  {operations} "
                + ("apertura" if operations == 1 else "aperturas"),
                TEXT,
            ),
        ],
    )

    # 02 · Ambiente: dos carriles con el mismo eje de horas.
    _section(
        pdf,
        566,
        "02",
        "AMBIENTE",
        "Banda: rango óptimo configurado",
    )
    _draw_lane(
        pdf,
        y=476,
        h=66,
        label="Temperatura",
        unit="°C",
        values=[(item.recorded_at, item.temperature_c) for item in readings],
        timezone_name=timezone_name,
        safe_range=temperature_range,
        color=CHART_TEMPERATURE,
    )
    _draw_lane(
        pdf,
        y=392,
        h=66,
        label="Humedad",
        unit="%",
        values=[(item.recorded_at, item.humidity_pct) for item in readings],
        timezone_name=timezone_name,
        safe_range=humidity_range,
        color=CHART_HUMIDITY,
        hours=True,
    )

    # 03 · Lotes.
    _section(pdf, 350, "03", "LOTES ACTIVOS", f"Capacidad {incubator.capacity}")
    shown_lots = lots[:LOT_ROWS]
    _table(
        pdf,
        y=326,
        columns=_LOT_COLUMNS,
        rows=[_lot_row(lot) for lot in shown_lots],
        empty="Sin lotes activos en la incubadora.",
        more=len(lots) - LOT_ROWS,
    )

    # 04 · Alertas, a continuación de los lotes que haya.
    alerts_y = (
        326 - (max(len(shown_lots), 1) + (1 if len(lots) > LOT_ROWS else 0)) * 17 - 44
    )
    active = sum(1 for alarm in alarms if alarm.resolved_at is None)
    _section(
        pdf,
        alerts_y,
        "04",
        "ALERTAS",
        f"{len(alarms)} registradas  ·  {active} activas",
    )
    _table(
        pdf,
        y=alerts_y - 24,
        columns=_ALARM_COLUMNS,
        rows=[_alarm_row(alarm, timezone_name) for alarm in alarms[:ALARM_ROWS]],
        empty="Operación estable: no se registraron alertas este día.",
        more=len(alarms) - ALARM_ROWS,
        markers=[_severity_color(alarm) for alarm in alarms[:ALARM_ROWS]],
    )
    _draw_footer(pdf, technician, page=1, pages=pages)


_LOT_COLUMNS = [
    ("LOTE", 0, "left"),
    ("ESPECIE", 130, "left"),
    ("INICIO", 290, "left"),
    ("HUEVOS", CONTENT_W, "right"),
]

_ALARM_COLUMNS = [
    ("HORA", 0, "left"),
    ("TIPO", 70, "left"),
    ("SEVERIDAD", 220, "left"),
    ("DURACIÓN", 320, "left"),
    ("ESTADO", CONTENT_W, "right"),
]


def _draw_header(pdf: canvas.Canvas, *, day: date, logo_path: Path | None) -> None:
    if logo_path and logo_path.is_file():
        try:
            pdf.drawImage(
                str(logo_path),
                MARGIN,
                790,
                width=16,
                height=16,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
        except Exception:
            _draw_egg_mark(pdf, MARGIN + 6, 798)
    else:
        _draw_egg_mark(pdf, MARGIN + 6, 798)
    _text(pdf, MARGIN + 20, 795, "SMART EGG", "Helvetica-Bold", 8, TEXT, 1.2)
    _text(
        pdf,
        PAGE_W - MARGIN,
        795,
        f"REPORTE DIARIO  ·  {day.strftime('%d.%m.%Y')}",
        "Helvetica",
        7,
        MUTED,
        1,
        align="right",
    )
    _rule(pdf, 780)


def _draw_egg_mark(pdf: canvas.Canvas, x: float, y: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(TEXT)
    pdf.setLineWidth(0.9)
    path = pdf.beginPath()
    path.moveTo(x, y + 8)
    path.curveTo(x - 6.5, y + 1.5, x - 6.5, y - 7, x, y - 7.5)
    path.curveTo(x + 6.5, y - 7, x + 6.5, y + 1.5, x, y + 8)
    pdf.drawPath(path, fill=0, stroke=1)
    pdf.setStrokeColor(ACCENT)
    for offset, half in ((-1.5, 3.2), (-4.2, 4.4)):
        pdf.line(x - half, y + offset, x + half, y + offset)
    pdf.restoreState()


def _key_values(pdf: canvas.Canvas, *, y: float, items: list[tuple[str, str]]) -> None:
    width = CONTENT_W / len(items)
    for index, (label, value) in enumerate(items):
        x = MARGIN + index * width
        _text(pdf, x, y + 12, label, "Helvetica", 6, MUTED, 0.9)
        _text(pdf, x, y, value, "Helvetica", 8.5)


def _section(
    pdf: canvas.Canvas, y: float, index: str, title: str, note: str = ""
) -> None:
    """Encabezado de sección: número en acento, título espaciado y filete."""
    _text(pdf, MARGIN, y, index, "Helvetica-Bold", 7, ACCENT, 0.8)
    _text(pdf, MARGIN + 18, y, title, "Helvetica-Bold", 7, TEXT, 1.2)
    if note:
        _text(pdf, PAGE_W - MARGIN, y, note, "Helvetica", 7, MUTED, align="right")
    _rule(pdf, y - 8)


def _figures(
    pdf: canvas.Canvas, *, y: float, items: list[tuple[str, str, str, colors.Color]]
) -> None:
    width = CONTENT_W / len(items)
    for index, (label, value, caption, color) in enumerate(items):
        x = MARGIN + index * width
        _text(pdf, x, y + 30, label, "Helvetica", 6, MUTED, 0.9)
        _text(pdf, x, y + 8, value, "Helvetica", 20, color if value != "—" else MUTED)
        _text(pdf, x, y - 6, _ellipsize(caption, 34), "Helvetica", 6.8, MUTED)


def _draw_lane(
    pdf: canvas.Canvas,
    *,
    y: float,
    h: float,
    label: str,
    unit: str,
    values: list[tuple[datetime, float]],
    timezone_name: str,
    safe_range: tuple[float, float],
    color: colors.Color,
    hours: bool = False,
) -> None:
    """Un carril de 00:00 a 24:00 con la banda óptima y la escala a la izquierda."""
    plot_x = MARGIN + 74
    plot_w = CONTENT_W - 74
    raw = [value for _, value in values]
    low = min(raw + [safe_range[0]])
    high = max(raw + [safe_range[1]])
    pad = max((high - low) * 0.12, 0.3)
    low, high = low - pad, high + pad

    def sy(value: float) -> float:
        return y + (value - low) / (high - low) * h

    # Rótulo, última lectura y escala.
    _text(pdf, MARGIN, y + h - 7, label.upper(), "Helvetica", 6, MUTED, 0.9)
    current = f"{raw[-1]:.1f} {unit}" if raw else "Sin datos"
    _text(pdf, MARGIN, y + h - 24, current, "Helvetica", 12, color if raw else MUTED)
    _text(
        pdf,
        MARGIN,
        y + h - 36,
        f"óptimo {safe_range[0]:g}–{safe_range[1]:g}",
        "Helvetica",
        6.5,
        MUTED,
    )

    pdf.saveState()
    pdf.setFillColor(BAND)
    pdf.rect(
        plot_x,
        sy(safe_range[0]),
        plot_w,
        sy(safe_range[1]) - sy(safe_range[0]),
        fill=1,
        stroke=0,
    )
    pdf.setStrokeColor(HAIRLINE)
    pdf.setLineWidth(0.4)
    pdf.line(plot_x, y, plot_x + plot_w, y)
    for hour in range(0, 25, 3):
        gx = plot_x + plot_w * hour / 24
        pdf.setDash(1, 2)
        pdf.line(gx, y, gx, y + h)
        if hours:
            pdf.setDash()
            _text(
                pdf, gx, y - 11, f"{hour:02d}:00", "Helvetica", 6, MUTED, align="center"
            )
    pdf.setDash()
    for value in safe_range:
        _text(
            pdf,
            plot_x - 4,
            sy(value) - 2,
            f"{value:g}",
            "Helvetica",
            5.5,
            MUTED,
            align="right",
        )

    if not values:
        _text(
            pdf,
            plot_x + plot_w / 2,
            y + h / 2 - 3,
            "Sin telemetría registrada",
            "Helvetica",
            7,
            MUTED,
            align="center",
        )
        pdf.restoreState()
        return

    zone = ZoneInfo(timezone_name)

    def sx(moment: datetime) -> float:
        local = _aware(moment).astimezone(zone)
        seconds = local.hour * 3600 + local.minute * 60 + local.second
        return plot_x + plot_w * seconds / 86400

    selected = _downsample(values, 288)
    path = pdf.beginPath()
    for index, (moment, value) in enumerate(selected):
        point = (sx(moment), sy(value))
        if index == 0:
            path.moveTo(*point)
        else:
            path.lineTo(*point)
    pdf.setStrokeColor(color)
    pdf.setLineWidth(1)
    pdf.setLineJoin(1)
    pdf.drawPath(path, fill=0, stroke=1)
    last_moment, last_value = selected[-1]
    pdf.setFillColor(color)
    pdf.circle(sx(last_moment), sy(last_value), 1.8, fill=1, stroke=0)
    pdf.restoreState()


def _table(
    pdf: canvas.Canvas,
    *,
    y: float,
    columns: list[tuple[str, float, str]],
    rows: list[list[str]],
    empty: str,
    more: int = 0,
    markers: list[colors.Color | None] | None = None,
    row_h: float = 17,
) -> None:
    """Tabla sin cajas: cabecera en gris, filas separadas por un filete."""
    for title, offset, align in columns:
        _text(pdf, MARGIN + offset, y, title, "Helvetica", 6, MUTED, 0.9, align=align)
    if not rows:
        _text(pdf, MARGIN, y - row_h, empty, "Helvetica", 8, MUTED)
        return
    for index, row in enumerate(rows):
        row_y = y - (index + 1) * row_h
        _rule(pdf, row_y + row_h - 5)
        marker = markers[index] if markers else None
        for col, ((_, offset, align), value) in enumerate(
            zip(columns, row, strict=True)
        ):
            x = MARGIN + offset
            if col == 0 and marker is not None:
                pdf.setFillColor(marker)
                pdf.circle(x + 2, row_y + 2.6, 2, fill=1, stroke=0)
                x += 9
            _text(
                pdf,
                x,
                row_y,
                value,
                "Helvetica-Bold" if col == 0 else "Helvetica",
                8,
                TEXT if col == 0 else MUTED if align == "right" else TEXT,
                align=align,
            )
    if more > 0:
        _text(
            pdf,
            MARGIN,
            y - (len(rows) + 1) * row_h,
            f"+ {more} más en el anexo",
            "Helvetica",
            7,
            ACCENT,
        )


def _lot_row(lot) -> list[str]:
    return [
        _ellipsize(lot[0], 22),
        _ellipsize(lot[1], 24),
        lot[2].strftime("%d/%m/%Y"),
        str(lot[3]),
    ]


def _alarm_row(alarm: Alarm, timezone_name: str) -> list[str]:
    return [
        _time(alarm.occurred_at, timezone_name)[:5],
        ALARM_LABELS.get(alarm.kind, _ellipsize(alarm.message, 24)),
        "Crítica" if alarm.severity == "critical" else "Advertencia",
        _duration(alarm),
        "Resuelta" if alarm.resolved_at else "Activa",
    ]


def _severity_color(alarm: Alarm) -> colors.Color:
    return DANGER if alarm.severity == "critical" else CHART_TEMPERATURE


def _duration(alarm: Alarm) -> str:
    if alarm.resolved_at is None:
        return "En curso"
    minutes = round(
        (_aware(alarm.resolved_at) - _aware(alarm.occurred_at)).total_seconds() / 60
    )
    if minutes < 1:
        return "< 1 min"
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60} h {minutes % 60:02d} min"


def _draw_appendix(
    pdf: canvas.Canvas,
    *,
    incubator: Incubator,
    technician: Technician,
    day: date,
    timezone_name: str,
    lots: list,
    alarms: list[Alarm],
    pages: int,
) -> None:
    """Continúa las tablas que no cupieron en la primera página."""
    # (sección, número, columnas, fila, marcador): conserva la numeración.
    queue = [
        ("LOTES ACTIVOS", "03", _LOT_COLUMNS, _lot_row(lot), None) for lot in lots
    ] + [
        (
            "ALERTAS",
            "04",
            _ALARM_COLUMNS,
            _alarm_row(alarm, timezone_name),
            _severity_color(alarm),
        )
        for alarm in alarms
    ]
    for page, offset in enumerate(range(0, len(queue), APPENDIX_ROWS), start=2):
        pdf.showPage()
        _draw_header(pdf, day=day, logo_path=None)
        _text(pdf, MARGIN, 742, "Anexo", "Helvetica-Bold", 24)
        _text(
            pdf,
            MARGIN,
            724,
            f"{incubator.name}  ·  {incubator.code}",
            "Helvetica",
            8.5,
            MUTED,
        )
        chunk = queue[offset : offset + APPENDIX_ROWS]
        y = 690
        for title in dict.fromkeys(item[0] for item in chunk):
            rows = [item for item in chunk if item[0] == title]
            _section(pdf, y, rows[0][1], f"{title} · CONTINUACIÓN")
            _table(
                pdf,
                y=y - 24,
                columns=rows[0][2],
                rows=[item[3] for item in rows],
                markers=[item[4] for item in rows],
                empty="",
            )
            y -= 24 + (len(rows) + 1) * 17 + 30
        _draw_footer(pdf, technician, page=page, pages=pages)


def _draw_footer(
    pdf: canvas.Canvas, technician: Technician, *, page: int, pages: int
) -> None:
    _rule(pdf, 64)
    _text(
        pdf,
        MARGIN,
        50,
        f"Generado por {technician.full_name}  ·  SmartEgg  ·  "
        "Facultad de Ingeniería, USAC",
        "Helvetica",
        6.5,
        MUTED,
    )
    _text(
        pdf,
        PAGE_W - MARGIN,
        50,
        f"Página {page} de {pages}",
        "Helvetica",
        6.5,
        MUTED,
        align="right",
    )


def _rule(pdf: canvas.Canvas, y: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(HAIRLINE)
    pdf.setLineWidth(0.5)
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y)
    pdf.restoreState()


def _text(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    value: str,
    font: str,
    size: float,
    color: colors.Color = TEXT,
    spacing: float = 0,
    *,
    align: str = "left",
) -> None:
    """Texto con espaciado entre letras; alinea midiendo el ancho real."""
    width = pdf.stringWidth(value, font, size) + spacing * max(len(value) - 1, 0)
    if align == "right":
        x -= width
    elif align == "center":
        x -= width / 2
    text = pdf.beginText(x, y)
    text.setFont(font, size)
    text.setCharSpace(spacing)
    text.setFillColor(color)
    text.textOut(value)
    pdf.drawText(text)


def _in_range(values: list[float], bounds: tuple[float, float]) -> int | None:
    if not values:
        return None
    inside = sum(1 for value in values if bounds[0] <= value <= bounds[1])
    return round(inside / len(values) * 100)


def _spread(values: list[float], unit: str) -> str:
    if not values:
        return "Sin lecturas"
    return f"mín {min(values):.1f}  ·  máx {max(values):.1f} {unit}"


def _metric(values: list[float], reducer, suffix: str) -> str:
    return "—" if not values else f"{reducer(values):.1f}{suffix}"


def _average(values: list[float]) -> float:
    return sum(values) / len(values)


def _downsample(
    values: list[tuple[datetime, float]], maximum: int
) -> list[tuple[datetime, float]]:
    if len(values) <= maximum:
        return values
    step = math.ceil(len(values) / maximum)
    selected = values[::step]
    if selected[-1] != values[-1]:
        selected.append(values[-1])
    return selected


def _ellipsize(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: max(1, limit - 1)].rstrip() + "…"


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _time(value: datetime, timezone_name: str) -> str:
    return _aware(value).astimezone(ZoneInfo(timezone_name)).strftime("%H:%M:%S")
