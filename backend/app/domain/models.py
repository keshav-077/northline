"""Wire schemas from Elexon and the canonical records used for scoring."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WindforWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    dataset: str
    publishTime: datetime
    startTime: datetime
    generation: int | None


class FuelhhWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    dataset: str
    publishTime: datetime
    startTime: datetime
    settlementDate: date
    settlementPeriod: int = Field(ge=1, le=50)
    fuelType: str
    generation: int | None


class ForecastRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    publish_time: datetime
    start_time: datetime
    generation_mw: int | None
    conflict: bool = False


class ActualRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    start_time: datetime
    settlement_date: date
    settlement_period: int
    publish_time: datetime
    generation_mw: int | None
    conflict: bool = False


HourStatus = Literal["scored", "missing", "implausible", "conflicting_duplicate"]


class MetricBlock(BaseModel):
    mae_mw: str | None
    rmse_mw: str | None
    bias_mw: str | None
    wape: str | None
    error_p10_mw: str | None
    error_p50_mw: str | None
    error_p90_mw: str | None
    n_expected: int
    n_scored: int
    n_missing: int
    n_excluded: int


class HourResult(BaseModel):
    decision_date: date
    delivery_date: date
    cutoff_utc: str
    vintage_utc: str | None
    delivery_start_utc: str
    delivery_start_local: str
    forecast_mw: int | None
    actual_half_hours_mw: list[int | None]
    actual_hour_mw: str | None
    error_mw: str | None
    lead_time_hours: str | None
    status: HourStatus


class DayResult(BaseModel):
    decision_date: date
    delivery_date: date
    vintage_utc: str | None
    vintages_mixed: bool
    next_excluded_publish_utc: str | None
    metrics: MetricBlock


class EvaluationResult(BaseModel):
    cutoff: str
    strategy: str
    decision_from: date
    decision_to: date
    summary: MetricBlock
    days: list[DayResult]
    hours: list[HourResult]
