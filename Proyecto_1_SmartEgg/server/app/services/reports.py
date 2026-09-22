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
MARGIN = 34

BG = colors.HexColor("#FFFFFF")
PANEL = colors.HexColor("#FFFFFF")
PANEL_ALT = colors.HexColor("#F5F5F2")
GRID = colors.HexColor("#D8D8D3")
TEXT = colors.HexColor("#111111")
MUTED = colors.HexColor("#666662")
CHART_TEMPERATURE = colors.HexColor("#C87818")
CHART_HUMIDITY = colors.HexColor("#168A96")


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
    )

    if len(lots) > 4 or len(alarms) > 5:
        _draw_appendix(
            pdf,
            incubator=incubator,
            technician=report_technician,
            day=day,
            timezone_name=timezone_name,
            lots=lots,
            alarms=alarms,
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
) -> None:
    _page_background(pdf)
    _draw_brand(pdf, logo_path)

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(MARGIN, 774, "REPORTE OPERATIVO / INCUBACIÓN")
    pdf.setFillColor(TEXT)
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(MARGIN, 746, "CONTROL DIARIO")
    pdf.setFillColor(TEXT)
    pdf.rect(MARGIN, 736, 56, 2, fill=1, stroke=0)

    status = "EN LÍNEA" if incubator.is_online else "SIN ENLACE"
    _status_chip(pdf, PAGE_W - MARGIN - 73, 750, status)
    pdf.setFillColor(TEXT)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawRightString(PAGE_W - MARGIN, 728, incubator.code)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawRightString(PAGE_W - MARGIN, 716, _ellipsize(incubator.name, 28))

    occupied = sum(int(row[3]) for row in lots)
    _draw_metadata_strip(
        pdf,
        y=660,
        values=[
            ("FECHA", day.strftime("%d / %m / %Y")),
            ("TÉCNICO", _ellipsize(technician.full_name.upper(), 22)),
            ("OCUPACIÓN", f"{occupied} / {incubator.capacity} HUEVOS"),
            ("OPERACIONES", str(operations)),
        ],
    )

    temperatures = [item.temperature_c for item in readings]
    humidities = [item.humidity_pct for item in readings]
    metrics = [
        ("TEMP. MÍNIMA", _metric(temperatures, min, " °C")),
        ("TEMP. PROMEDIO", _metric(temperatures, _average, " °C")),
        ("TEMP. MÁXIMA", _metric(temperatures, max, " °C")),
        ("HUMEDAD PROM.", _metric(humidities, _average, " %")),
    ]
    _draw_metric_cards(pdf, y=589, metrics=metrics)

    config = incubator.config
    _draw_chart(
        pdf,
        x=MARGIN,
        y=352,
        w=PAGE_W - (MARGIN * 2),
        h=210,
        readings=readings,
        timezone_name=timezone_name,
        temperature_range=(
            getattr(config, "temperature_min_c", 37.0),
            getattr(config, "temperature_max_c", 38.0),
        ),
        humidity_range=(
            getattr(config, "humidity_min_pct", 50.0),
            getattr(config, "humidity_max_pct", 65.0),
        ),
    )

    panel_gap = 10
    panel_w = (PAGE_W - MARGIN * 2 - panel_gap) / 2
    _draw_lots_panel(
        pdf,
        x=MARGIN,
        y=108,
        w=panel_w,
        h=220,
        lots=lots,
        capacity=incubator.capacity,
    )
    _draw_alarms_panel(
        pdf,
        x=MARGIN + panel_w + panel_gap,
        y=108,
        w=panel_w,
        h=220,
        alarms=alarms,
        timezone_name=timezone_name,
    )
    _draw_footer(pdf, technician, page=1)


