from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AccessSession,
    Alarm,
    DoorEvent,
    Egg,
    Incubator,
    ReportExport,
    Technician,
    TelemetryReading,
)
from ..schemas import DiagnosticSummary
from ..security import get_current_technician, require_admin, technician_incubator_ids

router = APIRouter(tags=["profiles"])


def _range(
    from_at: datetime | None, to_at: datetime | None
) -> tuple[datetime, datetime]:
    end = to_at or datetime.now(UTC)
    start = from_at or end - timedelta(hours=24)
    if start >= end:
        raise HTTPException(status_code=422, detail="from_at must be before to_at")
    return start, end


def _diagnostic(
    db: Session,
    *,
    subject: Technician | None,
    from_at: datetime,
    to_at: datetime,
) -> DiagnosticSummary:
    if subject is None:
        incubator_ids = list(db.scalars(select(Incubator.id).order_by(Incubator.id)))
    else:
        incubator_ids = technician_incubator_ids(db, subject)

    telemetry = db.execute(
        select(
            func.count(TelemetryReading.id),
            func.min(TelemetryReading.temperature_c),
            func.max(TelemetryReading.temperature_c),
            func.avg(TelemetryReading.temperature_c),
            func.min(TelemetryReading.humidity_pct),
            func.max(TelemetryReading.humidity_pct),
            func.avg(TelemetryReading.humidity_pct),
        ).where(
            TelemetryReading.incubator_id.in_(incubator_ids),
            TelemetryReading.recorded_at >= from_at,
            TelemetryReading.recorded_at <= to_at,
        )
    ).one()

    session_filter = [
        AccessSession.started_at >= from_at,
        AccessSession.started_at <= to_at,
    ]
    door_filter = [DoorEvent.opened_at >= from_at, DoorEvent.opened_at <= to_at]
    egg_filter = [Egg.registered_at >= from_at, Egg.registered_at <= to_at]
    alarm_filter = [
        Alarm.acknowledged_at >= from_at,
        Alarm.acknowledged_at <= to_at,
    ]
    report_filter = [
        ReportExport.generated_at >= from_at,
        ReportExport.generated_at <= to_at,
    ]
    if subject is not None:
        session_filter.append(AccessSession.technician_id == subject.id)
        door_filter.append(DoorEvent.operator_id == subject.id)
        egg_filter.append(Egg.registered_by_id == subject.id)
        alarm_filter.append(Alarm.acknowledged_by_id == subject.id)
        report_filter.append(ReportExport.generated_by_id == subject.id)

    door = db.execute(
        select(
            func.count(DoorEvent.id),
            func.coalesce(func.sum(DoorEvent.eggs_added), 0),
            func.coalesce(func.sum(DoorEvent.eggs_removed), 0),
        ).where(*door_filter)
    ).one()

    def count(model_id, filters: list) -> int:
        return int(db.scalar(select(func.count(model_id)).where(*filters)) or 0)

    return DiagnosticSummary(
        operator_id=subject.id if subject else None,
        operator_name=subject.full_name if subject else "Vista general",
        role=subject.role if subject else "admin",
        from_at=from_at,
        to_at=to_at,
        incubator_ids=incubator_ids,
        telemetry_samples=int(telemetry[0] or 0),
        temperature_min_c=telemetry[1],
        temperature_max_c=telemetry[2],
        temperature_avg_c=float(telemetry[3]) if telemetry[3] is not None else None,
        humidity_min_pct=telemetry[4],
        humidity_max_pct=telemetry[5],
        humidity_avg_pct=float(telemetry[6]) if telemetry[6] is not None else None,
        access_sessions=count(AccessSession.id, session_filter),
        door_events=int(door[0] or 0),
        eggs_added=int(door[1] or 0),
        eggs_removed=int(door[2] or 0),
        registered_eggs=count(Egg.id, egg_filter),
        acknowledged_alarms=count(Alarm.id, alarm_filter),
        generated_reports=count(ReportExport.id, report_filter),
    )


@router.get("/me/diagnostics", response_model=DiagnosticSummary)
def my_diagnostics(
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> DiagnosticSummary:
    start, end = _range(from_at, to_at)
    return _diagnostic(db, subject=technician, from_at=start, to_at=end)


@router.get("/admin/diagnostics", response_model=DiagnosticSummary)
def admin_diagnostics(
    operator_id: int | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    db: Session = Depends(get_db),
    _admin: Technician = Depends(require_admin),
) -> DiagnosticSummary:
    subject = None
    if operator_id is not None:
        subject = db.get(Technician, operator_id)
        if subject is None:
            raise HTTPException(status_code=404, detail="Technician not found")
    start, end = _range(from_at, to_at)
    return _diagnostic(db, subject=subject, from_at=start, to_at=end)
