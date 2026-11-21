"""/api/predict-price: "What's my car worth?" """
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from app.core.rate_limit import limiter
from app.schemas.price import ModelInfo, PricePredictRequest, PricePrediction
from app.services.price_service import ModelUnavailable, predictor

router = APIRouter(prefix="/predict-price", tags=["price"])


@router.post("", response_model=PricePrediction)
@limiter.limit("30/minute")
async def predict_price(request: Request, payload: PricePredictRequest) -> PricePrediction:
    """Estimated price, calibrated 80% range, top factors and (with `asking_price`) a deal rating.
    Public: no account needed to value a car."""
    features = payload.model_dump(exclude={"asking_price"})
    asking = float(payload.asking_price) if payload.asking_price else None
    try:
        # Model inference is CPU-bound; keep it off the event loop.
        return await run_in_threadpool(predictor.predict, features, asking)
    except ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.get("/model", response_model=ModelInfo)
def model_info() -> ModelInfo:
    """Version, training data and hold-out metrics (MAE, R², interval coverage) of the live model."""
    return predictor.model_info()