def _page_background(pdf: canvas.Canvas) -> None:
    pdf.setFillColor(BG)
    pdf.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def _draw_brand(pdf: canvas.Canvas, logo_path: Path | None) -> None:
    if logo_path and logo_path.is_file():
        try:
            pdf.drawImage(
                str(logo_path),
                MARGIN,
                794,
                width=22,
                height=22,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
        except Exception:
            _draw_egg_mark(pdf, MARGIN + 10, 805)
    else:
        _draw_egg_mark(pdf, MARGIN + 10, 805)

    pdf.setFillColor(TEXT)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(MARGIN + 30, 807, "SMART EGG")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawString(MARGIN + 30, 796, "SISTEMA IOT DE INCUBACIÓN")
    pdf.setStrokeColor(GRID)
    pdf.line(MARGIN, 788, PAGE_W - MARGIN, 788)


def _draw_egg_mark(pdf: canvas.Canvas, x: float, y: float) -> None:
    pdf.saveState()
    pdf.setFillColor(TEXT)
    pdf.setStrokeColor(TEXT)
    path = pdf.beginPath()
    path.moveTo(x, y + 11)
    path.curveTo(x - 9, y + 2, x - 9, y - 10, x, y - 11)
    path.curveTo(x + 9, y - 10, x + 9, y + 2, x, y + 11)
    pdf.drawPath(path, fill=0, stroke=1)
    pdf.circle(x, y - 2, 2.2, fill=1, stroke=0)
    pdf.restoreState()


def _draw_metadata_strip(
    pdf: canvas.Canvas, *, y: float, values: list[tuple[str, str]]
) -> None:
    width = PAGE_W - MARGIN * 2
    item_w = width / len(values)
    pdf.setStrokeColor(GRID)
    pdf.setLineWidth(0.6)
    pdf.line(MARGIN, y + 54, MARGIN + width, y + 54)
    pdf.line(MARGIN, y, MARGIN + width, y)
    for index, (label, value) in enumerate(values):
        x = MARGIN + index * item_w
        if index:
            pdf.setStrokeColor(GRID)
            pdf.line(x, y + 10, x, y + 44)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 6)
        pdf.drawString(x + 12, y + 35, label)
        pdf.setFillColor(TEXT)
        pdf.setFont("Helvetica-Bold", 8.2)
        pdf.drawString(x + 12, y + 18, value)


def _draw_metric_cards(
    pdf: canvas.Canvas, *, y: float, metrics: list[tuple[str, str]]
) -> None:
    gap = 8
    width = (PAGE_W - MARGIN * 2 - gap * 3) / 4
    for index, (label, value) in enumerate(metrics):
        x = MARGIN + index * (width + gap)
        if index:
            pdf.setStrokeColor(GRID)
            pdf.setLineWidth(0.6)
            pdf.line(x - gap / 2, y + 6, x - gap / 2, y + 49)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 5.8)
        pdf.drawString(x + 6, y + 37, label)
        pdf.setFillColor(TEXT)
        pdf.setFont("Helvetica-Bold", 15)
        pdf.drawString(x + 6, y + 14, value)


def _draw_chart(
    pdf: canvas.Canvas,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    readings: list[TelemetryReading],
    timezone_name: str,
    temperature_range: tuple[float, float],
    humidity_range: tuple[float, float],
) -> None:
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(GRID)
    pdf.setLineWidth(0.6)
    pdf.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    pdf.setFillColor(TEXT)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 16, y + h - 21, "EVOLUCIÓN AMBIENTAL · 24 HORAS")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6)
    pdf.drawRightString(x + w - 16, y + h - 21, f"{len(readings)} MUESTRAS")

    plot_x, plot_w = x + 68, w - 86
    temp_y, hum_y, lane_h = y + 112, y + 40, 49
    _draw_plot_lane(
        pdf,
        plot_x=plot_x,
        plot_y=temp_y,
        plot_w=plot_w,
        plot_h=lane_h,
        label="TEMPERATURA",
        unit="°C",
        values=[(item.recorded_at, item.temperature_c) for item in readings],
        timezone_name=timezone_name,
        safe_range=temperature_range,
        color=CHART_TEMPERATURE,
    )
    _draw_plot_lane(
        pdf,
        plot_x=plot_x,
        plot_y=hum_y,
        plot_w=plot_w,
        plot_h=lane_h,
        label="HUMEDAD",
        unit="%",
        values=[(item.recorded_at, item.humidity_pct) for item in readings],
        timezone_name=timezone_name,
        safe_range=humidity_range,
        color=CHART_HUMIDITY,
    )
    for hour in (0, 6, 12, 18, 24):
        tx = plot_x + plot_w * (hour / 24)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 5.5)
        label = "23:59" if hour == 24 else f"{hour:02d}:00"
        pdf.drawCentredString(tx, y + 22, label)


