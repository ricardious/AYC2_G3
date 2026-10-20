from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incubator, ReportExport, Technician
from ..schemas import ReportExportRead
from ..security import ensure_incubator_access, get_current_technician
from ..services.reports import build_daily_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[ReportExportRead])
def list_report_exports(
    operator_id: int | None = None,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> list[ReportExport]:
    query = select(ReportExport)
    if technician.role != "admin":
        query = query.where(
            or_(
                ReportExport.generated_by_id == technician.id,
                ReportExport.subject_operator_id == technician.id,
            )
        )
    elif operator_id is not None:
        query = query.where(ReportExport.subject_operator_id == operator_id)
    return list(db.scalars(query.order_by(ReportExport.generated_at.desc()).limit(500)))


@router.get("/incubators/{incubator_id}/daily.pdf", response_class=StreamingResponse)
def daily_report(
    incubator_id: int,
    request: Request,
    day: date | None = None,
    operator_id: int | None = None,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> StreamingResponse:
    incubator = db.get(Incubator, incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    ensure_incubator_access(db, technician, incubator_id)
    if technician.role == "admin":
        subject_operator = db.get(Technician, operator_id) if operator_id else None
        if operator_id is not None and subject_operator is None:
            raise HTTPException(status_code=404, detail="Operator not found")
    else:
        if operator_id is not None and operator_id != technician.id:
            raise HTTPException(
                status_code=403, detail="Cannot export another operator's report"
            )
        subject_operator = technician
    settings = request.app.state.settings
    report_day = day or datetime.now(ZoneInfo(settings.timezone)).date()
    content = build_daily_report(
        db,
        incubator=incubator,
        technician=technician,
        day=report_day,
        logo_path=settings.report_logo_path,
        timezone_name=settings.timezone,
        subject_operator=subject_operator,
    )
    db.add(
        ReportExport(
            incubator_id=incubator.id,
            generated_by_id=technician.id,
            subject_operator_id=subject_operator.id if subject_operator else None,
            scope=(
                "global"
                if subject_operator is None
                else "personal"
                if subject_operator.id == technician.id
                else "operator"
            ),
            report_day=report_day,
        )
    )
    db.commit()
    filename = f"smartegg-{incubator.code}-{report_day.isoformat()}.pdf"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
