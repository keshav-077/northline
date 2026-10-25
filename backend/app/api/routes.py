"""Read-only evaluation API. Query values are an allowlist, so a request cannot call Elexon."""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from backend.app.config import CUTOFFS, DEFAULT_CUTOFF, DEFAULT_STRATEGY, LICENCE, LICENCE_URL, STRATEGIES
from backend.app.domain.models import EvaluationResult
from backend.app.domain.time import delivery_date_for

router = APIRouter(prefix="/api/v1")


class CutoffInfo(BaseModel):
    id: str
    local_time: str
    market: str
    note: str


class MetaResponse(BaseModel):
    product: str
    snapshot_id: str
    retrieved_at: str
    decision_from: str
    decision_to: str
    delivery_from: str
    delivery_to: str
    default_cutoff: str
    default_strategy: str
    cutoffs: list[CutoffInfo]
    strategies: list[str]
    units: str
    methodology_version: str
    licence: str
    licence_url: str
    scope_note: str
    alignment_note: str
    publication_clock_note: str
    sign_convention: str
    windfor_rows: int
    fuelhh_rows: int


CUTOFF_INFO = [
    CutoffInfo(
        id="09:20",
        local_time="09:20",
        market="EPEX SPOT GB 60-minute",
        note="First binding GB day-ahead gate. In January the 07:30 forecast is the latest file already published.",
    ),
    CutoffInfo(
        id="09:50",
        local_time="09:50",
        market="Nord Pool N2EX",
        note="Nord Pool's N2EX page states gate closure at 09:50 GMT. The 09:30 forecast is eligible for this preset only.",
    ),
    CutoffInfo(
        id="15:30",
        local_time="15:30",
        market="EPEX SPOT GB 30-minute",
        note="A file stamped exactly 15:30 is treated as available because the rule is publishTime <= cutoff.",
    ),
]


def _store(request: Request):
    store = request.app.state.store
    if store is None:
        raise HTTPException(status_code=503, detail={"error": "snapshot_unavailable", "message": request.app.state.store_error})
    return store


@router.get("/health")
def health(request: Request) -> dict:
    store = request.app.state.store
    settings = request.app.state.settings
    if store is None:
        raise HTTPException(status_code=503, detail={"error": "snapshot_unavailable", "message": request.app.state.store_error})
    return {
        "status": "ok",
        "snapshot_id": store.manifest["snapshot_id"],
        "retrieved_at": store.manifest["retrieved_at"],
        "decision_from": settings.decision_from.isoformat(),
        "decision_to": settings.decision_to.isoformat(),
    }


@router.get("/meta", response_model=MetaResponse)
def meta(request: Request) -> MetaResponse:
    store = _store(request)
    settings = request.app.state.settings
    return MetaResponse(
        product="Northline",
        snapshot_id=store.manifest["snapshot_id"],
        retrieved_at=store.manifest["retrieved_at"],
        decision_from=settings.decision_from.isoformat(),
        decision_to=settings.decision_to.isoformat(),
        delivery_from=delivery_date_for(settings.decision_from).isoformat(),
        delivery_to=delivery_date_for(settings.decision_to).isoformat(),
        default_cutoff=DEFAULT_CUTOFF,
        default_strategy=DEFAULT_STRATEGY,
        cutoffs=CUTOFF_INFO,
        strategies=list(STRATEGIES),
        units="MW",
        methodology_version="1",
        licence=LICENCE,
        licence_url=LICENCE_URL,
        scope_note=(
            "Decision dates are London calendar days from 1 January through 31 January 2026. "
            "Each decision procures the following delivery day, 2 January through 1 February. "
            "1 January delivery is excluded because that auction was on 31 December 2025."
        ),
        alignment_note=(
            "WINDFOR is an hourly MW forecast. FUELHH WIND is the average MW of each half hour. "
            "The scored actual is the mean of the two half hours inside the forecast hour. "
            "The product does not repeat one forecast across 48 half hours."
        ),
        publication_clock_note=(
            "The BMRS wind page lists eight clocks ending in :30, without a timezone. "
            "In this January window the files are stamped one hour earlier: 02:30, 04:30, 07:30, 09:30, "
            "11:30, 15:30, 18:30 and 22:30 UTC. On 15 January the 11:30 file is replaced by 12:25 UTC. "
            "Selection uses publishTime, not the webpage clock."
        ),
        sign_convention="error = forecast − actual. Positive means the forecast overstated wind.",
        windfor_rows=store.manifest["windfor_rows"],
        fuelhh_rows=store.manifest["fuelhh_rows"],
    )


@router.get("/evaluation", response_model=EvaluationResult)
def evaluation(
    request: Request,
    response: Response,
    cutoff: str = DEFAULT_CUTOFF,
    strategy: str = DEFAULT_STRATEGY,
) -> EvaluationResult:
    if cutoff not in CUTOFFS:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_query", "message": "cutoff must be one of 09:20, 09:50, 15:30"},
        )
    if strategy not in STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_query", "message": "strategy must be single_vintage or latest_interval"},
        )
    store = _store(request)
    response.headers["Cache-Control"] = "public, max-age=86400"
    return store.evaluation(cutoff, strategy)
