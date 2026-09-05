from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Technician
from ..schemas import LoginRequest, TechnicianCreate, TechnicianRead, Token
from ..security import (
    authenticate,
    create_access_token,
    get_current_technician,
    hash_password,
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
    technician = Technician(
        username=payload.username.lower(),
        full_name=payload.full_name.strip(),
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


@router.post(
    "/technicians", response_model=TechnicianRead, status_code=status.HTTP_201_CREATED
)
def create_technician(
    payload: TechnicianCreate,
    db: Session = Depends(get_db),
    _current: Technician = Depends(get_current_technician),
) -> Technician:
    """Create an additional technician after the one-time bootstrap."""
    technician = Technician(
        username=payload.username.lower(),
        full_name=payload.full_name.strip(),
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
