# Northline

Historical day-ahead wind desk for a GB electricity supplier. For each purchase decision made on a London day in January 2026, it shows the national wind forecast that had already been published, the later half-hourly outturn, and the error.

This is a replay of January 2026. It is not a live trading screen, and it does not estimate demand, price, or a hedge volume.

## Result for the default rule

Decision dates are 1–31 January 2026. Each decision buys the next delivery day. The default cutoff is 09:20 Europe/London, the EPEX SPOT GB 60-minute day-ahead gate. In this window that clock time is 09:20 UTC, and the latest eligible WINDFOR file is the 07:30 UTC run. The 09:30 run is excluded.

From snapshot `8e87d9346bc99a87`, retrieved from Elexon at 2026-10-24T18:16:34Z:

| | |
| --- | --- |
| Hours scored | 744 of 744 |
| MAE | 2,038.91 MW |
| RMSE | 2,504.76 MW |
| Bias (forecast − actual) | +1,747.89 MW |
| WAPE | 18.07% |
| Error p10 / p50 / p90 | −549.30 / +1,592.00 / +4,097.90 MW |

Positive bias means the forecast overstated wind. On the worked example, decision 14 January for delivery 15 January, the 07:30 forecast’s hourly MAE and bias are both 1,041.83 MW and RMSE is 1,149.26 MW. Hour 00:00 is forecast 15,834 MW against half hours 14,602 and 14,311.

These figures are produced by the tests in `backend/tests/test_snapshot.py`. They describe this extract only.

On the chart, the shaded band compares the hourly forecast with the mean of the two half-hourly actuals. The dark line is each half-hour and can sit on the other side of that hourly mean. WAPE is shown to two decimal places, so the January ratio 0.1807 reads 18.07%.

## Live application

The production image was checked on this machine on 24 October 2026. `docker run --rm -p 8000:8000 northline` returned snapshot `8e87d9346bc99a87` from `/api/v1/health`, and the 14 January decision at cutoff 09:20 used the 07:30 GMT vintage. A public URL is not recorded: the Vercel CLI was logged out, and `npx vercel deploy --temporary --yes` stopped with “No existing credentials found”.

## Stack

- Python 3.12, FastAPI, Pydantic v2, httpx
- React 19, TypeScript, Vite, TanStack Query
- Docker Compose for local development and a production image that serves the API and the built desk together

## Data

Contains BMRS data © Elexon Limited copyright and database right 2026.
[BMRS data licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/).

The Insights API is public. These calls used no API key. Base URL: `https://data.elexon.co.uk/bmrs/api/v1`.

- Actuals: `GET /datasets/FUELHH/stream` with `fuelType=WIND`. `generation` is average MW over the half hour. The delivery window 2 January–1 February 2026 returned 1,488 rows, 48 settlement periods a day, no duplicate periods.
- Forecasts: `GET /datasets/WINDFOR/stream`, filtered by `publishTime`. Each value is one hourly MW figure for metered wind visible to NESO. There is no settlement period on the stream record.

WINDFOR is hourly. FUELHH is half-hourly. The scored actual for an hour is the mean of the two half hours starting at that hour and 30 minutes later. The forecast is not copied onto 48 separate samples.

The BMRS wind page lists eight publication clocks without a timezone. In this January extract the files are at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC. On 15 January the 11:30 file is replaced by one at 12:25 UTC. Selection uses `publishTime`, not the webpage clock.

## Decision rule

A decision on London date D procures delivery D+1. The eligible forecast satisfies `publishTime <= cutoff`. Nothing published later is used.

- `09:20` is the default: EPEX SPOT GB 60-minute auction. The vintage is 07:30.
- `09:50` is the Nord Pool N2EX gate stated as 09:50 GMT. The 09:30 file becomes eligible.
- `15:30` is the EPEX GB 30-minute auction. A file stamped exactly 15:30 is included because the comparison is `<=`.

The default strategy keeps one publication, the latest file at or before the cutoff, and does not fill a missing hour from an older or newer file. “Latest hour” is the alternative: each delivery hour may use a different eligible publication. January 2026 is GMT, so local time and UTC match. Timestamps are still converted with `Europe/London`.

`error = forecast − actual`. Positive means overforecast. MAE, RMSE, and bias are computed on scored hours only, in MW, with `Decimal`. WAPE is secondary and is undefined if the actual sum is zero. MAPE is not used. Missing, conflicting, or implausible rows (below 0 MW or above 50,000 MW) stay out of the metrics. A zero is a real value.

None of these metrics is a volume to buy. Demand and the existing contract position are outside the assignment’s data.

## Architecture

```mermaid
flowchart LR
  elexon[Elexon stream API] --> ingest[Ingest CLI]
  ingest --> snapshot[Gzipped snapshot]
  snapshot --> api[FastAPI]
  api --> desk[React desk]
```

Dashboard requests read the snapshot. They do not call Elexon. If the snapshot is missing, `/api/v1/health` returns 503 and the desk shows an unavailable state. No synthetic series is substituted.

- `GET /api/v1/health`
- `GET /api/v1/meta`
- `GET /api/v1/evaluation?cutoff=09:20&strategy=single_vintage`

