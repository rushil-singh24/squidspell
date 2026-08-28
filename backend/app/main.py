"""SquidSpell prediction service: one FastAPI app serving the Phase 3
InferenceEngine over a WebSocket plus three REST endpoints. Internal modules
(prediction.py now; transcript.py / race.py in later phases) stay in-process
— no microservices.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.prediction import PredictionService


def create_app(service: PredictionService | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if getattr(app.state, "service", None) is None:
            app.state.service = PredictionService.load()
        yield

    app = FastAPI(title="SquidSpell Prediction Service", lifespan=lifespan)
    app.state.service = service  # None unless a test injected one

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/models")
    def models():
        return app.state.service.models_info()

    @app.get("/metrics")
    def metrics():
        return app.state.service.metrics()

    return app


app = create_app()