def _draw_plot_lane(
    pdf: canvas.Canvas,
    *,
    plot_x: float,
    plot_y: float,
    plot_w: float,
    plot_h: float,
    label: str,
    unit: str,
    values: list[tuple[datetime, float]],
    timezone_name: str,
    safe_range: tuple[float, float],
    color: colors.Color,
) -> None:
    raw_values = [value for _, value in values]
    domain_low = min(raw_values + [safe_range[0]]) if raw_values else safe_range[0]
    domain_high = max(raw_values + [safe_range[1]]) if raw_values else safe_range[1]
    padding = max((domain_high - domain_low) * 0.16, 0.5)
    domain_low -= padding
    domain_high += padding

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 5.6)
    pdf.drawString(plot_x - 53, plot_y + plot_h - 8, label)
    current = f"{raw_values[-1]:.1f}{unit}" if raw_values else "SIN DATOS"
    pdf.setFillColor(color if raw_values else MUTED)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(plot_x - 53, plot_y + 13, current)

    def scaled_y(value: float) -> float:
        ratio = (value - domain_low) / (domain_high - domain_low)
        return plot_y + max(0.0, min(1.0, ratio)) * plot_h

    safe_bottom = scaled_y(safe_range[0])
    safe_top = scaled_y(safe_range[1])
    pdf.saveState()
    pdf.setFillColor(PANEL_ALT)
    pdf.rect(plot_x, safe_bottom, plot_w, safe_top - safe_bottom, fill=1, stroke=0)
    pdf.restoreState()

    pdf.setStrokeColor(GRID)
    pdf.setLineWidth(0.35)
    for fraction in (0, 0.25, 0.5, 0.75, 1):
        gx = plot_x + plot_w * fraction
        pdf.line(gx, plot_y, gx, plot_y + plot_h)
    for fraction in (0, 0.5, 1):
        gy = plot_y + plot_h * fraction
        pdf.line(plot_x, gy, plot_x + plot_w, gy)

    if not values:
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 6)
        pdf.drawCentredString(
            plot_x + plot_w / 2, plot_y + plot_h / 2 - 2, "SIN TELEMETRÍA REGISTRADA"
        )
        return

    local_zone = ZoneInfo(timezone_name)
    selected = _downsample(values, 180)
    path = pdf.beginPath()
    for index, (recorded_at, value) in enumerate(selected):
        local_time = _aware(recorded_at).astimezone(local_zone)
        seconds = local_time.hour * 3600 + local_time.minute * 60 + local_time.second
        px = plot_x + plot_w * (seconds / 86399)
        py = scaled_y(value)
        if index == 0:
            path.moveTo(px, py)
        else:
            path.lineTo(px, py)
    pdf.setStrokeColor(color)
    pdf.setLineWidth(1.3)
    pdf.drawPath(path, fill=0, stroke=1)
    last_time, last_value = selected[-1]
    last_local = _aware(last_time).astimezone(local_zone)
    last_seconds = last_local.hour * 3600 + last_local.minute * 60 + last_local.second
    last_x = plot_x + plot_w * (last_seconds / 86399)
    pdf.setFillColor(color)
    pdf.circle(last_x, scaled_y(last_value), 2.1, fill=1, stroke=0)


