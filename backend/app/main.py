"""FastAPI application. Snapshot load happens at startup; requests do not call Elexon."""

import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.app.api.routes import router
from backend.app.config import Settings, get_settings
from backend.app.log_config import configure_logging
from backend.app.snapshot.store import SNAPSHOT_ERROR, SnapshotError, SnapshotStore

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    configure_logging()
    settings = settings or get_settings()
    app = FastAPI(title="Northline", version="1.0.0")
    app.state.settings = settings
    app.state.store = None
    app.state.store_error = SNAPSHOT_ERROR
    try:
        app.state.store = SnapshotStore.load(settings)
    except SnapshotError:
        logger.exception("snapshot load failed")
    app.include_router(router)

    @app.middleware("http")
    async def log_request(request, call_next):
        request_id = uuid.uuid4().hex[:12]
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.info(
            "%s %s",
            request.method,
            request.url.path,
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        response.headers["X-Request-Id"] = request_id
        return response

    static_dir = _static_dir(settings)
    if static_dir is not None:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="desk")
    return app


def _static_dir(settings: Settings) -> Path | None:
    candidate = settings.static_path
    if candidate is None:
        bundled = Path(__file__).resolve().parent / "static"
        candidate = bundled if bundled.exists() else None
    if candidate is None or not (candidate / "index.html").is_file():
        return None
    return candidate


app = create_app()
