"""Vercel loads this module. The application itself lives in backend.app.main."""

from backend.app.main import app

__all__ = ["app"]
