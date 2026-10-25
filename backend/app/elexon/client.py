"""HTTP client for the Elexon Insights stream endpoints. No API key is required."""

from __future__ import annotations

import json
import random
import time
from collections.abc import Callable
from datetime import date, datetime

import httpx

from backend.app.config import Settings
from backend.app.domain.time import to_z

RETRYABLE = {429, 500, 502, 503, 504}


class ElexonError(Exception):
    pass


class ElexonClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        rng: random.Random | None = None,
        max_attempts: int = 3,
    ) -> None:
        headers = {"Accept": "application/json", "User-Agent": "northline-ingest"}
        if settings.elexon_api_key:
            headers["X-Api-Key"] = settings.elexon_api_key
        self._client = httpx.Client(
            base_url=settings.elexon_base_url.rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(20.0),
            transport=transport,
            follow_redirects=True,
        )
        self._sleep = sleep
        self._rng = rng or random.Random()
        self._max_attempts = max_attempts

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def fetch_windfor(self, publish_from: datetime, publish_to: datetime) -> list[dict]:
        return self._get(
            "/datasets/WINDFOR/stream",
            {"publishDateTimeFrom": to_z(publish_from), "publishDateTimeTo": to_z(publish_to)},
        )

    def fetch_fuelhh(self, settlement_from: date, settlement_to: date) -> list[dict]:
        return self._get(
            "/datasets/FUELHH/stream",
            {
                "settlementDateFrom": settlement_from.isoformat(),
                "settlementDateTo": settlement_to.isoformat(),
                "fuelType": "WIND",
            },
        )

    def _get(self, path: str, params: dict) -> list[dict]:
        last_error: Exception | None = None
        for attempt in range(self._max_attempts):
            try:
                response = self._client.get(path, params=params)
            except httpx.TimeoutException as exc:
                last_error = exc
                self._backoff(attempt)
                continue
            except httpx.TransportError as exc:
                last_error = exc
                self._backoff(attempt)
                continue
            if response.status_code == 400:
                raise ElexonError(f"bad request: {response.status_code}")
            if response.status_code in RETRYABLE:
                last_error = ElexonError(f"retryable status {response.status_code}")
                self._backoff(attempt)
                continue
            if response.status_code >= 400:
                raise ElexonError(f"request failed: {response.status_code}")
            try:
                payload = response.json()
            except json.JSONDecodeError as exc:
                raise ElexonError("malformed JSON") from exc
            if not isinstance(payload, list):
                raise ElexonError("stream endpoint did not return a JSON array")
            return payload
        raise ElexonError("retry exhaustion") from last_error

    def _backoff(self, attempt: int) -> None:
        if attempt >= self._max_attempts - 1:
            return
        delay = min(8.0, 0.5 * (2**attempt)) + self._rng.random() * 0.2
        self._sleep(delay)