def _draw_lots_panel(
    pdf: canvas.Canvas,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    lots: list,
    capacity: int,
) -> None:
    _panel_title(pdf, x, y, w, h, "LOTES ACTIVOS", f"CAPACIDAD {capacity}")
    columns = [x + 14, x + 83, x + 147, x + w - 14]
    headers = ["LOTE", "ESPECIE", "INICIO", "HUEVOS"]
    for idx, header in enumerate(headers):
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 5.5)
        if idx == 3:
            pdf.drawRightString(columns[idx], y + h - 48, header)
        else:
            pdf.drawString(columns[idx], y + h - 48, header)
    pdf.setStrokeColor(GRID)
    pdf.line(x + 14, y + h - 55, x + w - 14, y + h - 55)

    if not lots:
        _empty_panel(pdf, x, y, w, "SIN LOTES ACTIVOS")
        return
    for index, lot in enumerate(lots[:4]):
        row_y = y + h - 78 - index * 31
        if index % 2:
            pdf.setFillColor(PANEL_ALT)
            pdf.rect(x + 9, row_y - 9, w - 18, 25, fill=1, stroke=0)
        values = [lot[0], lot[1], lot[2].strftime("%d/%m/%y"), str(lot[3])]
        for col, value in enumerate(values):
            pdf.setFillColor(TEXT if col in (0, 3) else MUTED)
            pdf.setFont("Helvetica-Bold" if col in (0, 3) else "Helvetica", 6.4)
            if col == 3:
                pdf.drawRightString(columns[col], row_y, _ellipsize(value, 11))
            else:
                pdf.drawString(
                    columns[col], row_y, _ellipsize(value, 10 if col != 1 else 9)
                )
    if len(lots) > 4:
        _more_rows(pdf, x, y, w, len(lots) - 4)


def _draw_alarms_panel(
    pdf: canvas.Canvas,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    alarms: list[Alarm],
    timezone_name: str,
) -> None:
    active = sum(1 for alarm in alarms if alarm.resolved_at is None)
    _panel_title(pdf, x, y, w, h, "REGISTRO DE ALERTAS", f"{active} ACTIVAS")
    if not alarms:
        pdf.setStrokeColor(TEXT)
        pdf.setLineWidth(0.8)
        pdf.circle(x + w / 2, y + 105, 4, fill=0, stroke=1)
        pdf.setFillColor(TEXT)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawCentredString(x + w / 2, y + 83, "OPERACIÓN ESTABLE")
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 6)
        pdf.drawCentredString(x + w / 2, y + 68, "No se registraron alertas este día")
        return
    for index, alarm in enumerate(alarms[-5:][::-1]):
        row_y = y + h - 62 - index * 29
        pdf.setFillColor(TEXT)
        pdf.circle(x + 15, row_y + 1, 2.3, fill=1, stroke=0)
        pdf.setFillColor(TEXT)
        pdf.setFont("Helvetica-Bold", 6.2)
        pdf.drawString(x + 24, row_y + 4, _ellipsize(alarm.message, 34))
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 5.3)
        state = "RESUELTA" if alarm.resolved_at else "ACTIVA"
        pdf.drawString(
            x + 24, row_y - 6, f"{_time(alarm.occurred_at, timezone_name)}  ·  {state}"
        )
    if len(alarms) > 5:
        _more_rows(pdf, x, y, w, len(alarms) - 5)


def _panel_title(
    pdf: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, note: str
) -> None:
    pdf.setFillColor(PANEL)
    pdf.setStrokeColor(GRID)
    pdf.setLineWidth(0.6)
    pdf.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    pdf.setFillColor(TEXT)
    pdf.setFont("Helvetica-Bold", 7.3)
    pdf.drawString(x + 14, y + h - 23, title)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 5.5)
    pdf.drawRightString(x + w - 14, y + h - 23, note)


def _empty_panel(pdf: canvas.Canvas, x: float, y: float, w: float, text: str) -> None:
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6)
    pdf.drawCentredString(x + w / 2, y + 82, text)


