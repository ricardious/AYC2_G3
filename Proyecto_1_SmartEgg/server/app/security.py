from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Technician

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(request: Request, technician: Technician) -> tuple[str, int]:
    settings = request.app.state.settings
    expires = timedelta(minutes=settings.access_token_minutes)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(technician.id),
            "username": technician.username,
            "iat": now,
            "exp": now + expires,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, int(expires.total_seconds())


def decode_token(request: Request, token: str) -> int:
    settings = request.app.state.settings
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return int(payload["sub"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc


def get_current_technician(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Technician:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    technician = db.get(Technician, decode_token(request, credentials.credentials))
    if technician is None or not technician.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive or unknown technician",
        )
    return technician


def authenticate(db: Session, username: str, password: str) -> Technician | None:
    technician = db.scalar(select(Technician).where(Technician.username == username))
    if (
        technician is None
        or not technician.is_active
        or not verify_password(password, technician.password_hash)
    ):
        return None
    return technician
