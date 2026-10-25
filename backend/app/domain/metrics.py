"""Pure accuracy metrics. error = forecast - actual. Positive means overforecast."""

from decimal import Decimal, ROUND_HALF_UP
from statistics import StatisticsError, quantiles

from backend.app.domain.models import MetricBlock

TWOPLACES = Decimal("0.01")
FOURPLACES = Decimal("0.0001")


def _q(value: Decimal, places: Decimal = TWOPLACES) -> str:
    return format(value.quantize(places, rounding=ROUND_HALF_UP), "f")


def one_decimal(value: Decimal) -> str:
    return _q(value, Decimal("0.1"))


def summarize(errors: list[Decimal], actuals: list[Decimal], *, n_expected: int, n_missing: int, n_excluded: int) -> MetricBlock:
    n_scored = len(errors)
    if n_scored == 0 or len(actuals) != n_scored:
        return MetricBlock(
            mae_mw=None,
            rmse_mw=None,
            bias_mw=None,
            wape=None,
            error_p10_mw=None,
            error_p50_mw=None,
            error_p90_mw=None,
            n_expected=n_expected,
            n_scored=n_scored,
            n_missing=n_missing,
            n_excluded=n_excluded,
        )
    count = Decimal(n_scored)
    bias = sum(errors, Decimal(0)) / count
    mae = sum((abs(error) for error in errors), Decimal(0)) / count
    mean_square = sum((error * error for error in errors), Decimal(0)) / count
    rmse = mean_square.sqrt()
    denominator = sum((abs(actual) for actual in actuals), Decimal(0))
    wape = None if denominator == 0 else sum((abs(error) for error in errors), Decimal(0)) / denominator
    p10 = p50 = p90 = None
    if n_scored >= 2:
        floats = [float(error) for error in errors]
        try:
            tenths = quantiles(floats, n=10, method="inclusive")
            median = quantiles(floats, n=2, method="inclusive")
        except StatisticsError:
            tenths = []
            median = []
        if len(tenths) == 9 and median:
            p10 = Decimal(str(tenths[0]))
            p90 = Decimal(str(tenths[8]))
            p50 = Decimal(str(median[0]))
    return MetricBlock(
        mae_mw=_q(mae),
        rmse_mw=_q(rmse),
        bias_mw=_q(bias),
        wape=None if wape is None else _q(wape, FOURPLACES),
        error_p10_mw=None if p10 is None else _q(p10),
        error_p50_mw=None if p50 is None else _q(p50),
        error_p90_mw=None if p90 is None else _q(p90),
        n_expected=n_expected,
        n_scored=n_scored,
        n_missing=n_missing,
        n_excluded=n_excluded,
    )
