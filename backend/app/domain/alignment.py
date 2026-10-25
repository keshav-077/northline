"""Pair an hourly forecast with the two half-hour outturns inside that hour."""

from datetime import datetime, timedelta

from backend.app.domain.models import ActualRecord


def index_actuals(records: list[ActualRecord]) -> dict[datetime, ActualRecord]:
    grouped: dict[tuple, list[ActualRecord]] = {}
    for record in records:
        grouped.setdefault((record.settlement_date, record.settlement_period), []).append(record)
    by_start: dict[datetime, ActualRecord] = {}
    for rows in grouped.values():
        generations = {row.generation_mw for row in rows}
        starts = {row.start_time for row in rows}
        representative = rows[0]
        if len(starts) != 1 or len(generations) != 1:
            point = ActualRecord(
                start_time=representative.start_time,
                settlement_date=representative.settlement_date,
                settlement_period=representative.settlement_period,
                publish_time=max(row.publish_time for row in rows),
                generation_mw=None,
                conflict=True,
            )
        else:
            point = representative.model_copy(update={"conflict": False})
        existing = by_start.get(point.start_time)
        if existing is None:
            by_start[point.start_time] = point
            continue
        if existing.conflict or point.conflict or existing.generation_mw != point.generation_mw:
            by_start[point.start_time] = point.model_copy(update={"generation_mw": None, "conflict": True})
    return by_start


def half_hours(
    indexed: dict[datetime, ActualRecord],
    hour: datetime,
) -> tuple[ActualRecord | None, ActualRecord | None]:
    return indexed.get(hour), indexed.get(hour + timedelta(minutes=30))


def is_implausible(generation_mw: int | None, bound: int) -> bool:
    if generation_mw is None:
        return False
    return generation_mw < 0 or generation_mw > bound
