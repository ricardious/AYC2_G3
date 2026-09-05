from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class InitialTechnician(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    full_name: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class InitialIncubator(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=100)
    capacity: int = Field(ge=1, le=1000)
    serial_number: str | None = Field(default=None, max_length=100)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="SMARTEGG_",
        extra="ignore",
    )

    app_name: str = "SmartEgg API"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///../db/smartegg.db"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    timezone: str = "America/Guatemala"
    initial_technicians: list[InitialTechnician] = Field(default_factory=list)
    initial_incubators: list[InitialIncubator] = Field(default_factory=list)

    serial_enabled: bool = False
    serial_port: str | None = None
    serial_baudrate: int = 115200
    serial_timeout_seconds: float = 1.0
    serial_reconnect_seconds: float = 3.0
    default_incubator_code: str = "NODE-01"

    report_logo_path: Path | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip().startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