`cutoff` is one of `09:20`, `09:50`, `15:30`. `strategy` is `single_vintage` or `latest_interval`.

## Directory

- `backend/app/main.py` — application, request log, static desk
- `backend/app/config.py` — environment and the January window
- `backend/app/api/routes.py` — health, meta, evaluation
- `backend/app/elexon/client.py` — stream client, retries, no required key
- `backend/app/elexon/ingest.py` — day-chunked download and coverage checks
- `backend/app/domain/time.py` — London and UTC
- `backend/app/domain/selection.py` — vintage rule
- `backend/app/domain/alignment.py` — half-hour pairing
- `backend/app/domain/metrics.py` — MAE, RMSE, bias, WAPE, quantiles
- `backend/app/domain/evaluate.py` — join and score
- `backend/app/snapshot/store.py` — gzipped JSONL, checksums, precomputed evaluations
- `backend/tests/` — selection, metrics, client failures, API contract, snapshot lock
- `data/snapshot/` — `windfor.jsonl.gz`, `fuelhh.jsonl.gz`, `manifest.json`
- `frontend/src/` — the desk, charts, table, and assumption panel
- `Dockerfile` — production image
- `docker-compose.yml` — API on port 8000 and Vite on port 5173
- `docs/VIDEO_SCRIPT.md` — the ten-minute recording outline

## Local setup

From the repository root, with Python 3.12:

```text
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest
.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

In another shell:

```text
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173/?date=2026-01-14&cutoff=09:20`. The Vite server proxies `/api` to port 8000.

Refresh the snapshot from Elexon, replacing it only after the coverage checks pass:

```text
python -m backend.app.elexon.ingest
```

## Docker

Development, with hot reload:

```text
docker compose up --build
```

Production image, API and built desk on one origin:

```text
docker build -t northline .
docker run --rm -p 8000:8000 northline
```

Open `http://127.0.0.1:8000/?date=2026-01-14&cutoff=09:20`.

## Environment

| Variable | Purpose |
| --- | --- |
| `SNAPSHOT_PATH` | Snapshot directory. Default `data/snapshot`. |
| `STATIC_DIR` | Built desk. Empty in local API-only mode. |
| `ELEXON_BASE_URL` | Insights API base. Used only by the ingest command. |
| `ELEXON_API_KEY` | Optional. Sent as `X-Api-Key` only when set. The public API did not require one. |
| `PORT` | Set by the production container host. |

Copy `.env.example` if you want a local file. Do not commit secrets. This project has none.

## Tests

```text
python -m pytest
cd frontend && npm test
```

Backend tests cover London/UTC conversion, the spring-forward and fall-back days, a publication after the cutoff, mixed vintages, conflicting duplicates, a missing forecast, zero generation, the 31 January decision for 1 February delivery, retries, malformed JSON, and the recorded 15 January hour. The snapshot test locks the 744-hour January totals above.

## Deployment

Vercel is the intended host: one Python function plus the built desk, with the snapshot inside the project. Hobby functions are not the sleeping Eco dyno Heroku now charges for.

```text
npx vercel --prod
```

`pyproject.toml` sets the Vercel entrypoint to `backend.app.main:app`. `vercel.json` builds the frontend, points `STATIC_DIR` at `frontend/dist`, and includes the snapshot and the built desk in the function bundle.

On 24 October 2026 the production container was checked in a fresh Chrome profile. The public check is still waiting on an account:

```text
npx vercel login
npx vercel --prod
```

Then open `/api/v1/health` and `/?date=2026-01-14&cutoff=09:20` in a private window. Health should name snapshot `8e87d9346bc99a87`. Heroku can run the same image on a Basic dyno if Vercel is unavailable. An Eco dyno sleeps after 30 minutes and is a poor review link. No Heroku CLI is installed here.

## Video

The submission needs an unlisted YouTube video of at most 10 minutes: five for the client, five for the technical review. The outline, with what to click, is in [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md). Record it from the deployed desk, or from the local production container if the deploy is still pending. Do not describe a control that was removed.

## AI tools

Cursor’s coding agent, Grok 4.7, was used to research the Elexon and auction sources, retrieve and check the January extracts, and implement the application, tests, and this README. The forecast rule, the hourly alignment, and the metrics were then locked against the retrieved Elexon rows rather than taken from the model’s estimates.

## Limitations

- National metered wind only. No demand, price, or embedded-wind series.
- The hourly WINDFOR point is treated as the forecast of average MW over the following hour. The field name does not say that; the wind page describes an hourly forecast, and the outturn is a half-hour average.
- The webpage publication clock does not match January `publishTime` values.
- The 14 January error is not the January result. The month table above is the January result for the 09:20 rule.
- A file stamped at the exact 15:30 gate is treated as available.
- The Nord Pool 09:50 source consulted was last updated in 2022 and says GMT. That is unambiguous in January and was not re-proved for summer.
- There is no scheduled refresh. Ingest is a command.

## Further work

A scheduled ingest, a private deployment, and alerting when a 07:30 file does not cover the next delivery day. Not a second data source, and not a price model.