def _more_rows(pdf: canvas.Canvas, x: float, y: float, w: float, count: int) -> None:
    pdf.setFillColor(TEXT)
    pdf.setFont("Helvetica-Bold", 5.5)
    pdf.drawCentredString(x + w / 2, y + 14, f"+ {count} REGISTROS EN ANEXO")


def _draw_appendix(
    pdf: canvas.Canvas,
    *,
    incubator: Incubator,
    technician: Technician,
    day: date,
    timezone_name: str,
    lots: list,
    alarms: list[Alarm],
) -> None:
    rows: list[tuple[str, str, str, str]] = []
    for lot in lots:
        rows.append(("LOTE", lot[0], lot[1], f"{lot[2].isoformat()} · {lot[3]} huevos"))
    for alarm in alarms:
        state = "Resuelta" if alarm.resolved_at else "Activa"
        rows.append(
            (
                "ALERTA",
                _time(alarm.occurred_at, timezone_name),
                alarm.severity.upper(),
                f"{alarm.message} · {state}",
            )
        )

    page = 2
    for offset in range(0, len(rows), 24):
        pdf.showPage()
        _page_background(pdf)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 6)
        pdf.drawString(MARGIN, 804, "SMART EGG / ANEXO DE REGISTROS")
        pdf.setFillColor(TEXT)
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(MARGIN, 770, "DETALLE DEL DÍA")
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 7)
        pdf.drawString(MARGIN, 752, f"{incubator.code}  ·  {day.isoformat()}")
        pdf.setStrokeColor(GRID)
        pdf.line(MARGIN, 739, PAGE_W - MARGIN, 739)

        headings = ["TIPO", "HORA / CÓDIGO", "NIVEL / ESPECIE", "DETALLE"]
        col_x = [MARGIN + 8, MARGIN + 65, MARGIN + 148, MARGIN + 245]
        pdf.setFillColor(PANEL_ALT)
        pdf.rect(MARGIN, 710, PAGE_W - MARGIN * 2, 24, fill=1, stroke=0)
        for x, heading in zip(col_x, headings, strict=True):
            pdf.setFillColor(TEXT)
            pdf.setFont("Helvetica-Bold", 5.5)
            pdf.drawString(x, 719, heading)
        for index, row in enumerate(rows[offset : offset + 24]):
            row_y = 690 - index * 25
            if index % 2:
                pdf.setFillColor(PANEL)
                pdf.rect(MARGIN, row_y - 8, PAGE_W - MARGIN * 2, 22, fill=1, stroke=0)
            limits = [8, 15, 18, 51]
            for x, value, limit in zip(col_x, row, limits, strict=True):
                pdf.setFillColor(TEXT if x == col_x[0] else MUTED)
                pdf.setFont("Helvetica-Bold" if x == col_x[0] else "Helvetica", 5.8)
                pdf.drawString(x, row_y, _ellipsize(str(value), limit))
        _draw_footer(pdf, technician, page=page)
        page += 1


def _draw_footer(pdf: canvas.Canvas, technician: Technician, *, page: int) -> None:
    pdf.setStrokeColor(GRID)
    pdf.line(MARGIN, 78, PAGE_W - MARGIN, 78)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 5.5)
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    pdf.drawString(
        MARGIN,
        61,
        f"GENERADO POR {technician.full_name.upper()} · {generated_at}",
    )
    pdf.drawRightString(PAGE_W - MARGIN, 61, f"SMART EGG · PÁGINA {page}")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 5)
    pdf.drawString(
        MARGIN, 45, "Facultad de Ingeniería · Universidad de San Carlos de Guatemala"
    )


def _status_chip(pdf: canvas.Canvas, x: float, y: float, text: str) -> None:
    pdf.saveState()
    pdf.setFillColor(TEXT)
    pdf.circle(x + 22, y + 9, 1.7, fill=1, stroke=0)
    pdf.setFont("Helvetica-Bold", 5.8)
    pdf.drawString(x + 29, y + 7, text)
    pdf.restoreState()


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
