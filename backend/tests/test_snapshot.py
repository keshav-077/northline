"""Contract test against the retrieved January 2026 snapshot. Not a synthetic fixture."""

from datetime import date

import pytest

from backend.app.config import get_settings
from backend.app.snapshot.store import SNAPSHOT_ERROR, SnapshotError, SnapshotStore


def _load() -> SnapshotStore:
    try:
        return SnapshotStore.load(get_settings())
    except SnapshotError as exc:
        pytest.fail(f"{SNAPSHOT_ERROR}: {exc}")


def test_snapshot_covers_the_january_decision_window() -> None:
    store = _load()
    assert store.manifest["fuelhh_rows"] == 1488
    assert store.manifest["licence"].startswith("Contains BMRS data")
    evaluation = store.evaluation("09:20", "single_vintage")
    assert evaluation.summary.n_expected == 31 * 24
    assert evaluation.summary.n_scored == 31 * 24
    assert evaluation.summary.n_missing == 0
    assert evaluation.summary.mae_mw == "2038.91"
    assert evaluation.summary.rmse_mw == "2504.76"
    assert evaluation.summary.bias_mw == "1747.89"
    assert evaluation.summary.wape == "0.1807"
    hour = next(
        row
        for row in evaluation.hours
        if row.decision_date == date(2026, 1, 14) and row.delivery_start_utc == "2026-01-15T00:00:00Z"
    )
    assert hour.vintage_utc == "2026-01-14T07:30:00Z"
    assert hour.forecast_mw == 15834
    assert hour.actual_half_hours_mw == [14602, 14311]
    assert hour.actual_hour_mw == "14456.5"
    assert hour.error_mw == "1377.5"
    assert hour.status == "scored"
    for row in evaluation.hours:
        assert row.vintage_utc is not None
        assert row.vintage_utc <= row.cutoff_utc
        assert not row.vintage_utc.endswith("T09:30:00Z")
    day = next(item for item in evaluation.days if item.decision_date == date(2026, 1, 14))
    assert day.metrics.mae_mw == "1041.83"
    assert day.metrics.bias_mw == "1041.83"
    assert day.metrics.rmse_mw == "1149.26"
    later = store.evaluation("09:50", "single_vintage")
    later_hour = next(
        row
        for row in later.hours
        if row.decision_date == date(2026, 1, 14) and row.delivery_start_utc == "2026-01-15T00:00:00Z"
    )
    assert later_hour.vintage_utc == "2026-01-14T09:30:00Z"
    same_hour = next(
        row
        for row in store.evaluation("09:20", "latest_interval").hours
        if row.decision_date == date(2026, 1, 14) and row.delivery_start_utc == "2026-01-15T00:00:00Z"
    )
    assert same_hour.vintage_utc == hour.vintage_utc
    assert same_hour.forecast_mw == hour.forecast_mw
