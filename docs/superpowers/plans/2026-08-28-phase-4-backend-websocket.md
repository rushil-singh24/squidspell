# SquidSpell Phase 4 — Backend: FastAPI + WebSocket Prediction Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the Phase 3 `InferenceEngine` over a FastAPI WebSocket (`/ws/predict`) plus three REST endpoints (`/health`, `/models`, `/metrics`), with one isolated rolling buffer per connected client and no reimplementation of any CV/ML logic.

**Architecture:** A thin `backend/app/` package reuses `ml/`'s Phase 3 modules through a `sys.path` bridge (no repackaging of `ml/`). `PredictionService` loads the two classifiers once per process and hands out a fresh `InferenceEngine` per WebSocket connection. `/ws/predict` receives one JSON message per frame carrying client-extracted hand landmarks (browser runs MediaPipe, not the server), runs `process_frame`, and returns one prediction event per frame. REST endpoints are synchronous and serve loaded-model info and the Phase 2 metrics JSON.

**Tech Stack:** Python 3.11, FastAPI 0.115.0, uvicorn[standard] 0.31.0, websockets 13.1, httpx 0.27.2 (test client), pytest 8.3.3 — all already pinned in `backend/requirements.txt` and installed in the repo's shared `.venv`. Reused from Phase 3: `ml/model_loader.py`, `ml/inference.py` (pure, stdlib-only).

