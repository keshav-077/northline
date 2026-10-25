from datetime import date, timedelta

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.snapshot.store import save_snapshot


def _snapshot(directory) -> None:
    forecasts = [
        {
            "dataset": "WINDFOR",
            "generation": 100,
            "publishTime": "2026-01-14T07:30:00Z",
            "startTime": "2026-01-15T00:00:00Z",
        },
        {
            "dataset": "WINDFOR",
            "generation": 999,
            "publishTime": "2026-01-14T09:30:00Z",
            "startTime": "2026-01-15T00:00:00Z",
        },
    ]
    actuals = [
        {
            "dataset": "FUELHH",
            "fuelType": "WIND",
            "generation": 80,
            "publishTime": "2026-01-15T00:30:00Z",
            "settlementDate": "2026-01-15",
            "settlementPeriod": 1,
            "startTime": "2026-01-15T00:00:00Z",
        },
        {
            "dataset": "FUELHH",
            "fuelType": "WIND",
            "generation": 60,
            "publishTime": "2026-01-15T01:00:00Z",
            "settlementDate": "2026-01-15",
            "settlementPeriod": 2,
            "startTime": "2026-01-15T00:30:00Z",
        },
    ]
    save_snapshot(directory, forecasts, actuals, retrieved_at="2026-10-24T00:00:00Z", requests=["test"], notes=[])


def test_health_meta_and_evaluation_contract(tmp_path) -> None:
    _snapshot(tmp_path)
    settings = Settings(
        snapshot_path=tmp_path,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        static_dir=None,
    )
    client = TestClient(create_app(settings))
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["decision_from"] == "2026-01-14"
    assert health.json()["status"] == "ok"
    meta = client.get("/api/v1/meta")
    assert meta.status_code == 200
    body = meta.json()
    assert body["default_cutoff"] == "09:20"
    assert "hourly" in body["alignment_note"]
    assert "Elexon" in body["licence"]
    evaluation = client.get("/api/v1/evaluation", params={"cutoff": "09:20", "strategy": "single_vintage"})
    assert evaluation.status_code == 200
    payload = evaluation.json()
    scored = [row for row in payload["hours"] if row["status"] == "scored"]
    assert scored[0]["forecast_mw"] == 100
    assert scored[0]["actual_hour_mw"] == "70.0"
    assert scored[0]["error_mw"] == "30.0"
    assert scored[0]["vintage_utc"] == "2026-01-14T07:30:00Z"
    assert payload["summary"]["mae_mw"] == "30.00"
    assert payload["summary"]["n_scored"] == 1
    rejected = client.get("/api/v1/evaluation", params={"cutoff": "noon"})
    assert rejected.status_code == 400
    assert rejected.json()["detail"]["error"] == "invalid_query"


def test_missing_snapshot_is_unavailable(tmp_path) -> None:
    empty = tmp_path / "missing"
    empty.mkdir()
    settings = Settings(snapshot_path=empty, static_dir=None)
    client = TestClient(create_app(settings))
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["detail"]["error"] == "snapshot_unavailable"
    assert client.get("/api/v1/evaluation").status_code == 503


def test_decision_range_constant_is_january() -> None:
    assert date(2026, 1, 31) + timedelta(days=1) == date(2026, 2, 1)
