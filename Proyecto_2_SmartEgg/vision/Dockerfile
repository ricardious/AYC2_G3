FROM python:3.12-slim-trixie

COPY --from=ghcr.io/astral-sh/uv:0.12.9 /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    PATH="/app/.venv/bin:$PATH" \
    VISION_MODEL_PATH=/app/modelo/smartegg_vision.onnx

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project

COPY vision_service.py ./

# El modelo se monta desde ml/vision/modelo (ver docker-compose.yml), así un
# reentrenamiento no obliga a reconstruir la imagen.
CMD ["python", "vision_service.py"]
