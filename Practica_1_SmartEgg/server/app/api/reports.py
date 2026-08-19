from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incubator, Technician
from ..security import get_current_technician
from ..services.reports import build_daily_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/incubators/{incubator_id}/daily.pdf", response_class=StreamingResponse)
def daily_report(
    incubator_id: int,
    request: Request,
    day: date | None = None,
    db: Session = Depends(get_db),
    technician: Technician = Depends(get_current_technician),
) -> StreamingResponse:
    incubator = db.get(Incubator, incubator_id)
    if incubator is None:
        raise HTTPException(status_code=404, detail="Incubator not found")
    settings = request.app.state.settings
    report_day = day or datetime.now(ZoneInfo(settings.timezone)).date()
    content = build_daily_report(
        db,
        incubator=incubator,
        technician=technician,
        day=report_day,
        logo_path=settings.report_logo_path,
        timezone_name=settings.timezone,
    )
    filename = f"smartegg-{incubator.code}-{report_day.isoformat()}.pdf"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
