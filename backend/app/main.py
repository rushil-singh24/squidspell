"""SquidSpell prediction service: one FastAPI app serving the Phase 3
InferenceEngine over a WebSocket plus three REST endpoints. Internal modules
(prediction.py now; transcript.py / race.py in later phases) stay in-process
— no microservices.
"""
from __future__ import annotations

import json
import logging
import math
import os
import time
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.prediction import PredictionService

_FPS_WINDOW_SECONDS = 1.0
_logger = logging.getLogger("squidspell.ws")


def _valid_landmarks(value) -> bool:
    if value is None:
        return True
    if not isinstance(value, list) or len(value) != 21:
        return False
    for pt in value:
        if not isinstance(pt, list) or len(pt) != 3:
            return False
        if not all(
            isinstance(c, (int, float)) and not isinstance(c, bool) and math.isfinite(c)
            for c in pt
        ):
            return False
    return True


def _to_tuples(value):
    if value is None:
        return None
    return [tuple(pt) for pt in value]


def create_app(service: PredictionService | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if getattr(app.state, "service", None) is None:
            app.state.service = PredictionService.load()
        yield

    app = FastAPI(title="SquidSpell Prediction Service", lifespan=lifespan)

    _default_origins = "http://localhost:5173,http://127.0.0.1:5173"
    _cors_origins = [
        o.strip()
        for o in os.environ.get("SQUIDSPELL_CORS_ORIGINS", _default_origins).split(",")
        if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.service = service  # None unless a test injected one

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/models")
    def models():
        if app.state.service is None:
            raise HTTPException(status_code=503, detail="models not loaded")
        return app.state.service.models_info()

    @app.get("/metrics")
    def metrics():
        if app.state.service is None:
            raise HTTPException(status_code=503, detail="models not loaded")
        return app.state.service.metrics()

    @app.websocket("/ws/predict")
    async def ws_predict(websocket: WebSocket):
        await websocket.accept()
        engine = websocket.app.state.service.new_engine()
        recv_times: deque[float] = deque()
        try:
            while True:
                try:
                    msg = await websocket.receive_json()
                except (json.JSONDecodeError, KeyError):
                    # non-JSON text frame, or a binary frame (receive_json
                    # raises KeyError 'text' on binary)
                    await websocket.send_json({
                        "error": "expected a JSON text frame",
                        "timestamp": int(time.time() * 1000),
                    })
                    continue
                if not isinstance(msg, dict):
                    await websocket.send_json({
                        "error": "expected a JSON object",
                        "timestamp": int(time.time() * 1000),
                    })
                    continue

                raw = msg.get("landmarks")
                client_ts = msg.get("t")
                if not _valid_landmarks(raw):
                    await websocket.send_json({
                        "error": "invalid landmarks: expected 21 [x,y,z] triples or null",
                        "timestamp": int(time.time() * 1000),
                    })
                    continue

                now_mono = time.monotonic()
                recv_times.append(now_mono)
                while recv_times and now_mono - recv_times[0] > _FPS_WINDOW_SECONDS:
                    recv_times.popleft()
                fps = len(recv_times) if len(recv_times) >= 2 else 0

                result = engine.process_frame(_to_tuples(raw), now_mono * 1000.0)

                await websocket.send_json({
                    "prediction": result.committed_letter,
                    "confidence": result.committed_confidence if result.committed_letter else 0.0,
                    "source": result.committed_source,
                    "static_label": result.static_label,
                    "static_confidence": result.static_confidence,
                    "motion_active": result.motion_active,
                    "fps": fps,
                    "timestamp": int(time.time() * 1000),
                    "client_timestamp": client_ts,
                })
        except WebSocketDisconnect:
            return
        except Exception:
            _logger.exception("unexpected error in /ws/predict; closing connection")
            try:
                await websocket.close(code=1011)
            except Exception:
                pass
            return

    return app


app = create_app()
