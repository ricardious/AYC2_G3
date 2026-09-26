from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incubator, Technician, TechnicianIncubator
from ..schemas import (
    AdminStatus,
    LoginRequest,
    TechnicianAssignments,
    TechnicianCreate,
    TechnicianRead,
    TechnicianUpdate,
    TechnicianWithAssignments,
    Token,
)
from ..security import (
    authenticate,
    create_access_token,
    get_current_technician,
    hash_password,
    require_admin,
    technician_incubator_ids,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/bootstrap", response_model=TechnicianRead, status_code=status.HTTP_201_CREATED
)
def bootstrap_technician(
    payload: TechnicianCreate, db: Session = Depends(get_db)
) -> Technician:
    """Create the first technician. Disabled permanently once one account exists."""
    if db.scalar(select(func.count(Technician.id))):
        raise HTTPException(status_code=409, detail="Bootstrap already completed")
    bootstrap_role = "admin" if "role" not in payload.model_fields_set else payload.role
    if bootstrap_role != "admin":
        raise HTTPException(
            status_code=422, detail="The bootstrap account must have the admin role"
        )
    technician = Technician(
        username=payload.username.lower(),
        full_name=payload.full_name.strip(),
        age=payload.age,
        gender=payload.gender.strip() if payload.gender else None,
        role=bootstrap_role,
        rfid_uid=payload.rfid_uid,
        password_hash=hash_password(payload.password),
    )
    db.add(technician)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from exc
    db.refresh(technician)
    return technician


@router.post("/login", response_model=Token)
def login(
    payload: LoginRequest, request: Request, db: Session = Depends(get_db)
) -> Token:
    technician = authenticate(db, payload.username.lower(), payload.password)
    if technician is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token, expires_in = create_access_token(request, technician)
    return Token(
        access_token=token,
        expires_in=expires_in,
        technician=TechnicianRead.model_validate(technician),
    )


@router.get("/me", response_model=TechnicianRead)
def me(technician: Technician = Depends(get_current_technician)) -> Technician:
    return technician


@router.get("/admin-status", response_model=AdminStatus)
def admin_status(
    db: Session = Depends(get_db),
    _current: Technician = Depends(get_current_technician),
) -> AdminStatus:
    return AdminStatus(
        exists=bool(
            db.scalar(
                select(func.count(Technician.id)).where(Technician.role == "admin")
            )
        )
    )


@router.post(
    "/technicians", response_model=TechnicianRead, status_code=status.HTTP_201_CREATED
)
def create_technician(
    payload: TechnicianCreate,
    db: Session = Depends(get_db),
    current: Technician = Depends(get_current_technician),
) -> Technician:
    """Create an additional technician after the one-time bootstrap."""
    admin_exists = bool(
        db.scalar(select(func.count(Technician.id)).where(Technician.role == "admin"))
    )
    recovery_creation = not admin_exists and payload.role == "admin"
    if current.role != "admin" and not recovery_creation:
        raise HTTPException(status_code=403, detail="Administrator role required")
    technician = Technician(
        username=payload.username.lower(),
        full_name=payload.full_name.strip(),
        age=payload.age,
        gender=payload.gender.strip() if payload.gender else None,
        role=payload.role,
        rfid_uid=payload.rfid_uid,
        password_hash=hash_password(payload.password),
    )
    db.add(technician)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Username or RFID UID already exists"
        ) from exc
    db.refresh(technician)
    return technician


def technician_view(db: Session, technician: Technician) -> TechnicianWithAssignments:
    return TechnicianWithAssignments(
        **TechnicianRead.model_validate(technician).model_dump(),
        incubator_ids=technician_incubator_ids(db, technician),
    )


@router.get("/technicians", response_model=list[TechnicianWithAssignments])
def list_technicians(
    db: Session = Depends(get_db),
    _admin: Technician = Depends(require_admin),
) -> list[TechnicianWithAssignments]:
    technicians = db.scalars(
        select(Technician).order_by(Technician.role, Technician.id)
    )
    return [technician_view(db, technician) for technician in technicians]


@router.patch("/technicians/{technician_id}", response_model=TechnicianWithAssignments)
def update_technician(
    technician_id: int,
    payload: TechnicianUpdate,
    db: Session = Depends(get_db),
    admin: Technician = Depends(require_admin),
) -> TechnicianWithAssignments:
    technician = db.get(Technician, technician_id)
    if technician is None:
        raise HTTPException(status_code=404, detail="Technician not found")
    changes = payload.model_dump(exclude_unset=True)
    if technician.id == admin.id and changes.get("is_active") is False:
        raise HTTPException(
            status_code=409, detail="Administrators cannot deactivate themselves"
        )
    for key, value in changes.items():
        setattr(technician, key, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="RFID UID already exists") from exc
    db.refresh(technician)
    return technician_view(db, technician)


@router.put(
    "/technicians/{technician_id}/incubators",
    response_model=TechnicianWithAssignments,
)
def assign_incubators(
    technician_id: int,
    payload: TechnicianAssignments,
    db: Session = Depends(get_db),
    _admin: Technician = Depends(require_admin),
) -> TechnicianWithAssignments:
    technician = db.get(Technician, technician_id)
    if technician is None:
        raise HTTPException(status_code=404, detail="Technician not found")
    if technician.role == "admin" and payload.incubator_ids:
        raise HTTPException(
            status_code=422, detail="Administrators already have global access"
        )
    requested = set(payload.incubator_ids)
    existing = (
        set(db.scalars(select(Incubator.id).where(Incubator.id.in_(requested))))
        if requested
        else set()
    )
    missing = sorted(requested - existing)
    if missing:
        raise HTTPException(status_code=404, detail=f"Incubators not found: {missing}")
    current = {
        row.incubator_id: row
        for row in db.scalars(
            select(TechnicianIncubator).where(
                TechnicianIncubator.technician_id == technician_id
            )
        )
    }
    for incubator_id, assignment in current.items():
        if incubator_id not in requested:
            db.delete(assignment)
    for incubator_id in requested - set(current):
        db.add(
            TechnicianIncubator(technician_id=technician_id, incubator_id=incubator_id)
        )
    db.commit()
    db.refresh(technician)
    return technician_view(db, technician)
