from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Alarm,
    Egg,
    Incubator,
    Lot,
    RotationEvent,
    Technician,
    TelemetryReading,
)


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
) -> bytes:
    start, end = _day_bounds(day, timezone_name)
    stats = db.execute(
        select(
            func.count(TelemetryReading.id),
            func.min(TelemetryReading.temperature_c),
            func.max(TelemetryReading.temperature_c),
            func.avg(TelemetryReading.temperature_c),
            func.min(TelemetryReading.humidity_pct),
            func.max(TelemetryReading.humidity_pct),
            func.avg(TelemetryReading.humidity_pct),
        ).where(
            TelemetryReading.incubator_id == incubator.id,
            TelemetryReading.recorded_at >= start,
            TelemetryReading.recorded_at < end,
        )
    ).one()
    lots = db.execute(
        select(Lot.code, Lot.species, Lot.started_on, func.count(Egg.id))
        .join(Egg, Egg.lot_id == Lot.id)
        .where(
            Egg.incubator_id == incubator.id,
            Lot.status == "active",
            Egg.status == "incubating",
        )
        .group_by(Lot.id)
        .order_by(Lot.code)
    ).all()
    alarms = db.scalars(
        select(Alarm)
        .where(
            Alarm.incubator_id == incubator.id,
            Alarm.occurred_at >= start,
            Alarm.occurred_at < end,
        )
        .order_by(Alarm.occurred_at)
    ).all()
    rotations = (
        db.scalar(
            select(func.count(RotationEvent.id)).where(
                RotationEvent.incubator_id == incubator.id,
                RotationEvent.performed_at >= start,
                RotationEvent.performed_at < end,
            )
        )
        or 0
    )

    output = BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )
    styles = getSampleStyleSheet()
    lot_rows = [[r[0], r[1], r[2].isoformat(), r[3]] for r in lots] or [
        ["Sin lotes activos", "", "", ""]
    ]
    alarm_rows = [
        [
            _time(a.occurred_at, timezone_name),
            a.severity,
            a.message,
            "Resuelta" if a.resolved_at else "Activa",
        ]
        for a in alarms
    ] or [["—", "—", "Sin alarmas", "—"]]
    story: list = []
    if logo_path and logo_path.is_file():
        story.append(Image(str(logo_path), width=28 * mm, height=28 * mm))
    story.extend(
        [
            Paragraph(
                "<b>SmartEgg — Informe diario de incubación</b>", styles["Title"]
            ),
            Paragraph(
                "Facultad de Ingeniería · Universidad de San Carlos de Guatemala",
                styles["Normal"],
            ),
            Spacer(1, 5 * mm),
            Table(
                [
                    ["Fecha", day.isoformat()],
                    ["Nodo", f"{incubator.code} — {incubator.name}"],
                    [
                        "Técnico autenticado",
                        f"{technician.full_name} ({technician.username})",
                    ],
                    [
                        "Ocupación",
                        f"{sum(row[3] for row in lots)} / {incubator.capacity}",
                    ],
                ],
                colWidths=[45 * mm, 115 * mm],
            ),
            Spacer(1, 5 * mm),
            Paragraph("<b>Resumen ambiental del día</b>", styles["Heading2"]),
            Table(
                [
                    [
                        "Muestras",
                        "Temp. mínima",
                        "Temp. máxima",
                        "Temp. promedio",
                        "Hum. mínima",
                        "Hum. máxima",
                        "Hum. promedio",
                    ],
                    [
                        stats[0],
                        _fmt(stats[1], " °C"),
                        _fmt(stats[2], " °C"),
                        _fmt(stats[3], " °C"),
                        _fmt(stats[4], " %"),
                        _fmt(stats[5], " %"),
                        _fmt(stats[6], " %"),
                    ],
                ],
                repeatRows=1,
            ),
            Spacer(1, 5 * mm),
            Paragraph("<b>Lotes activos</b>", styles["Heading2"]),
            Table([["Lote", "Especie", "Inicio", "Huevos"]] + lot_rows, repeatRows=1),
            Spacer(1, 5 * mm),
            Paragraph(f"<b>Rotaciones registradas:</b> {rotations}", styles["Normal"]),
            Spacer(1, 5 * mm),
            Paragraph("<b>Registro de alarmas</b>", styles["Heading2"]),
            Table(
                [["Hora", "Severidad", "Evento", "Estado"]] + alarm_rows, repeatRows=1
            ),
        ]
    )
    for item in story:
        if isinstance(item, Table):
            item.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#123047")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9fb3c2")),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("PADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
    doc.build(story)
    return output.getvalue()


def _fmt(value: float | None, suffix: str) -> str:
    return "Sin datos" if value is None else f"{value:.1f}{suffix}"


def _time(value: datetime, timezone_name: str) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(ZoneInfo(timezone_name)).strftime("%H:%M:%S")
