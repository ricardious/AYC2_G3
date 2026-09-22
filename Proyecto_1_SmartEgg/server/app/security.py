from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .database import get_db
from .models import AccessSession, Technician, TechnicianIncubator

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(
    request: Request,
    technician: Technician,
    access_session: AccessSession | None = None,
) -> tuple[str, int]:
    return create_access_token_for_settings(
        request.app.state.settings, technician, access_session
    )


def create_access_token_for_settings(
    settings: Settings,
    technician: Technician,
    access_session: AccessSession | None = None,
) -> tuple[str, int]:
    expires = timedelta(minutes=settings.access_token_minutes)
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": str(technician.id),
        "username": technician.username,
        "iat": now,
        "exp": now + expires,
    }
    if access_session is not None:
        claims["sid"] = access_session.id
        claims["jti"] = access_session.token_id
    token = jwt.encode(
        claims,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, int(expires.total_seconds())


def decode_token(request: Request, token: str) -> dict[str, object]:
    settings = request.app.state.settings
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        int(payload["sub"])
        return payload
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
    payload = decode_token(request, credentials.credentials)
    technician = resolve_token_technician(db, payload)
    technician._access_session_id = payload.get("sid")
    return technician


def require_roles(*roles: str) -> Callable[..., Technician]:
    def dependency(
        technician: Technician = Depends(get_current_technician),
    ) -> Technician:
        if technician.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this operation",
            )
        return technician

    return dependency


require_admin = require_roles("admin")
require_operator = require_roles("operator")


def technician_incubator_ids(db: Session, technician: Technician) -> list[int]:
    if technician.role == "admin":
        from .models import Incubator

        return list(db.scalars(select(Incubator.id).order_by(Incubator.id)))
    return list(
        db.scalars(
            select(TechnicianIncubator.incubator_id)
            .where(TechnicianIncubator.technician_id == technician.id)
            .order_by(TechnicianIncubator.incubator_id)
        )
    )


def ensure_incubator_access(
    db: Session, technician: Technician, incubator_id: int
) -> None:
    if technician.role == "admin":
        return
    assignment = db.get(TechnicianIncubator, (technician.id, incubator_id))
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Technician is not assigned to this incubator",
        )


def ensure_owner_or_admin(technician: Technician, owner_id: int | None) -> None:
    if technician.role != "admin" and owner_id != technician.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This resource belongs to another operator",
        )


def resolve_token_technician(db: Session, payload: dict[str, object]) -> Technician:
    technician = db.get(Technician, int(payload["sub"]))
    if technician is None or not technician.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive or unknown technician",
        )
    session_id = payload.get("sid")
    if session_id is not None:
        access_session = db.get(AccessSession, int(session_id))
        now = datetime.now(UTC)
        expires_at = access_session.expires_at if access_session is not None else None
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if (
            access_session is None
            or access_session.technician_id != technician.id
            or access_session.token_id != payload.get("jti")
            or access_session.ended_at is not None
            or expires_at is None
            or expires_at <= now
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Access session is no longer active",
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
