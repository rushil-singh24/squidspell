# SquidSpell Backend — FastAPI + WebSocket Prediction Service

The Phase 3 `InferenceEngine` (static + motion letter classification, smoothing, and gating) served over HTTP and WebSocket. Each client WebSocket connection gets its own isolated rolling buffer and prediction state; the trained models are loaded once per process and shared (read-only).

## Prerequisites

1. `.venv` activated and the shared venv set up:
   ```bash
   source .venv/bin/activate
   ```

2. Backend and ML dependencies installed:
   ```bash
   pip install -r backend/requirements.txt -r ml/requirements.txt
   ```

3. Trained model files and metrics present. Run once locally:
   ```bash
   cd ml
   python train_static.py
   python train_motion.py
   cd ..
   ```
   This generates `ml/models/static_model.pkl`, `ml/models/motion_model.pkl`,
   `ml/results/metrics.json`, and `ml/results/motion_metrics.json` (all gitignored,
   regenerable). A fresh clone will not have these files — they must be created by
   running the training scripts.

## Running the Server

```bash
cd backend
uvicorn app.main:app --reload
```

Default: `http://127.0.0.1:8000`
- OpenAPI interactive UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Endpoints

### REST

- **`GET /health`** — liveness check
  ```json
  {"status": "ok"}
  ```

- **`GET /models`** — loaded model info and test accuracy
  ```json
  {
    "static": {
      "algorithm": "RandomForestClassifier",
      "feature_set": "engineered",
      "classes": ["A", "B", ..., "Y"],
      "test_accuracy": 0.994
    },
    "motion": {
      "algorithm": "RandomForestClassifier",
      "classes": ["J", "Z", "negative"],
      "test_accuracy": 0.893
    }
  }
  ```

- **`GET /metrics`** — phase 2 model evaluation results (full confusion matrices, per-class metrics)
  Returns `{"static": [...], "motion": [...], "missing": [...], "hint": "..."}` if the JSON files
  are absent. Gracefully degrades: empty lists + metadata if files don't exist.

### WebSocket

- **`WS /ws/predict`** — prediction stream
  - **Inbound message** (one per frame):
    ```json
    {
      "landmarks": [[x, y, z], ..., 21 total],
      "t": 1730000000000
    }
    ```
    `landmarks` is a 21×3 array of hand landmarks from MediaPipe (client-extracted, see
    "Landmark Extraction" below). `t` is an optional client-side timestamp (milliseconds).
    Send `landmarks: null` to represent no hand detected in the frame.

  - **Outbound message** (one per received frame):
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
      "client_timestamp": 1730000000000
    }
    ```

    | field | type | meaning |
    |---|---|---|
    | `prediction` | `str \| null` | Committed letter this frame (after smoothing/gating), else `null` |
    | `confidence` | `number` | Confidence of the commit, or `0.0` if no commit |
    | `source` | `"static" \| "motion" \| null` | Which classifier made the commit, or `null` |
    | `static_label` | `str \| null` | Raw per-frame static prediction (intermediate, unsmoothed) |
    | `static_confidence` | `number` | Confidence of the raw static prediction |
    | `motion_active` | `bool` | True if a J/Z motion is mid-flight |
    | `fps` | `int` | Server-measured frame rate over the last 1.0s (0 until ≥2 frames) |
    | `timestamp` | `int` | Server epoch-ms when the frame was processed |
    | `client_timestamp` | `int \| null` | Echo of the inbound `t` field |

  - **Malformed frame** (not 21 [x,y,z] triples and not null):
    ```json
    {
      "error": "invalid landmarks: expected 21 [x,y,z] triples or null",
      "timestamp": 1723452345123
    }
    ```
    The connection remains open; send the next frame.

## Testing

```bash
cd backend
python -m pytest tests/ -q
```

Expected: 19 passing tests
- `test_ml_bridge.py` — bridge re-exports (`load_static_model`, `load_motion_model`, `InferenceEngine`, etc.)
- `test_prediction.py` — `PredictionService` loads models once, hands out fresh engines per call, reads/degrades metrics files
- `test_rest.py` — `/health`, `/models`, `/metrics` return correct shapes; real-model smoke test (skipif models absent)
- `test_ws.py` — landmark validation, WebSocket message schema, per-connection isolation, malformed-frame handling

## Landmark Extraction

**The backend does no image processing.** Landmark extraction (converting raw webcam frames to 21 (x, y, z) coordinates)
is performed client-side by the browser using MediaPipe Hands. Phase 5's webcam component runs the `HandLandmarker`
and sends the resulting 21-point landmark arrays to this endpoint. This design keeps the server stateless, reduces
bandwidth (landmarks are ~1KB vs. frames which are multi-MB), and lets clients control their own image quality and
framerate. The backend imports nothing from `cv2`, `mediapipe`, or any image library — it works only with numeric
landmark tuples.

## Per-Connection Isolation

Every WebSocket client gets its own `InferenceEngine` instance with independent rolling buffers, static smoother
state, and motion gate state. This ensures that one client's gesture sequence does not affect another's. The two
predictor objects (`StaticPredictor`, `MotionPredictor`) are stateless and shared across all connections in the
process; only the `InferenceEngine` instance is per-connection.

## Tuning Constants

The `InferenceEngine`'s smoothing and gating thresholds (static vote window, stability time, motion movement threshold,
etc.) are defined in `ml/inference.py` and are reused unchanged. See `DECISIONS.md`'s `[Phase 3]` entry for the
current values and Phase 3 acceptance criteria. If live testing shows prediction instability, those constants (not this
backend) are the tuning levers.

## Docker and Deployment

See `DECISIONS.md`'s `[Phase 4]` entry on `sys.path` bridging: the backend's relative path `parents[2]/"ml"` expects
both `backend/` and `ml/` to be present at build time. Phase 9's `Dockerfile.backend` must `COPY` both directories.
The trained model `.pkl` files and metrics JSON are gitignored; the Docker image must either run the training scripts
during the build or mount a volume with pre-trained weights.
