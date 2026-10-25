"""Read and write the gzipped JSONL snapshot. The API never calls Elexon."""

from __future__ import annotations

import gzip
import hashlib
import json
from datetime import datetime
from pathlib import Path

from backend.app.config import LICENCE, LICENCE_URL, Settings
from backend.app.domain.evaluate import build_evaluation
from backend.app.domain.models import ActualRecord, EvaluationResult, ForecastRecord, FuelhhWire, WindforWire
from backend.app.domain.time import ensure_utc

SNAPSHOT_ERROR = "snapshot missing or failed validation"


class SnapshotError(Exception):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    payload = "".join(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n" for row in rows).encode("utf-8")
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as handle:
            handle.write(payload)


def _read_jsonl(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def forecast_wire(record: WindforWire) -> dict:
    if record.dataset != "WINDFOR":
        raise SnapshotError(f"unexpected forecast dataset: {record.dataset}")
    return {
        "dataset": record.dataset,
        "generation": record.generation,
        "publishTime": ensure_utc(record.publishTime).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "startTime": ensure_utc(record.startTime).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def actual_wire(record: FuelhhWire) -> dict:
    if record.dataset != "FUELHH" or record.fuelType != "WIND":
        raise SnapshotError("actual row is not FUELHH WIND")
    return {
        "dataset": record.dataset,
        "fuelType": record.fuelType,
        "generation": record.generation,
        "publishTime": ensure_utc(record.publishTime).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "settlementDate": record.settlementDate.isoformat(),
        "settlementPeriod": record.settlementPeriod,
        "startTime": ensure_utc(record.startTime).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def save_snapshot(
    directory: Path,
    forecasts: list[dict],
    actuals: list[dict],
    *,
    retrieved_at: str,
    requests: list[str],
    notes: list[str],
) -> dict:
    directory.mkdir(parents=True, exist_ok=True)
    wind_path = directory / "windfor.jsonl.gz"
    fuel_path = directory / "fuelhh.jsonl.gz"
    _write_jsonl(wind_path, forecasts)
    _write_jsonl(fuel_path, actuals)
    manifest = {
        "retrieved_at": retrieved_at,
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "windfor_rows": len(forecasts),
        "fuelhh_rows": len(actuals),
        "windfor_sha256": _sha256(wind_path),
        "fuelhh_sha256": _sha256(fuel_path),
        "snapshot_id": _sha256(wind_path)[:16],
        "requests": requests,
        "notes": notes,
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def _as_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return ensure_utc(parsed)


def _load_records(directory: Path) -> tuple[dict, list[ForecastRecord], list[ActualRecord]]:
    manifest_path = directory / "manifest.json"
    wind_path = directory / "windfor.jsonl.gz"
    fuel_path = directory / "fuelhh.jsonl.gz"
    if not manifest_path.is_file() or not wind_path.is_file() or not fuel_path.is_file():
        raise SnapshotError(SNAPSHOT_ERROR)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if _sha256(wind_path) != manifest.get("windfor_sha256") or _sha256(fuel_path) != manifest.get("fuelhh_sha256"):
        raise SnapshotError(SNAPSHOT_ERROR)
    raw_forecasts = _read_jsonl(wind_path)
    raw_actuals = _read_jsonl(fuel_path)
    if len(raw_forecasts) != manifest.get("windfor_rows") or len(raw_actuals) != manifest.get("fuelhh_rows"):
        raise SnapshotError(SNAPSHOT_ERROR)
    try:
        forecasts = [
            ForecastRecord(
                publish_time=_as_utc(row["publishTime"]),
                start_time=_as_utc(row["startTime"]),
                generation_mw=WindforWire.model_validate(row).generation,
            )
            for row in raw_forecasts
        ]
        actuals = []
        for row in raw_actuals:
            wire = FuelhhWire.model_validate(row)
            if wire.fuelType != "WIND" or wire.dataset != "FUELHH":
                raise SnapshotError(SNAPSHOT_ERROR)
            actuals.append(
                ActualRecord(
                    start_time=ensure_utc(wire.startTime),
                    settlement_date=wire.settlementDate,
                    settlement_period=wire.settlementPeriod,
                    publish_time=ensure_utc(wire.publishTime),
                    generation_mw=wire.generation,
                )
            )
    except (KeyError, ValueError, SnapshotError) as exc:
        raise SnapshotError(SNAPSHOT_ERROR) from exc
    return manifest, forecasts, actuals


class SnapshotStore:
    def __init__(self, manifest: dict, forecasts: list[ForecastRecord], actuals: list[ActualRecord], evaluations: dict):
        self.manifest = manifest
        self.forecasts = forecasts
        self.actuals = actuals
        self.evaluations = evaluations

    @classmethod
    def load(cls, settings: Settings) -> SnapshotStore:
        manifest, forecasts, actuals = _load_records(settings.snapshot_dir)
        evaluations: dict[tuple[str, str], EvaluationResult] = {}
        from backend.app.config import CUTOFFS

        for cutoff in CUTOFFS:
            for strategy in ("single_vintage", "latest_interval"):
                evaluations[(cutoff, strategy)] = build_evaluation(
                    forecasts,
                    actuals,
                    decision_from=settings.decision_from,
                    decision_to=settings.decision_to,
                    cutoff=cutoff,
                    strategy=strategy,
                    sanity_bound_mw=settings.sanity_bound_mw,
                )
        return cls(manifest, forecasts, actuals, evaluations)

    def evaluation(self, cutoff: str, strategy: str) -> EvaluationResult:
        try:
            return self.evaluations[(cutoff, strategy)]
        except KeyError as exc:
            raise KeyError(cutoff) from exc
