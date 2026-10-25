import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from backend.app.domain.evaluate import build_evaluation
from backend.app.domain.metrics import summarize
from backend.app.domain.models import ActualRecord, ForecastRecord

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "recorded_2026_01_15.json").read_text(encoding="utf-8"))


def utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _actual(hour: datetime, period: int, generation: int) -> ActualRecord:
    return ActualRecord(
        start_time=hour,
        settlement_date=date(2026, 1, 15),
        settlement_period=period,
        publish_time=hour + timedelta(minutes=30),
        generation_mw=generation,
    )


def test_recorded_day_metrics_match_the_hand_calculation() -> None:
    errors = [Decimal(row["forecast_mw"]) - Decimal(row["actual_hour_mw"]) for row in FIXTURE["series"]]
    actuals = [Decimal(row["actual_hour_mw"]) for row in FIXTURE["series"]]
    block = summarize(errors, actuals, n_expected=24, n_missing=0, n_excluded=0)
    assert block.mae_mw == FIXTURE["mae_mw"]
    assert block.bias_mw == FIXTURE["bias_mw"]
    assert block.rmse_mw == FIXTURE["rmse_mw"]
    assert block.n_scored == 24
    assert block.mae_mw == block.bias_mw


def test_hand_worked_examples() -> None:
    mixed = summarize(
        [Decimal(1), Decimal(-3)],
        [Decimal(10), Decimal(4)],
        n_expected=2,
        n_missing=0,
        n_excluded=0,
    )
    assert mixed.mae_mw == "2.00"
    assert mixed.bias_mw == "-1.00"
    assert mixed.rmse_mw == "2.24"
    empty = summarize([], [], n_expected=24, n_missing=24, n_excluded=0)
    assert empty.mae_mw is None
    assert empty.n_scored == 0
    zeros = summarize(
        [Decimal(0), Decimal(0)],
        [Decimal(0), Decimal(0)],
        n_expected=2,
        n_missing=0,
        n_excluded=0,
    )
    assert zeros.mae_mw == "0.00"
    assert zeros.wape is None
    median = summarize(
        [Decimal(i) for i in range(1, 6)],
        [Decimal(10)] * 5,
        n_expected=5,
        n_missing=0,
        n_excluded=0,
    )
    assert median.error_p50_mw == "3.00"


def test_recorded_hour_rejects_the_0930_file_at_0920() -> None:
    hour = utc("2026-01-15T00:00:00Z")
    half = FIXTURE["hour_00"]
    forecasts = [
        ForecastRecord(publish_time=utc(FIXTURE["vintage_utc"]), start_time=hour, generation_mw=half["forecast_mw"]),
        ForecastRecord(
            publish_time=utc(FIXTURE["excluded_vintage_utc"]),
            start_time=hour,
            generation_mw=half["excluded_forecast_mw"],
        ),
    ]
    actuals = [
        _actual(hour, 1, half["actual_half_hours_mw"][0]),
        _actual(hour + timedelta(minutes=30), 2, half["actual_half_hours_mw"][1]),
    ]
    early = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    scored = [row for row in early.hours if row.status == "scored"]
    assert len(scored) == 1
    assert scored[0].vintage_utc == "2026-01-14T07:30:00Z"
    assert scored[0].forecast_mw == 15834
    assert scored[0].actual_half_hours_mw == [14602, 14311]
    assert scored[0].actual_hour_mw == "14456.5"
    assert scored[0].error_mw == "1377.5"
    assert scored[0].lead_time_hours == "16.5"
    assert early.days[0].next_excluded_publish_utc == "2026-01-14T09:30:00Z"
    assert early.summary.mae_mw == "1377.50"

    later = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:50",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    chosen = next(row for row in later.hours if row.status == "scored")
    assert chosen.vintage_utc == "2026-01-14T09:30:00Z"
    assert chosen.forecast_mw == 15828
    assert chosen.error_mw == "1371.5"


