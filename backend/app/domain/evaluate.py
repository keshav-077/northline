"""Join a decision date to the forecast that was knowable at the cutoff, then score it."""

from datetime import datetime
from decimal import Decimal

from backend.app.config import STRATEGIES
from backend.app.domain.alignment import half_hours, index_actuals, is_implausible
from backend.app.domain.metrics import one_decimal, summarize
from backend.app.domain.models import (
    ActualRecord,
    DayResult,
    EvaluationResult,
    ForecastRecord,
    HourResult,
    HourStatus,
)
from backend.app.domain.selection import (
    forecast_for_hour,
    index_by_hour,
    index_forecasts,
    next_excluded_publish,
    single_vintage,
)
from backend.app.domain.time import cutoff_utc, delivery_date_for, delivery_hours, iter_dates, to_local_iso, to_z


def _lead_hours(vintage: datetime | None, hour: datetime) -> str | None:
    if vintage is None:
        return None
    delta = hour - vintage
    seconds = Decimal(delta.days) * Decimal(86400) + Decimal(delta.seconds) + (Decimal(delta.microseconds) / Decimal(1_000_000))
    return one_decimal(seconds / Decimal(3600))


def _hour_result(
    *,
    decision_date,
    delivery,
    cutoff: datetime,
    hour: datetime,
    chosen: ForecastRecord | None,
    first_half: ActualRecord | None,
    second_half: ActualRecord | None,
    bound: int,
) -> tuple[HourResult, Decimal | None, Decimal | None]:
    forecast_conflict = chosen is not None and chosen.conflict
    first_conflict = first_half is not None and first_half.conflict
    second_conflict = second_half is not None and second_half.conflict
    conflict = forecast_conflict or first_conflict or second_conflict
    forecast_mw = None if chosen is None or forecast_conflict else chosen.generation_mw
    halves: list[int | None] = [
        None if first_half is None or first_conflict else first_half.generation_mw,
        None if second_half is None or second_conflict else second_half.generation_mw,
    ]
    implausible = any(is_implausible(value, bound) for value in (forecast_mw, halves[0], halves[1]))
    both_actuals = halves[0] is not None and halves[1] is not None
    actual_hour = (Decimal(halves[0]) + Decimal(halves[1])) / Decimal(2) if both_actuals else None
    status: HourStatus
    error: Decimal | None = None
    if conflict:
        status = "conflicting_duplicate"
        actual_hour = None
    elif implausible:
        status = "implausible"
        actual_hour = None
    elif forecast_mw is None or actual_hour is None:
        status = "missing"
    else:
        status = "scored"
        error = Decimal(forecast_mw) - actual_hour
    vintage = None if chosen is None else chosen.publish_time
    return (
        HourResult(
            decision_date=decision_date,
            delivery_date=delivery,
            cutoff_utc=to_z(cutoff),
            vintage_utc=None if vintage is None else to_z(vintage),
            delivery_start_utc=to_z(hour),
            delivery_start_local=to_local_iso(hour),
            forecast_mw=forecast_mw,
            actual_half_hours_mw=halves,
            actual_hour_mw=None if actual_hour is None else one_decimal(actual_hour),
            error_mw=None if error is None else one_decimal(error),
            lead_time_hours=_lead_hours(vintage, hour),
            status=status,
        ),
        error,
        actual_hour if status == "scored" else None,
    )


def build_evaluation(
    forecasts: list[ForecastRecord],
    actuals: list[ActualRecord],
    *,
    decision_from,
    decision_to,
    cutoff: str,
    strategy: str,
    sanity_bound_mw: int,
) -> EvaluationResult:
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy: {strategy}")
    indexed_forecasts = index_forecasts(forecasts)
    by_hour = index_by_hour(indexed_forecasts)
    indexed_actuals = index_actuals(actuals)
    days: list[DayResult] = []
    hours: list[HourResult] = []
    all_errors: list[Decimal] = []
    all_actuals: list[Decimal] = []
    counts = {"expected": 0, "missing": 0, "excluded": 0}
    for decision_date in iter_dates(decision_from, decision_to):
        cutoff_at = cutoff_utc(decision_date, cutoff)
        delivery = delivery_date_for(decision_date)
        vintage = single_vintage(indexed_forecasts, cutoff_at)
        excluded = next_excluded_publish(indexed_forecasts, cutoff_at)
        day_hours = delivery_hours(delivery)
        day_errors: list[Decimal] = []
        day_actuals: list[Decimal] = []
        day_missing = 0
        day_excluded = 0
        vintages: set[str] = set()
        for hour in day_hours:
            chosen = forecast_for_hour(
                indexed_forecasts,
                hour=hour,
                cutoff=cutoff_at,
                strategy=strategy,
                vintage=vintage,
                by_hour=by_hour,
            )
            first_half, second_half = half_hours(indexed_actuals, hour)
            result, error, actual_hour = _hour_result(
                decision_date=decision_date,
                delivery=delivery,
                cutoff=cutoff_at,
                hour=hour,
                chosen=chosen,
                first_half=first_half,
                second_half=second_half,
                bound=sanity_bound_mw,
            )
            hours.append(result)
            if result.vintage_utc:
                vintages.add(result.vintage_utc)
            if result.status == "scored" and error is not None and actual_hour is not None:
                day_errors.append(error)
                day_actuals.append(actual_hour)
            elif result.status == "missing":
                day_missing += 1
            else:
                day_excluded += 1
        shown_vintage = vintage if strategy == "single_vintage" else None
        if strategy == "latest_interval" and len(vintages) == 1:
            shown_vintage = datetime.fromisoformat(next(iter(vintages)).replace("Z", "+00:00"))
        days.append(
            DayResult(
                decision_date=decision_date,
                delivery_date=delivery,
                vintage_utc=None if shown_vintage is None else to_z(shown_vintage),
                vintages_mixed=len(vintages) > 1,
                next_excluded_publish_utc=None if excluded is None else to_z(excluded),
                metrics=summarize(
                    day_errors,
                    day_actuals,
                    n_expected=len(day_hours),
                    n_missing=day_missing,
                    n_excluded=day_excluded,
                ),
            )
        )
        all_errors.extend(day_errors)
        all_actuals.extend(day_actuals)
        counts["expected"] += len(day_hours)
        counts["missing"] += day_missing
        counts["excluded"] += day_excluded
    return EvaluationResult(
        cutoff=cutoff,
        strategy=strategy,
        decision_from=decision_from,
        decision_to=decision_to,
        summary=summarize(
            all_errors,
            all_actuals,
            n_expected=counts["expected"],
            n_missing=counts["missing"],
            n_excluded=counts["excluded"],
        ),
        days=days,
        hours=hours,
    )

