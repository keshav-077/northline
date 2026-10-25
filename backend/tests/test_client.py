import random
from datetime import UTC, datetime

import httpx
import pytest

from backend.app.config import Settings
from backend.app.elexon.client import ElexonClient, ElexonError
from backend.app.elexon.ingest import IngestError, assert_known_window


def _client(handler, sleeps: list[float]) -> ElexonClient:
    return ElexonClient(
        Settings(),
        transport=httpx.MockTransport(handler),
        sleep=sleeps.append,
        rng=random.Random(0),
    )


def test_retry_then_success_and_bad_request_is_not_retried() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json=[])
        return httpx.Response(
            200,
            json=[
                {
                    "dataset": "WINDFOR",
                    "publishTime": "2026-01-14T07:30:00Z",
                    "startTime": "2026-01-15T00:00:00Z",
                    "generation": 10,
                }
            ],
        )

    sleeps: list[float] = []
    with _client(handler, sleeps) as client:
        rows = client.fetch_windfor(datetime(2026, 1, 14, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC))
    assert rows[0]["generation"] == 10
    assert calls["n"] == 2
    assert len(sleeps) == 1

    def bad_request(_request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"message": "no"})

    calls["n"] = 0
    sleeps.clear()
    with _client(bad_request, sleeps) as client:
        with pytest.raises(ElexonError, match="bad request"):
            client.fetch_windfor(datetime(2026, 1, 14, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC))
    assert calls["n"] == 1
    assert sleeps == []


def test_timeout_exhaustion_and_malformed_json() -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    sleeps: list[float] = []
    with _client(timeout, sleeps) as client:
        with pytest.raises(ElexonError, match="retry exhaustion"):
            client.fetch_fuelhh(datetime(2026, 1, 2).date(), datetime(2026, 2, 1).date())
    assert len(sleeps) == 2

    def malformed(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    with _client(malformed, []) as client:
        with pytest.raises(ElexonError, match="malformed JSON"):
            client.fetch_windfor(datetime(2026, 1, 14, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC))

    def wrapped(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": []})

    with _client(wrapped, []) as client:
        with pytest.raises(ElexonError, match="JSON array"):
            client.fetch_windfor(datetime(2026, 1, 14, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC))


def test_known_window_guard_rejects_a_short_extract() -> None:
    with pytest.raises(IngestError):
        assert_known_window([], [])
