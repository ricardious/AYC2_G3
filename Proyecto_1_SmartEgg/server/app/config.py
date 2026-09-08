from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class InitialTechnician(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    full_name: str = Field(min_length=3, max_length=120)
    age: int | None = Field(default=None, ge=1, le=120)
    gender: str | None = Field(default=None, min_length=1, max_length=30)
    role: str = Field(default="operator_1", pattern=r"^(operator_1|operator_2|admin)$")
    rfid_uid: str | None = Field(default=None, min_length=8, max_length=29)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("rfid_uid")
    @classmethod
    def normalize_rfid_uid(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.replace(":", "").replace("-", "").replace(" ", "").upper()
        if len(normalized) not in {8, 14, 20} or any(
            character not in "0123456789ABCDEF" for character in normalized
        ):
            raise ValueError("rfid_uid must be a 4, 7 or 10-byte hexadecimal UID")
        return normalized


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
    database_url: str = "postgresql+psycopg://smartegg:smartegg@localhost:5432/smartegg"
    auto_create_schema: bool = False
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    device_api_key: str | None = None
    kiosk_api_key: str | None = None
    access_servo_unlock_degrees: int = Field(default=90, ge=0, le=180)
    access_servo_lock_degrees: int = Field(default=0, ge=0, le=180)
    timezone: str = "America/Guatemala"
    initial_technicians: list[InitialTechnician] = Field(default_factory=list)
    initial_incubators: list[InitialIncubator] = Field(default_factory=list)

    serial_enabled: bool = False
    serial_port: str | None = None
    serial_baudrate: int = 115200
    serial_timeout_seconds: float = 1.0
    serial_reconnect_seconds: float = 3.0
    default_incubator_code: str = "NODE-01"

    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = Field(default=1883, ge=1, le=65535)
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_client_id: str = "smartegg-backend"
    mqtt_keepalive_seconds: int = Field(default=60, ge=5, le=65535)
    mqtt_tls_enabled: bool = False
    mqtt_ca_cert: Path | None = None

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
