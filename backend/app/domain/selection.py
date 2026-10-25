"""Forecast vintage selection. A publication after the cutoff is never eligible."""

from datetime import datetime

from backend.app.config import STRATEGIES
from backend.app.domain.models import ForecastRecord


def index_forecasts(records: list[ForecastRecord]) -> dict[tuple[datetime, datetime], ForecastRecord]:
    grouped: dict[tuple[datetime, datetime], list[ForecastRecord]] = {}
    for record in records:
        grouped.setdefault((record.publish_time, record.start_time), []).append(record)
    indexed: dict[tuple[datetime, datetime], ForecastRecord] = {}
    for key, rows in grouped.items():
        generations = {row.generation_mw for row in rows}
        if len(generations) == 1:
            indexed[key] = rows[0].model_copy(update={"conflict": False})
        else:
            indexed[key] = ForecastRecord(
                publish_time=key[0],
                start_time=key[1],
                generation_mw=None,
                conflict=True,
            )
    return indexed


def single_vintage(
    indexed: dict[tuple[datetime, datetime], ForecastRecord],
    cutoff: datetime,
) -> datetime | None:
    eligible = [publish for publish, _start in indexed if publish <= cutoff]
    if not eligible:
        return None
    return max(eligible)


def index_by_hour(
    indexed: dict[tuple[datetime, datetime], ForecastRecord],
) -> dict[datetime, list[ForecastRecord]]:
    grouped: dict[datetime, list[ForecastRecord]] = {}
    for record in indexed.values():
        grouped.setdefault(record.start_time, []).append(record)
    return grouped


def forecast_for_hour(
    indexed: dict[tuple[datetime, datetime], ForecastRecord],
    *,
    hour: datetime,
    cutoff: datetime,
    strategy: str,
    vintage: datetime | None,
    by_hour: dict[datetime, list[ForecastRecord]],
) -> ForecastRecord | None:
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy: {strategy}")
    if strategy == "single_vintage":
        if vintage is None:
            return None
        return indexed.get((vintage, hour))
    candidates = [record for record in by_hour.get(hour, []) if record.publish_time <= cutoff]
    if not candidates:
        return None
    latest = max(record.publish_time for record in candidates)
    return indexed[(latest, hour)]


def next_excluded_publish(
    indexed: dict[tuple[datetime, datetime], ForecastRecord],
    cutoff: datetime,
) -> datetime | None:
    later = [publish for publish, _start in indexed if publish > cutoff]
    if not later:
        return None
    return min(later)