**Spec:** `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 4 — Backend: FastAPI + WebSocket Prediction Service" section.

## Global Constraints

- **Python:** 3.11, repo-root shared venv `.venv/`. Backend tests run from `backend/`: `cd backend && python -m pytest tests/ -q`. A `backend/pytest.ini` sets `pythonpath = .` so `from app.main import create_app` resolves. ML tests still run their own way (`cd ml && python -m pytest tests/ -q`, 89 passing) and MUST stay green — this phase touches `ml/` in exactly one place (Task 1, three additive read-only properties on the predictor classes, with tests).
- **No repackaging of `ml/`.** `ml/` has no `__init__.py` and uses bare sibling imports (`from features_static import ...`). `backend/app/_ml_bridge.py` prepends `<repo>/ml` to `sys.path` and re-exports what the backend needs. The `[Phase 0] Python version and venv layout` DECISIONS entry sanctions this as the alternative to a root `pyproject.toml` + editable install. Do NOT add `ml/__init__.py`, a root `pyproject.toml`, or convert `ml/`'s imports.
- **New deps:** none. Everything needed is in `backend/requirements.txt` already.
- **Payload direction (locked by `[Phase 3]` DECISIONS):** landmark extraction stays client-side. `/ws/predict` carries landmark frames, never raw images. The backend imports nothing from `cv2`/`mediapipe` (the Phase 3 modules it reuses are already free of both).
- **Per-connection isolation (spec acceptance criterion):** every WebSocket connection gets its own `InferenceEngine` via `PredictionService.new_engine()`. The two predictor objects (`StaticPredictor`, `MotionPredictor`) are stateless and shared. Never share an `InferenceEngine`, its buffer, its smoother, or its gate across connections.
- **Server owns timing.** `InferenceEngine.process_frame(landmarks, now_ms)` gets `now_ms = time.monotonic() * 1000.0` measured at receive time on the server. The client's timestamp (if sent) is echoed back only, never used for smoother/gate timing.
- **`FrameResult` fields available (from Phase 3):** `static_label: str | None`, `static_confidence: float`, `motion_active: bool`, `committed_letter: str | None`, `committed_confidence: float`, `committed_source: str | None` (`"static"` / `"motion"` / `None`).
- **Model bundle shapes (Phase 2):** `ml/models/static_model.pkl` = `{"model", "feature_set"=="engineered", "classes"}` (24 letters A–I, K–Y). `ml/models/motion_model.pkl` = `{"model", "classes"}` (`["J", "Z", "negative"]`). Both winners are `RandomForestClassifier`. `.pkl` files are gitignored / regenerable and present locally.
- **Metrics artifacts:** `ml/results/metrics.json` (static, list of 8 rows, each with `model`, `feature_set`, `test_accuracy`, `confusion_matrix`, …) and `ml/results/motion_metrics.json` (motion, list of rows with `model`, `test_accuracy`, `per_class_metrics`, …). Both gitignored; both present locally (motion regenerated in commit `34a0a7b`). Endpoints must degrade gracefully if either is absent (fresh clone before a training run).
- **No test may hard-depend on `.pkl` files.** Deterministic tests inject fake predictor doubles into `PredictionService` / `create_app(service=...)`. Tests that genuinely need the real models are `pytest.mark.skipif(not <pkl>.exists())`.
- **Keep it one app.** One FastAPI app, clean internal modules (`prediction.py` now; `transcript.py` / `race.py` later). No microservices, no `/history` REST endpoints (Phase 8 handles persistence via the Supabase client directly).
- **Commit style:** `git add <files> && git commit -m "Phase 4: <what>"`. Commit per task. Auto-push to `origin/main` after each reviewed task is pre-approved for `rushil-singh24/squidspell` only.
- **Note on `ml/inference.py` tuning:** the human's live Phase 3 webcam pass is still pending. If it forces tuning, that lands in `ml/inference.py` module constants only — this phase wraps `InferenceEngine` unchanged and is unaffected.

---

## Outbound WebSocket message schema (`/ws/predict`)

One message **per received frame** (this is the contract Phase 5's webcam component consumes — log it verbatim in DECISIONS.md):

```json
{
  "prediction": "A",
  "confidence": 0.97,
  "source": "static",
  "static_label": "A",
  "static_confidence": 0.88,
  "motion_active": false,
  "fps": 28,
  "timestamp": 1723452345123,
  "client_timestamp": 1723452345000
}
```

| field | type | meaning |
|---|---|---|
| `prediction` | `str \| null` | `FrameResult.committed_letter` — the letter committed *this* frame, else `null` |
| `confidence` | `number` | `FrameResult.committed_confidence` when `prediction` is set, else `0.0` |
| `source` | `"static" \| "motion" \| null` | `FrameResult.committed_source` |
| `static_label` | `str \| null` | `FrameResult.static_label` — raw per-frame static prediction, for the corner readout |
| `static_confidence` | `number` | `FrameResult.static_confidence` |
| `motion_active` | `bool` | `FrameResult.motion_active` — true while a J/Z gesture is mid-flight |
| `fps` | `int` | server-measured receive rate over the last 1.0s (`0` until ≥2 frames in the window) |
| `timestamp` | `int` | server epoch-ms (`int(time.time() * 1000)`) at send |
| `client_timestamp` | `int \| null` | echo of the inbound `t` field, or `null` |

**Inbound message** (one per frame): `{"landmarks": [[x,y,z], … 21 entries] | null, "t": <optional int, client epoch-ms>}`. `landmarks: null` means no hand detected this frame.

**Malformed inbound** (not 21 `[x,y,z]` triples and not `null`): reply `{"error": "invalid landmarks: expected 21 [x,y,z] triples or null", "timestamp": <int>}` and keep the connection open.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `backend/app/__init__.py` | Create | Marks `app` as a package. Empty. |
| `backend/app/_ml_bridge.py` | Create | Prepend `<repo>/ml` to `sys.path`; re-export `load_static_model`, `load_motion_model`, `InferenceEngine`, `FrameResult`, and `RESULTS_DIR` (`<repo>/ml/results`). The single seam between `backend/` and `ml/`. |
| `backend/app/prediction.py` | Create | `PredictionService`: loads both models once (`.load()`), `.new_engine()` per connection, `.models_info()` and `.metrics()` payload builders. Pure Python + `json`; no FastAPI import. |
| `backend/app/main.py` | Create | `create_app(service=None) -> FastAPI` with lifespan model-load, `GET /health` `/models` `/metrics`, `WS /ws/predict`, `_valid_landmarks` / `_to_tuples` helpers, per-connection fps window. Module-level `app = create_app()` for `uvicorn app.main:app`. |
| `backend/pytest.ini` | Create | `[pytest]` + `pythonpath = .` so `from app.main import ...` resolves when running from `backend/`. |
| `backend/tests/__init__.py` | Create | Empty. |
| `backend/tests/conftest.py` | Create | `fake_service` fixture + `FakeStatic` / `FakeMotion` / landmark-frame helpers shared by the REST and WS tests. |
| `backend/tests/test_ml_bridge.py` | Create | The bridge re-exports the four names; `InferenceEngine` constructs through it. |
| `backend/tests/test_prediction.py` | Create | `PredictionService` with fakes: independent engines, `models_info()` shape, `metrics()` reads files + missing-file degradation. |
| `backend/tests/test_rest.py` | Create | `TestClient(create_app(service=fake))` → `/health`, `/models`, `/metrics`; one skipif-guarded real-load smoke. |
| `backend/tests/test_ws.py` | Create | `_valid_landmarks` units; `websocket_connect` scripted-commit event assertions; malformed-frame handling; two-connection isolation. |
| `backend/README.md` | Create | How to run (`cd backend && uvicorn app.main:app --reload`), endpoint list, the WS schema, test command, the `motion_metrics.json` regen note. |
| `ml/model_loader.py` | Modify | Add `StaticPredictor.algorithm` + `.feature_set` and `MotionPredictor.algorithm` read-only properties (the only `ml/` change this phase). |
| `ml/tests/test_model_loader.py` | Modify | Cover the three new properties. |
| `DECISIONS.md` | Modify | Append `[Phase 4]` entries: payload direction confirmed; the outbound WS schema (verbatim); the `sys.path` bridge choice; per-connection engine; server-monotonic clock. |
| `HANDOFF.md` | Modify | Status → Phase 4 complete, backend runnable; Phase 5 (frontend shell) next and must match the WS schema. |

---

## Task 1: `ml/` predictor accessors + `backend/app/` bridge & test scaffold

**Files:**
- Modify: `ml/model_loader.py`
- Modify: `ml/tests/test_model_loader.py`
- Create: `backend/app/__init__.py`, `backend/app/_ml_bridge.py`, `backend/pytest.ini`, `backend/tests/__init__.py`
- Test: `backend/tests/test_ml_bridge.py`

**Interfaces:**
- Consumes: `ml/model_loader.py`'s existing `StaticPredictor` (has `_model`, `_feature_set`, `classes`), `MotionPredictor` (has `_model`, `classes`); `ml/inference.py`'s `InferenceEngine`, `FrameResult`.
- Produces (Tasks 2–4 rely on these):
  - `StaticPredictor.algorithm -> str` (== `type(self._model).__name__`), `StaticPredictor.feature_set -> str` (== `self._feature_set`), `MotionPredictor.algorithm -> str`.
  - `backend/app/_ml_bridge.py` exporting: `load_static_model`, `load_motion_model` (callables, no-arg → default `<repo>/ml/models/*.pkl`), `InferenceEngine`, `FrameResult`, `RESULTS_DIR` (a `pathlib.Path` == `<repo>/ml/results`).

- [ ] **Step 1: Write the failing tests**

Append to `ml/tests/test_model_loader.py`:

```python
def test_static_predictor_exposes_algorithm_and_feature_set():
    fake = _FakeSklearnModel(["A", "B"])
    pred = StaticPredictor(model=fake, feature_set="engineered", classes=["A", "B"])
    assert pred.algorithm == "_FakeSklearnModel"
    assert pred.feature_set == "engineered"


def test_motion_predictor_exposes_algorithm():
    fake = _FakeSklearnModel(["J", "Z", "negative"])
    pred = MotionPredictor(model=fake, classes=["J", "Z", "negative"])
    assert pred.algorithm == "_FakeSklearnModel"
```

Create `backend/tests/test_ml_bridge.py`:

```python
from app._ml_bridge import (
    RESULTS_DIR,
    FrameResult,
    InferenceEngine,
    load_motion_model,
    load_static_model,
)


class _FakeStatic:
    classes = ["A"]

    def predict(self, landmarks):
        return ("A", 1.0)


class _FakeMotion:
    classes = ["J", "Z", "negative"]

    def predict(self, frames):
        return ("negative", 1.0)


def test_bridge_reexports_are_callable_and_constructible():
    assert callable(load_static_model)
    assert callable(load_motion_model)
    engine = InferenceEngine(_FakeStatic(), _FakeMotion())
    result = engine.process_frame(None, 0.0)
    assert isinstance(result, FrameResult)
    assert result.committed_letter is None


def test_results_dir_points_at_ml_results():
    assert RESULTS_DIR.name == "results"
    assert RESULTS_DIR.parent.name == "ml"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ml && python -m pytest tests/test_model_loader.py -q` → 2 new FAIL (`AttributeError: 'StaticPredictor' object has no attribute 'algorithm'`).
Run: `cd backend && python -m pytest tests/test_ml_bridge.py -q` → FAIL (`ModuleNotFoundError: No module named 'app'` — `pytest.ini` and package files don't exist yet).

- [ ] **Step 3: Implement**

In `ml/model_loader.py`, add to `StaticPredictor` (after `__init__`):

```python
    @property
    def algorithm(self):
        return type(self._model).__name__

    @property
    def feature_set(self):
        return self._feature_set
```

and to `MotionPredictor` (after `__init__`):

```python
    @property
    def algorithm(self):
        return type(self._model).__name__
```

Create `backend/app/__init__.py` (empty).

Create `backend/pytest.ini`:

```ini
[pytest]
pythonpath = .
testpaths = tests
```

Create `backend/tests/__init__.py` (empty).

Create `backend/app/_ml_bridge.py`:

```python
"""The one seam between backend/ and ml/.

ml/ has no __init__.py and uses bare sibling imports (`from features_static
import ...`), so it can't be imported as a package. Rather than repackage it,
we prepend <repo>/ml to sys.path and re-export what the backend needs. The
[Phase 0] DECISIONS entry sanctions this as the alternative to a root
pyproject.toml + `pip install -e .`. Keep every ml/ import in the backend
going through this module.
"""
import sys
from pathlib import Path

_ML_DIR = Path(__file__).resolve().parents[2] / "ml"
if str(_ML_DIR) not in sys.path:
    sys.path.insert(0, str(_ML_DIR))

from inference import FrameResult, InferenceEngine  # noqa: E402
from model_loader import load_motion_model, load_static_model  # noqa: E402

RESULTS_DIR = _ML_DIR / "results"

__all__ = [
    "FrameResult",
    "InferenceEngine",
    "RESULTS_DIR",
    "load_motion_model",
    "load_static_model",
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ml && python -m pytest tests/test_model_loader.py -q` → all pass (8 prior + 2 new; the resample-pin test from the Phase 3 fix wave stays green).
Run: `cd ml && python -m pytest tests/ -q` → full ML suite still green (was 89; now 91).
Run: `cd backend && python -m pytest tests/ -q` → 3 pass.

- [ ] **Step 5: Commit**

```bash
git add ml/model_loader.py ml/tests/test_model_loader.py backend/app/__init__.py backend/app/_ml_bridge.py backend/pytest.ini backend/tests/__init__.py backend/tests/test_ml_bridge.py
git commit -m "Phase 4: ml/ predictor accessors + backend sys.path bridge and test scaffold"
```

---

## Task 2: `backend/app/prediction.py` — `PredictionService`

**Files:**
- Create: `backend/app/prediction.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_prediction.py`

**Interfaces:**
- Consumes: `app._ml_bridge` (`load_static_model`, `load_motion_model`, `InferenceEngine`, `RESULTS_DIR`).
- Produces (Tasks 3–4 rely on these):
  - `class PredictionService`:
    - `__init__(self, static_predictor, motion_predictor)`
    - classmethod `load() -> PredictionService` — calls `load_static_model()` / `load_motion_model()` (no args).
    - `new_engine() -> InferenceEngine` — a fresh `InferenceEngine(self._static, self._motion)` every call.
    - `models_info() -> dict` — `{"static": {"algorithm", "feature_set", "classes": [...], "test_accuracy": float | None}, "motion": {"algorithm", "classes": [...], "test_accuracy": float | None}}`.
    - `metrics() -> dict` — `{"static": <list>, "motion": <list>}`; if a file is missing, that value is `[]` and the dict also carries `"missing": [<names>]` and `"hint": <str>`.
  - `STATIC_METRICS_PATH`, `MOTION_METRICS_PATH` (module-level `Path`s under `RESULTS_DIR`).
- `backend/tests/conftest.py` produces the fixtures `FakeStatic`, `FakeMotion`, `fake_service`, `landmark_frame` (see Step 1) — reused by Tasks 3 and 4.

- [ ] **Step 1: Write `conftest.py` and the failing test**

Create `backend/tests/conftest.py`:

```python
import pytest


class FakeStatic:
    """Scripted static predictor. Returns a fixed (label, confidence)."""

    algorithm = "FakeStatic"
    feature_set = "engineered"
    classes = ["A", "B", "C"]

    def __init__(self, label="A", confidence=0.9):
        self._ret = (label, confidence)

    def predict(self, landmarks):
        return self._ret


class FakeMotion:
    """Scripted motion predictor. Returns a fixed (label, confidence)."""

    algorithm = "FakeMotion"
    classes = ["J", "Z", "negative"]

    def __init__(self, label="negative", confidence=0.2):
        self._ret = (label, confidence)

    def predict(self, frames):
        return self._ret


@pytest.fixture
def fake_service():
    from app.prediction import PredictionService

    return PredictionService(FakeStatic(), FakeMotion())


@pytest.fixture
def landmark_frame():
    """A well-formed 21x3 landmark frame as nested lists (JSON-shaped)."""
    def _make(cx=0.5, cy=0.5):
        return [[cx + 0.001 * i, cy + 0.001 * i, 0.0] for i in range(21)]

    return _make
```

Create `backend/tests/test_prediction.py`:

```python
import json

from app.prediction import PredictionService
from tests.conftest import FakeMotion, FakeStatic


def test_new_engine_returns_independent_instances():
    svc = PredictionService(FakeStatic(), FakeMotion())
    a = svc.new_engine()
    b = svc.new_engine()
    assert a is not b
    assert a._buffer is not b._buffer
    # driving one engine must not touch the other's buffer
    a.process_frame([[0.5, 0.5, 0.0]] * 21, 0.0)
    assert len(a._buffer) == 1
    assert len(b._buffer) == 0


def test_models_info_shape():
    svc = PredictionService(FakeStatic(), FakeMotion())
    info = svc.models_info()
    assert info["static"]["algorithm"] == "FakeStatic"
    assert info["static"]["feature_set"] == "engineered"
    assert info["static"]["classes"] == ["A", "B", "C"]
    assert info["motion"]["algorithm"] == "FakeMotion"
    assert info["motion"]["classes"] == ["J", "Z", "negative"]
    assert "test_accuracy" in info["static"] and "test_accuracy" in info["motion"]


def test_metrics_reads_files_when_present(tmp_path, monkeypatch):
    static_rows = [{"model": "random_forest", "feature_set": "engineered", "test_accuracy": 0.994}]
    motion_rows = [{"model": "random_forest", "test_accuracy": 0.893}]
    (tmp_path / "metrics.json").write_text(json.dumps(static_rows))
    (tmp_path / "motion_metrics.json").write_text(json.dumps(motion_rows))
    monkeypatch.setattr("app.prediction.STATIC_METRICS_PATH", tmp_path / "metrics.json")
    monkeypatch.setattr("app.prediction.MOTION_METRICS_PATH", tmp_path / "motion_metrics.json")

    svc = PredictionService(FakeStatic(), FakeMotion())
    m = svc.metrics()
    assert m["static"] == static_rows
    assert m["motion"] == motion_rows
    assert "missing" not in m


def test_metrics_degrades_when_files_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.prediction.STATIC_METRICS_PATH", tmp_path / "nope.json")
    monkeypatch.setattr("app.prediction.MOTION_METRICS_PATH", tmp_path / "nope2.json")
    svc = PredictionService(FakeStatic(), FakeMotion())
    m = svc.metrics()
    assert m["static"] == [] and m["motion"] == []
    assert set(m["missing"]) == {"metrics.json", "motion_metrics.json"}
    assert "hint" in m


def test_models_info_test_accuracy_from_metrics(tmp_path, monkeypatch):
    (tmp_path / "metrics.json").write_text(json.dumps(
        [{"model": "svm", "test_accuracy": 0.85}, {"model": "random_forest", "test_accuracy": 0.99}]
    ))
    (tmp_path / "motion_metrics.json").write_text(json.dumps([{"model": "random_forest", "test_accuracy": 0.893}]))
    monkeypatch.setattr("app.prediction.STATIC_METRICS_PATH", tmp_path / "metrics.json")
    monkeypatch.setattr("app.prediction.MOTION_METRICS_PATH", tmp_path / "motion_metrics.json")
    svc = PredictionService(FakeStatic(), FakeMotion())
    info = svc.models_info()
    assert info["static"]["test_accuracy"] == 0.99
    assert info["motion"]["test_accuracy"] == 0.893
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_prediction.py -q` → FAIL (`ModuleNotFoundError: No module named 'app.prediction'`).

- [ ] **Step 3: Implement `backend/app/prediction.py`**

```python
"""Loads the static + motion classifiers once per process and hands out a
fresh InferenceEngine per WebSocket connection so each client's rolling
buffer / smoother / gate state is isolated (Phase 4 acceptance criterion).
The predictor objects themselves are stateless and shared.
"""
from __future__ import annotations

import json

from app._ml_bridge import (
    RESULTS_DIR,
    InferenceEngine,
    load_motion_model,
    load_static_model,
)

STATIC_METRICS_PATH = RESULTS_DIR / "metrics.json"
MOTION_METRICS_PATH = RESULTS_DIR / "motion_metrics.json"

_METRICS_HINT = (
    "run `python ml/train_static.py` / `python ml/train_motion.py` to regenerate"
)


def _read_json_list(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def _best_accuracy(rows):
    accs = [r["test_accuracy"] for r in rows if isinstance(r, dict) and "test_accuracy" in r]
    return max(accs) if accs else None


class PredictionService:
    def __init__(self, static_predictor, motion_predictor):
        self._static = static_predictor
        self._motion = motion_predictor

    @classmethod
    def load(cls) -> "PredictionService":
        return cls(load_static_model(), load_motion_model())

    def new_engine(self) -> InferenceEngine:
        return InferenceEngine(self._static, self._motion)

    def models_info(self) -> dict:
        static_rows = _read_json_list(STATIC_METRICS_PATH) or []
        motion_rows = _read_json_list(MOTION_METRICS_PATH) or []
        return {
            "static": {
                "algorithm": self._static.algorithm,
                "feature_set": self._static.feature_set,
                "classes": list(self._static.classes),
                "test_accuracy": _best_accuracy(static_rows),
            },
            "motion": {
                "algorithm": self._motion.algorithm,
                "classes": list(self._motion.classes),
                "test_accuracy": _best_accuracy(motion_rows),
            },
        }

    def metrics(self) -> dict:
        static_rows = _read_json_list(STATIC_METRICS_PATH)
        motion_rows = _read_json_list(MOTION_METRICS_PATH)
        missing = []
        if static_rows is None:
            missing.append("metrics.json")
            static_rows = []
        if motion_rows is None:
            missing.append("motion_metrics.json")
            motion_rows = []
        out = {"static": static_rows, "motion": motion_rows}
        if missing:
            out["missing"] = missing
            out["hint"] = _METRICS_HINT
        return out
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_prediction.py -q` → all pass.
Run: `cd backend && python -m pytest tests/ -q` → all green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/prediction.py backend/tests/conftest.py backend/tests/test_prediction.py
git commit -m "Phase 4: PredictionService — load models once, per-connection engines, metrics payloads"
```

---

## Task 3: `backend/app/main.py` — FastAPI app + REST endpoints

**Files:**
- Create: `backend/app/main.py`
- Test: `backend/tests/test_rest.py`

**Interfaces:**
- Consumes: `app.prediction.PredictionService`.
- Produces (Task 4 extends `main.py` with the WS route; Phase 5 hits these endpoints):
  - `create_app(service: PredictionService | None = None) -> FastAPI` — if `service` is given, use it and skip the lifespan load; else the lifespan calls `PredictionService.load()` and stores it on `app.state.service`.
  - Module-level `app = create_app()` for `uvicorn app.main:app`.
  - `GET /health` → `{"status": "ok"}` (200).
  - `GET /models` → `app.state.service.models_info()`.
  - `GET /metrics` → `app.state.service.metrics()`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_rest.py`:

```python
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.prediction import PredictionService
from tests.conftest import FakeMotion, FakeStatic

_STATIC_PKL = Path(__file__).resolve().parents[2] / "ml" / "models" / "static_model.pkl"
_MOTION_PKL = Path(__file__).resolve().parents[2] / "ml" / "models" / "motion_model.pkl"


@pytest.fixture
def client():
    app = create_app(service=PredictionService(FakeStatic(), FakeMotion()))
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_models(client):
    r = client.get("/models")
    assert r.status_code == 200
    body = r.json()
    assert body["static"]["algorithm"] == "FakeStatic"
    assert body["static"]["feature_set"] == "engineered"
    assert body["motion"]["classes"] == ["J", "Z", "negative"]


def test_metrics(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    body = r.json()
    assert "static" in body and "motion" in body
    assert isinstance(body["static"], list) and isinstance(body["motion"], list)


def test_create_app_without_service_is_lazy(monkeypatch):
    # create_app() with no service must not load models at construction time
    called = {"n": 0}

    def _boom():
        called["n"] += 1
        raise AssertionError("should not load until lifespan")

    monkeypatch.setattr("app.prediction.PredictionService.load", staticmethod(_boom))
    create_app()  # constructing the app must not call .load()
    assert called["n"] == 0


@pytest.mark.skipif(
    not (_STATIC_PKL.exists() and _MOTION_PKL.exists()),
    reason="real model .pkl files not present (gitignored / regenerable)",
)
def test_real_model_load_smoke():
    app = create_app()  # real lifespan load
    with TestClient(app) as c:
        assert c.get("/health").json() == {"status": "ok"}
        info = c.get("/models").json()
        assert len(info["static"]["classes"]) == 24
        assert info["static"]["feature_set"] == "engineered"
        assert info["motion"]["classes"] == ["J", "Z", "negative"]
        assert info["static"]["test_accuracy"] is not None
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_rest.py -q` → FAIL (`ModuleNotFoundError: No module named 'app.main'`).

- [ ] **Step 3: Implement `backend/app/main.py`**

```python
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
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_rest.py -q` → all pass (`test_real_model_load_smoke` runs locally, would skip on a fresh clone).
Run: `cd backend && python -m pytest tests/ -q` → all green.

- [ ] **Step 5: Manual smoke (optional, ~5s)**

Run: `cd backend && python -c "from app.main import app; print([r.path for r in app.routes])"` → lists `/health`, `/models`, `/metrics`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_rest.py
git commit -m "Phase 4: FastAPI app + /health /models /metrics REST endpoints"
```

---

## Task 4: `/ws/predict` WebSocket endpoint

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_ws.py`

**Interfaces:**
- Consumes: `app.state.service` (a `PredictionService`), `PredictionService.new_engine()`, `InferenceEngine.process_frame(landmarks, now_ms) -> FrameResult`.
- Produces: `WS /ws/predict` per the **Outbound WebSocket message schema** section above. Adds two module-level helpers to `main.py`: `_valid_landmarks(value) -> bool`, `_to_tuples(value) -> list[tuple] | None`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ws.py`:

```python
import pytest
from fastapi.testclient import TestClient

from app.main import _to_tuples, _valid_landmarks, create_app
from app.prediction import PredictionService
from tests.conftest import FakeMotion, FakeStatic


def _frame(cx=0.5, cy=0.5):
    return [[cx + 0.001 * i, cy + 0.001 * i, 0.0] for i in range(21)]


# --- _valid_landmarks units -------------------------------------------------
def test_valid_landmarks_accepts_none_and_21_triples():
    assert _valid_landmarks(None) is True
    assert _valid_landmarks(_frame()) is True


def test_valid_landmarks_rejects_wrong_shapes():
    assert _valid_landmarks([[0.0, 0.0, 0.0]] * 20) is False   # 20 points
    assert _valid_landmarks([[0.0, 0.0]] * 21) is False        # 2-tuples
    assert _valid_landmarks("nope") is False
    assert _valid_landmarks([[0.0, 0.0, "x"]] * 21) is False   # non-numeric


def test_to_tuples_roundtrip():
    assert _to_tuples(None) is None
    out = _to_tuples(_frame())
    assert len(out) == 21 and isinstance(out[0], tuple) and len(out[0]) == 3


# --- WebSocket behaviour --------------------------------------------------
@pytest.fixture
def ws_app():
    # static always "A" @0.95; motion never fires (negative)
    return create_app(service=PredictionService(FakeStatic("A", 0.95), FakeMotion("negative", 0.1)))


def test_ws_emits_one_message_per_frame_with_schema(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"landmarks": _frame(), "t": 1730000000000})
            msg = ws.receive_json()
    assert set(msg) == {
        "prediction", "confidence", "source", "static_label",
        "static_confidence", "motion_active", "fps", "timestamp", "client_timestamp",
    }
    assert msg["static_label"] == "A"
    assert msg["static_confidence"] == 0.95
    assert msg["motion_active"] is False
    assert msg["client_timestamp"] == 1730000000000
    assert msg["prediction"] is None  # not stable yet on frame 1


def test_ws_commits_static_letter_after_stability_window(ws_app):
    # StaticSmoother needs the majority stable >= 500 ms; server clock is
    # monotonic wall-time, so send enough frames across real time. Instead of
    # sleeping, send many frames quickly and assert a commit eventually lands
    # — TestClient runs them fast, so rely on the smoother's frame-count path.
    committed = []
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            for _ in range(60):
                ws.send_json({"landmarks": _frame()})
                m = ws.receive_json()
                if m["prediction"] is not None:
                    committed.append((m["prediction"], m["source"], m["confidence"]))
    assert ("A", "static", 0.95) in committed


def test_ws_malformed_frame_returns_error_and_keeps_connection(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"landmarks": [[0.0, 0.0, 0.0]] * 5})
            err = ws.receive_json()
            assert "error" in err and "timestamp" in err
            # connection still usable
            ws.send_json({"landmarks": None})
            ok = ws.receive_json()
            assert ok["static_label"] is None and "error" not in ok


def test_ws_connections_are_isolated(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws1, c.websocket_connect("/ws/predict") as ws2:
            # feed ws1 many frames so its smoother is primed
            for _ in range(40):
                ws1.send_json({"landmarks": _frame()})
                ws1.receive_json()
            # ws2's very first frame must still be a fresh "not stable yet"
            ws2.send_json({"landmarks": _frame()})
            first = ws2.receive_json()
            assert first["prediction"] is None
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ws.py -q` → FAIL (`ImportError: cannot import name '_valid_landmarks' from 'app.main'`).

- [ ] **Step 3: Implement — add to `backend/app/main.py`**

Add imports at the top:

```python
import time
from collections import deque

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
```

Add module-level helpers and the constant (below the imports, above `create_app`):

```python
_FPS_WINDOW_SECONDS = 1.0


def _valid_landmarks(value) -> bool:
    if value is None:
        return True
    if not isinstance(value, list) or len(value) != 21:
        return False
    for pt in value:
        if not isinstance(pt, list) or len(pt) != 3:
            return False
        if not all(isinstance(c, (int, float)) and not isinstance(c, bool) for c in pt):
            return False
    return True


def _to_tuples(value):
    if value is None:
        return None
    return [tuple(pt) for pt in value]
```

Inside `create_app`, after the `/metrics` route and before `return app`, add:

```python
    @app.websocket("/ws/predict")
    async def ws_predict(websocket: WebSocket):
        await websocket.accept()
        engine = websocket.app.state.service.new_engine()
        recv_times: deque[float] = deque()
        try:
            while True:
                msg = await websocket.receive_json()
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
```

> Note on `test_ws_commits_static_letter_after_stability_window`: `StaticSmoother` commits when the majority label has held `>= STATIC_STABLE_MS` (500 ms) of **monotonic** time. `TestClient` sends frames far faster than real time, so 60 rapid frames span well under 500 ms and **no commit will land**. This test as written in Step 1 will FAIL. Fix it in Step 3 by making the smoother's clock advance deterministically: inject a smoother with a tiny `stable_ms`, or drive `time.monotonic` via monkeypatch. Simplest: in the test, `monkeypatch` a counter clock —
>
> ```python
> def test_ws_commits_static_letter_after_stability_window(ws_app, monkeypatch):
>     ticks = iter(range(0, 10_000, 40))  # 40 ms per frame, monotonic
>     monkeypatch.setattr("app.main.time.monotonic", lambda: next(ticks) / 1000.0)
>     committed = []
>     with TestClient(ws_app) as c:
>         with c.websocket_connect("/ws/predict") as ws:
>             for _ in range(40):
>                 ws.send_json({"landmarks": _frame()})
>                 m = ws.receive_json()
>                 if m["prediction"] is not None:
>                     committed.append((m["prediction"], m["source"], m["confidence"]))
>     assert ("A", "static", 0.95) in committed
> ```
>
> Apply that monkeypatched version in Step 1 (replace the placeholder body). The other WS tests don't need it — they only assert frame-1 behaviour or error handling.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ws.py -q` → all pass.
Run: `cd backend && python -m pytest tests/ -q` → all green.
Run: `cd ml && python -m pytest tests/ -q` → still 91, unaffected.

- [ ] **Step 5: Manual smoke (optional)**

```bash
cd backend && uvicorn app.main:app --port 8000 &
sleep 2
curl -s localhost:8000/health
curl -s localhost:8000/models
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_ws.py
git commit -m "Phase 4: /ws/predict WebSocket endpoint — per-connection engine, landmark frames, prediction events"
```

---

## Task 5: Documentation — `DECISIONS.md`, `HANDOFF.md`, `backend/README.md`

**Files:**
- Modify: `DECISIONS.md`
- Modify: `HANDOFF.md`
- Create: `backend/README.md`
- Test: none (docs).

- [ ] **Step 1: Append `[Phase 4]` entries to `DECISIONS.md`**

Match the existing `## [Phase N] <title>` / `Decided:` / `Why:` / `Affects:` format. Cover:

1. **WebSocket payload direction — landmarks, client-side extraction.** The browser runs MediaPipe and sends landmark frames (`{"landmarks": [[x,y,z] ×21] | null, "t": <int>}`); the backend never touches `cv2`/`mediapipe`. Confirms the note recorded pre-emptively in `[Phase 3]`. Affects: Phase 5's webcam component must run MediaPipe Hands in-browser and emit this exact shape.
2. **Outbound prediction-event schema** — paste the full field table from this plan's "Outbound WebSocket message schema" section verbatim. One message per received frame. Affects: Phase 5 reads `static_label`/`static_confidence`/`motion_active`/`fps` for the corner readout and reacts to `prediction`/`source` for commits.
3. **`sys.path` bridge, not repackaging.** `backend/app/_ml_bridge.py` prepends `<repo>/ml` to `sys.path`. Chosen over a root `pyproject.toml` + `pip install -e .` to avoid converting `ml/`'s bare sibling imports and destabilising its `cd ml && pytest` workflow. Affects: Phase 9's `Dockerfile.backend` must `COPY` both `backend/` and `ml/` so the relative `parents[2]/"ml"` path resolves in the image; if `ml/` is ever repackaged, delete the bridge.
4. **One `InferenceEngine` per WebSocket connection; models loaded once per process.** `PredictionService` (one per process, built in the FastAPI lifespan) holds the two stateless predictors; `.new_engine()` is called on each `/ws/predict` connect. Affects: horizontal scaling is fine (each process self-contained); Phase 6/7's `transcript.py` / `race.py` attach to the same per-connection engine.
5. **Server owns smoother/gate timing.** `process_frame` is fed `time.monotonic() * 1000` measured server-side at receive; the client `t` is echoed as `client_timestamp` only. Affects: prediction stability is independent of client clock skew / frame-send jitter.
6. **`GET /metrics` degradation.** If `ml/results/metrics.json` or `motion_metrics.json` is absent (fresh clone, no training run), the endpoint returns that key as `[]` plus `missing` + `hint`. Affects: Phase 10 CI and Phase 9 Docker must run the training scripts (or ship the JSON) for full `/metrics` output.

- [ ] **Step 2: Update `HANDOFF.md`**

Update `**Last updated:**` and the status section: Phase 4 complete — `backend/app/` (`_ml_bridge.py`, `prediction.py`, `main.py`) serves `/health`, `/models`, `/metrics`, and `WS /ws/predict`; backend test suite green (`cd backend && python -m pytest tests/ -q`); ML suite unchanged at 91 (Task 1 added the 2 predictor-accessor tests). Run locally: `cd backend && uvicorn app.main:app --reload`. Note the one `ml/` change this phase (predictor `algorithm`/`feature_set` properties). Set **Phase 5 (Frontend Shared Shell, Theme & Animation Foundation)** as next, and state that Phase 5's webcam component must run MediaPipe in-browser and match the `/ws/predict` schema logged in `DECISIONS.md [Phase 4]`. Keep the pending **Phase 3 live-webcam acceptance pass** called out as still outstanding. Preserve the push-policy note and the per-phase human-setup list; update the Phase 4 human-needed bullet to "done — backend is script-testable, no human needed".

- [ ] **Step 3: Create `backend/README.md`**

Cover: what it is (the Phase 3 inference engine over HTTP/WS); prerequisites (`.venv` active, `pip install -r backend/requirements.txt`, and `python ml/train_static.py` / `python ml/train_motion.py` run once so `ml/models/*.pkl` + `ml/results/*metrics.json` exist); run (`cd backend && uvicorn app.main:app --reload`, default `http://127.0.0.1:8000`); the endpoint list; the inbound + outbound `/ws/predict` message schemas (copy the tables from this plan); test command (`cd backend && python -m pytest tests/ -q`); and a one-paragraph note that landmark extraction is client-side (browser MediaPipe) — the backend does no image processing.

- [ ] **Step 4: Full-suite sanity**

Run: `cd backend && python -m pytest tests/ -q` and `cd ml && python -m pytest tests/ -q` — both green. `cd backend && python -c "from app.main import app"` — no error.

- [ ] **Step 5: Commit**

```bash
git add DECISIONS.md HANDOFF.md backend/README.md
git commit -m "Phase 4: docs — DECISIONS [Phase 4], handoff, backend README"
```

---

## Final whole-branch review

After all five tasks pass their individual reviews, run one whole-branch review of the full Phase 4 diff (`git diff <phase-4-base>..HEAD`, where the base is the tip before Task 1) on the most capable available model. It caught a Critical cross-commit bug in Phase 3. Focus areas: the `sys.path` bridge behaving under pytest's import modes and under `uvicorn`; per-connection engine isolation actually holding (no shared mutable default args, no module-level engine); the WS loop's exception handling (only `WebSocketDisconnect` should be swallowed — an unexpected error should not silently kill the socket without a trace); `_valid_landmarks` rejecting every malformed shape the frontend could send; and whether `models_info()` reaching for `self._static.algorithm` stays correct against the real `StaticPredictor`. Bundle findings into one fix wave, then a scoped re-review.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**

| Phase 4 spec requirement | Task |
|---|---|
| `backend/app/main.py`: FastAPI app | Task 3 |
| `backend/app/prediction.py`: wraps both model loads + Phase 3 buffering/gating/smoothing, owns per-client rolling buffer | Task 2 (`PredictionService` + `new_engine()`; buffering/gating logic reused from `ml/inference.py` unchanged) |
| Reuse, don't rewrite the Phase 3 logic | Task 1 bridge + Task 2 — `InferenceEngine` imported and used as-is; zero CV/ML reimplementation |
| `/ws/predict`: frontend sends frames **or landmarks — decide and document** | Task 4 (landmarks) + Task 5 DECISIONS entry 1 & 2 |
| Outbound payload `{prediction, confidence, source, fps, timestamp}` + `source: static\|motion` | Task 4 (schema is a superset — adds `static_label`/`static_confidence`/`motion_active`/`client_timestamp` that Phase 5's corner readout needs) |
| `GET /health` | Task 3 |
| `GET /models` — loaded static + motion model info/metrics | Task 3 + Task 2 `models_info()` |
| `GET /metrics` — Phase 2 eval results as JSON | Task 3 + Task 2 `metrics()` |
| One app, clean internal modules, no microservices | Task 3 (`create_app`, one `FastAPI`), enforced in Global Constraints |
| Acceptance: WS client streams frames → correct smoothed events for all 26 letters | Task 4 tests (scripted-commit assertions with fakes; real-model smoke covers the load path — full 26-letter verification is inherently the human Phase 3 live pass, since only real webcam landmarks exercise all 26) |
| Acceptance: each client's rolling buffer isolated | Task 2 `test_new_engine_returns_independent_instances` + Task 4 `test_ws_connections_are_isolated` |
| Log the frames-vs-landmarks decision in DECISIONS.md | Task 5 entry 1 |

No gaps. The one nuance: true "all 26 letters" verification needs real webcam landmarks (the Phase 3 human pass) — Task 4 proves the transport + commit-event plumbing with deterministic fakes and a real-model load smoke, which is the automatable slice the spec itself describes ("even a simple test script").

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases" in steps. The one deliberate call-out is `test_ws_commits_static_letter_after_stability_window` — Step 1 shows a version that would fail under `TestClient`'s fast clock, and Step 3's note gives the exact monkeypatched replacement to use instead. Both halves are shown; the implementer applies the monkeypatched form.

**3. Type consistency:** `PredictionService(static_predictor, motion_predictor)` ctor and `.load()` / `.new_engine()` / `.models_info()` / `.metrics()` are named identically in Task 2's definition, Task 3's consumption, and Task 4's `websocket.app.state.service.new_engine()`. `create_app(service=None)` signature matches between Task 3 definition and Task 4's continued edits and every test. `_valid_landmarks` / `_to_tuples` names match between Task 4 implementation and `test_ws.py` imports. `FrameResult` field names (`committed_letter`, `committed_confidence`, `committed_source`, `static_label`, `static_confidence`, `motion_active`) match Phase 3's dataclass exactly. The bridge's exported names (`load_static_model`, `load_motion_model`, `InferenceEngine`, `FrameResult`, `RESULTS_DIR`) match between Task 1 and their use in Tasks 2–4.
