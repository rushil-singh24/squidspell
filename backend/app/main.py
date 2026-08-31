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
from app.race import RACE_DURATIONS, RaceState
from app.transcript import TranscriptBuilder, VALID_ACTIONS

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
        mode: str | None = None
        transcript: TranscriptBuilder | None = None
        race: RaceState | None = None
        _last_transcript_sent: str | None = None
        _last_race_sent: dict | None = None
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

                if "mode" in msg:
                    new_mode = msg["mode"]
                    if new_mode not in (None, "train", "race"):
                        await websocket.send_json({
                            "error": "unknown mode",
                            "timestamp": int(time.time() * 1000),
                        })
                        continue
                    mode = new_mode
                    transcript = TranscriptBuilder() if mode == "train" else None
                    race = RaceState() if mode == "race" else None
                    _last_transcript_sent = None
                    _last_race_sent = None
                    continue
                if "action" in msg:
                    action = msg["action"]
                    if action not in VALID_ACTIONS:
                        await websocket.send_json({
                            "error": "unknown action",
                            "timestamp": int(time.time() * 1000),
                        })
                        continue
                    if transcript is not None:
                        transcript.apply(action)
                    continue
                if "race" in msg:
                    cmd = msg["race"]
                    if cmd == "start":
                        duration = msg.get("duration")
                        if race is None or duration not in RACE_DURATIONS:
                            await websocket.send_json({
                                "error": "bad race command",
                                "timestamp": int(time.time() * 1000),
                            })
                            continue
                        race.start(duration, time.monotonic() * 1000.0)
                    elif cmd == "stop":
                        if race is not None:
                            race.stop()
                    else:
                        await websocket.send_json({
                            "error": "unknown race command",
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

                now_ms = now_mono * 1000.0
                if transcript is not None and result.committed_letter is not None:
                    transcript.commit_letter(result.committed_letter, now_ms)
                if race is not None:
                    if result.committed_letter is not None:
                        race.commit_letter(result.committed_letter, now_ms)
                    race.tick(now_ms)

                transcript_out = None
                if transcript is not None and transcript.text != _last_transcript_sent:
                    transcript_out = transcript.text
                    _last_transcript_sent = transcript.text
                race_out = None
                if race is not None:
                    snap = race.snapshot(now_ms)
                    if snap != _last_race_sent:
                        race_out = snap
                        _last_race_sent = snap

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
                    "transcript": transcript_out,
                    "race": race_out,
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
