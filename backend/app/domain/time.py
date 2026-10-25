"""UTC and Europe/London conversions. January 2026 is GMT, so local equals UTC."""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.app.config import CUTOFFS

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError("timestamp must be timezone-aware")
    return value.astimezone(UTC)


def to_z(value: datetime) -> str:
    return ensure_utc(value).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_local_iso(value: datetime) -> str:
    return ensure_utc(value).astimezone(LONDON).isoformat()


def cutoff_utc(decision_date: date, cutoff_name: str) -> datetime:
    hour, minute = CUTOFFS[cutoff_name]
    local = datetime.combine(decision_date, time(hour, minute), tzinfo=LONDON)
    return local.astimezone(UTC)


def delivery_date_for(decision_date: date) -> date:
    return decision_date + timedelta(days=1)


def iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def delivery_hours(delivery: date) -> list[datetime]:
    """UTC instants of local clock hours on the delivery date.

    A normal day yields 24 hours. A spring-forward day yields 23. A
    fall-back day yields 25, including both occurrences of the repeated hour.
    """

    start = datetime.combine(delivery, time(0, 0), tzinfo=LONDON).astimezone(UTC)
    end = datetime.combine(delivery + timedelta(days=1), time(0, 0), tzinfo=LONDON).astimezone(UTC)
    cursor = start
    hours: list[datetime] = []
    while cursor < end:
        local = cursor.astimezone(LONDON)
        if local.date() == delivery and local.minute == 0 and local.second == 0:
            hours.append(cursor)
        cursor += timedelta(minutes=30)
    return hours
