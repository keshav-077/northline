"""Download the January 2026 window and publish an atomic snapshot.

The dashboard reads the snapshot only. A failed download leaves the previous snapshot in place.
"""

from __future__ import annotations

import logging
import shutil
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta

from backend.app.config import Settings, get_settings
from backend.app.domain.models import FuelhhWire, WindforWire
from backend.app.domain.time import delivery_date_for, delivery_hours, ensure_utc, iter_dates, to_z
from backend.app.elexon.client import ElexonClient, ElexonError
from backend.app.snapshot.store import actual_wire, forecast_wire, save_snapshot

logger = logging.getLogger(__name__)

FORECAST_FROM = date(2025, 12, 31)
FORECAST_TO = date(2026, 2, 1)
ACTUAL_FROM = date(2026, 1, 2)
ACTUAL_TO = date(2026, 2, 1)
DECISION_FROM = date(2026, 1, 1)
DECISION_TO = date(2026, 1, 31)

STANDARD_RUNS = ("02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30")
JANUARY_15_RUNS = ("02:30", "04:30", "07:30", "09:30", "12:25", "15:30", "18:30", "22:30")


class IngestError(Exception):
    pass


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time(0), tzinfo=UTC)
    end = datetime.combine(day + timedelta(days=1), time(0), tzinfo=UTC)
    return start, end


def _dedupe(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique: list[dict] = []
    for row in rows:
        key = str(sorted(row.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def fetch_forecasts(client: ElexonClient) -> tuple[list[dict], list[str]]:
    rows: list[dict] = []
    requests: list[str] = []
    for day in iter_dates(FORECAST_FROM, FORECAST_TO):
        start, end = _day_bounds(day)
        requests.append(f"WINDFOR {to_z(start)} {to_z(end)}")
        payload = client.fetch_windfor(start, end)
        for item in payload:
            wire = WindforWire.model_validate(item)
            published = ensure_utc(wire.publishTime)
            if start <= published < end:
                rows.append(forecast_wire(wire))
        logger.info("forecasts %s rows %s", day.isoformat(), len(payload))
    return rows, requests


def fetch_actuals(client: ElexonClient) -> tuple[list[dict], list[str]]:
    requests = [f"FUELHH {ACTUAL_FROM.isoformat()} {ACTUAL_TO.isoformat()} WIND"]
    try:
        payload = client.fetch_fuelhh(ACTUAL_FROM, ACTUAL_TO)
    except ElexonError:
        logger.warning("month actuals request failed; retrying day by day")
        payload = []
        for day in iter_dates(ACTUAL_FROM, ACTUAL_TO):
            requests.append(f"FUELHH {day.isoformat()} {day.isoformat()} WIND")
            payload.extend(client.fetch_fuelhh(day, day))
    rows = []
    for item in payload:
        wire = FuelhhWire.model_validate(item)
        if wire.fuelType != "WIND":
            continue
        rows.append(actual_wire(wire))
    return rows, requests


def assert_known_window(forecasts: list[dict], actuals: list[dict]) -> None:
    if len(actuals) != 1488:
        raise IngestError(f"expected 1488 wind actuals, found {len(actuals)}")
    by_day: dict[str, list[dict]] = {}
    for row in actuals:
        by_day.setdefault(row["settlementDate"], []).append(row)
    expected_days = [day.isoformat() for day in iter_dates(ACTUAL_FROM, ACTUAL_TO)]
    if sorted(by_day) != expected_days:
        raise IngestError("actual delivery dates do not cover 2 January through 1 February 2026")
    for day, rows in by_day.items():
        periods = [row["settlementPeriod"] for row in rows]
        if sorted(periods) != list(range(1, 49)):
            raise IngestError(f"{day} does not have settlement periods 1-48")
        if any(row["generation"] is None or row["generation"] < 0 for row in rows):
            raise IngestError(f"{day} has a null or negative actual")
        minutes = {row["startTime"][14:16] for row in rows}
        if minutes != {"00", "30"}:
            raise IngestError(f"{day} actuals are not half-hourly")

    forecast_keys = Counter((row["publishTime"], row["startTime"]) for row in forecasts)
    if any(count > 1 for count in forecast_keys.values()):
        raise IngestError("duplicate WINDFOR publishTime/startTime keys")
    if any(row["generation"] is None or row["generation"] < 0 for row in forecasts):
        raise IngestError("null or negative WINDFOR generation in the January window")

    runs_by_day: dict[str, set[str]] = {}
    for row in forecasts:
        runs_by_day.setdefault(row["publishTime"][:10], set()).add(row["publishTime"][11:16])
    expected_forecast_days = [day.isoformat() for day in iter_dates(FORECAST_FROM, FORECAST_TO)]
    if sorted(runs_by_day) != expected_forecast_days:
        raise IngestError("forecast publish days are incomplete")
    for day, runs in runs_by_day.items():
        expected = set(JANUARY_15_RUNS if day == "2026-01-15" else STANDARD_RUNS)
        if runs != expected:
            raise IngestError(f"{day} publication clock {sorted(runs)} != {sorted(expected)}")

    available = {(row["publishTime"], row["startTime"]) for row in forecasts}
    for decision in iter_dates(DECISION_FROM, DECISION_TO):
        vintage = f"{decision.isoformat()}T07:30:00Z"
        for hour in delivery_hours(delivery_date_for(decision)):
            if (vintage, to_z(hour)) not in available:
                raise IngestError(f"{vintage} does not cover {to_z(hour)}")


def publish(directory, forecasts: list[dict], actuals: list[dict], requests: list[str]) -> dict:
    forecasts = _dedupe(forecasts)
    actuals = _dedupe(actuals)
    forecasts.sort(key=lambda row: (row["publishTime"], row["startTime"]))
    actuals.sort(key=lambda row: (row["settlementDate"], row["settlementPeriod"], row["startTime"]))
    assert_known_window(forecasts, actuals)
    temp = directory.parent / f"{directory.name}_next"
    if temp.exists():
        shutil.rmtree(temp)
    retrieved_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = save_snapshot(
        temp,
        forecasts,
        actuals,
        retrieved_at=retrieved_at,
        requests=requests,
        notes=["2026-01-15 WINDFOR run is stamped 12:25Z instead of the usual 11:30Z."],
    )
    previous = directory.parent / f"{directory.name}_previous"
    if previous.exists():
        shutil.rmtree(previous)
    if directory.exists():
        directory.rename(previous)
    try:
        temp.rename(directory)
    except Exception:
        if previous.exists() and not directory.exists():
            previous.rename(directory)
        raise
    if previous.exists():
        shutil.rmtree(previous)
    logger.info("snapshot %s forecasts %s actuals %s", manifest["snapshot_id"], manifest["windfor_rows"], manifest["fuelhh_rows"])
    return manifest


def ingest(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    with ElexonClient(settings) as client:
        forecasts, forecast_requests = fetch_forecasts(client)
        actuals, actual_requests = fetch_actuals(client)
    return publish(settings.snapshot_dir, forecasts, actuals, forecast_requests + actual_requests)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ingest()


if __name__ == "__main__":
    main()
