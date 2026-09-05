"""ASGI entrypoint used by FastAPI CLI and Uvicorn."""

from app.main import create_app

app = create_app()
