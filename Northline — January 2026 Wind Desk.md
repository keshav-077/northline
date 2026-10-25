NORTHLINE

← forecast too lowforecast too high →

Selected day against January’s spread of hourly errors. Shaded band is P10–P90, the tick is the median.

## Forecast in force vs actual generation

The shaded gap is the miss: red where the forecast overstated wind, green where it understated. Select an hour to pin it.

Forecast, hourly stepActual, half-hourlyOverUnder

London time, GMT throughout this month. Forecasts are displayed at hourly resolution. Lower panel: error = forecast − actual, in MW.

## January, day by day

Bar height is each day’s absolute bias. Click a day to replay it.

1 Jan8152231 Jan

## How errors spread across the month

All scored hours in 250 MW bins. Fixed to January when you change day.

## Hourly evidence

Times in London time (GMT in January 2026) · Values in MW. Sort by error to find the hours that mattered.

|  | Vintage published | Forecast | Half-hour actuals | Hourly mean |  | Lead (h) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |

## What this number is

error = forecast − actual

Positive means the forecast overstated wind.

**Important limitation**Positive forecast error is not the same as procurement volume. Demand and the contract book are outside the dataset.

Decision cutoffs

- 09:20 — EPEX SPOT GB 60-minute. First binding GB day-ahead gate. The 07:30 forecast is the latest eligible file in the default example.
- 09:50 — Nord Pool N2EX. The 09:30 forecast is eligible for this preset.
- 15:30 — EPEX SPOT GB 30-minute. A forecast published exactly at 15:30 is eligible.

How we score

**MAE** is the mean absolute error, **bias** the mean signed error, **RMSE** the root of mean squared error, so large misses weigh more.

Day RMSE · January RMSE 2,504.76 MW · January WAPE 18.1%

Alignment

WINDFOR contains hourly forecast MW, while FUELHH contains half-hourly average MW. The hourly actual is the mean of the two half-hour observations inside the hour. Do not duplicate one hourly forecast across 48 half-hour observations.

Scope

Decision dates cover 1–31 January 2026. Each decision concerns the following delivery day, covering 2 January–1 February. The 1 January delivery day is excluded because its auction decision occurred on 31 December 2025.

Clock

The BMRS documentation lists eight daily forecast clocks without timezone information. For this January extract, publication timestamps correspond to 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, and 22:30 UTC, with 11:30 replaced by 12:25 UTC on 15 January. Selection uses publication time.

Contains BMRS data © Elexon Limited copyright and database right 2026

Mock data generated locally for this prototype; nothing was fetched from Elexon.Preview state