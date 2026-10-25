from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from backend.app.domain.time import LONDON, UTC, cutoff_utc, delivery_hours, ensure_utc, to_z


def test_january_cutoff_is_utc() -> None:
    assert cutoff_utc(date(2026, 1, 14), "09:20") == datetime(2026, 1, 14, 9, 20, tzinfo=UTC)
    assert cutoff_utc(date(2026, 1, 31), "15:30") == datetime(2026, 1, 31, 15, 30, tzinfo=UTC)


def test_summer_half_hour_converts_to_utc() -> None:
    local = datetime(2026, 7, 1, 1, 30, tzinfo=LONDON)
    assert local.astimezone(timezone.utc) == datetime(2026, 7, 1, 0, 30, tzinfo=timezone.utc)


def test_naive_timestamp_is_rejected() -> None:
    with pytest.raises(ValueError):
        ensure_utc(datetime(2026, 1, 15, 0, 0))


def test_january_delivery_hours_cross_midnight_in_utc() -> None:
    hours = delivery_hours(date(2026, 1, 15))
    assert len(hours) == 24
    assert to_z(hours[0]) == "2026-01-15T00:00:00Z"
    assert to_z(hours[-1]) == "2026-01-15T23:00:00Z"
    assert hours[0].astimezone(LONDON).hour == 0


def test_spring_forward_drops_the_missing_local_hour() -> None:
    hours = delivery_hours(date(2026, 3, 29))
    local_hours = [item.astimezone(ZoneInfo("Europe/London")).hour for item in hours]
    assert len(hours) == 23
    assert 1 not in local_hours
    assert local_hours[0] == 0
    assert local_hours[-1] == 23


def test_fall_back_keeps_both_repeated_hours() -> None:
    hours = delivery_hours(date(2026, 10, 25))
    assert len(hours) == 25
    assert len({hour.astimezone(timezone.utc) for hour in hours}) == 25
