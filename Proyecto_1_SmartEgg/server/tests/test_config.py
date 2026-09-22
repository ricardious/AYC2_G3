from app.config import Settings


def test_neon_postgres_url_selects_psycopg_driver() -> None:
    settings = Settings(
        database_url="postgresql://user:password@example.neon.tech/neondb?sslmode=require"
    )

    assert settings.database_url.startswith("postgresql+psycopg://")
    assert settings.database_url.endswith("?sslmode=require")


def test_explicit_sqlalchemy_driver_is_preserved() -> None:
    database_url = "postgresql+psycopg://user:password@database:5432/smartegg"

    assert Settings(database_url=database_url).database_url == database_url