def test_single_vintage_does_not_backfill_a_missing_hour() -> None:
    day = date(2026, 1, 14)
    hour0 = utc("2026-01-15T00:00:00Z")
    hour1 = utc("2026-01-15T01:00:00Z")
    forecasts = [
        ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour0, generation_mw=10),
        ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour1, generation_mw=10),
        ForecastRecord(publish_time=utc("2026-01-14T09:00:00Z"), start_time=hour0, generation_mw=50),
    ]
    actuals = [
        _actual(hour0, 1, 10),
        _actual(hour0 + timedelta(minutes=30), 2, 10),
        _actual(hour1, 3, 10),
        _actual(hour1 + timedelta(minutes=30), 4, 10),
    ]
    common = dict(decision_from=day, decision_to=day, cutoff="09:50", sanity_bound_mw=50_000)
    vintage = build_evaluation(forecasts, actuals, strategy="single_vintage", **common)
    by_hour = {row.delivery_start_utc: row for row in vintage.hours}
    assert by_hour["2026-01-15T00:00:00Z"].forecast_mw == 50
    assert by_hour["2026-01-15T01:00:00Z"].status == "missing"
    mixed = build_evaluation(forecasts, actuals, strategy="latest_interval", **common)
    mixed_hours = {row.delivery_start_utc: row for row in mixed.hours}
    assert mixed_hours["2026-01-15T00:00:00Z"].forecast_mw == 50
    assert mixed_hours["2026-01-15T01:00:00Z"].forecast_mw == 10
    assert mixed_hours["2026-01-15T01:00:00Z"].vintage_utc == "2026-01-14T07:30:00Z"
    assert mixed.days[0].vintages_mixed is True


def test_conflicting_duplicate_is_excluded_and_metrics_stay_null() -> None:
    hour = utc("2026-01-15T00:00:00Z")
    forecasts = [
        ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour, generation_mw=10),
        ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour, generation_mw=12),
    ]
    actuals = [_actual(hour, 1, 10), _actual(hour + timedelta(minutes=30), 2, 10)]
    result = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    assert result.hours[0].status == "conflicting_duplicate"
    assert result.summary.mae_mw is None
    assert result.summary.n_excluded == 1


def test_no_eligible_forecast_is_missing_not_zero_error() -> None:
    hour = utc("2026-01-15T00:00:00Z")
    forecasts = [ForecastRecord(publish_time=utc("2026-01-15T07:30:00Z"), start_time=hour, generation_mw=10)]
    actuals = [_actual(hour, 1, 0), _actual(hour + timedelta(minutes=30), 2, 0)]
    result = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    assert all(row.status == "missing" for row in result.hours)
    assert result.summary.mae_mw is None
    assert result.summary.bias_mw is None


def test_negative_generation_is_implausible_and_zero_is_valid() -> None:
    hour = utc("2026-01-15T00:00:00Z")
    forecasts = [ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour, generation_mw=-5)]
    actuals = [_actual(hour, 1, 0), _actual(hour + timedelta(minutes=30), 2, 0)]
    result = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    assert result.hours[0].status == "implausible"
    forecasts[0] = ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour, generation_mw=0)
    valid = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    assert valid.hours[0].status == "scored"
    assert valid.hours[0].error_mw == "0.0"


def test_february_delivery_uses_the_january_decision_file() -> None:
    hour = utc("2026-02-01T00:00:00Z")
    forecasts = [
        ForecastRecord(publish_time=utc("2026-01-31T07:30:00Z"), start_time=hour, generation_mw=20),
        ForecastRecord(publish_time=utc("2026-02-01T07:30:00Z"), start_time=hour, generation_mw=80),
    ]
    actuals = [
        ActualRecord(
            start_time=hour,
            settlement_date=date(2026, 2, 1),
            settlement_period=1,
            publish_time=hour,
            generation_mw=10,
        ),
        ActualRecord(
            start_time=hour + timedelta(minutes=30),
            settlement_date=date(2026, 2, 1),
            settlement_period=2,
            publish_time=hour,
            generation_mw=10,
        ),
    ]
    result = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 31),
        decision_to=date(2026, 1, 31),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    scored = next(row for row in result.hours if row.delivery_start_utc == "2026-02-01T00:00:00Z")
    assert result.days[0].delivery_date == date(2026, 2, 1)
    assert scored.forecast_mw == 20
    assert scored.vintage_utc == "2026-01-31T07:30:00Z"


def test_half_hour_forecast_timestamp_does_not_score_the_hour() -> None:
    hour = utc("2026-01-15T00:00:00Z")
    forecasts = [
        ForecastRecord(publish_time=utc("2026-01-14T07:30:00Z"), start_time=hour + timedelta(minutes=30), generation_mw=99)
    ]
    actuals = [_actual(hour, 1, 10), _actual(hour + timedelta(minutes=30), 2, 10)]
    result = build_evaluation(
        forecasts,
        actuals,
        decision_from=date(2026, 1, 14),
        decision_to=date(2026, 1, 14),
        cutoff="09:20",
        strategy="single_vintage",
        sanity_bound_mw=50_000,
    )
    assert result.hours[0].status == "missing"
    assert result.hours[0].forecast_mw is None
