# SquidSpell Decisions Log

Running log of choices made mid-build that later phases depend on. Every
phase that resolves an open question from the spec appends an entry here
before considering itself done. Format:

## [Phase N] <short decision title>
Decided: <the actual choice>
Why: <1-2 sentences>
Affects: <which later phases/files depend on this>

---

## [Phase 0] Repo location and GitHub account
Decided: Local repo at `~/squidspell` (sibling to other project directories,
independent git repo — the home directory is a separate pre-existing git
repo and never tracks this one). Remote: `rushil-singh24/squidspell`,
public. `gh` CLI active account switched to and left on `rushil-singh24`.
Why: Project owner wants this fully separate from work/other personal repos,
under a dedicated personal GitHub account, public so GitHub Actions minutes
are free and unlimited (Phase 10 needs this).
Affects: Phase 10 (CI/CD), all `git`/`gh` operations going forward.

## [Phase 0] Python version and venv layout
Decided: Python 3.11 (`/opt/homebrew/bin/python3.11`), one shared venv at
repo root (`.venv/`) for both `ml/` and `backend/`, with separate
`ml/requirements.txt` and `backend/requirements.txt` files both installed
into that one venv.
Why: `mediapipe` 1.0.0 ships a universal `py3-none` wheel so 3.11 or 3.12
both work; 3.11 chosen for widest current library compatibility. One venv
because `backend/` will import `ml/`'s feature-engineering and model-loading
code directly (Phase 4) — two venvs would require duplicating packages or
fighting cross-venv imports for no benefit at this scale. Note: a shared
venv makes third-party packages common to both, but does not by itself put
`ml/` on `sys.path` for `backend/` — there is no `ml/__init__.py` or
`pyproject.toml` yet. Phase 4 will need to add a root `pyproject.toml` and
an editable install (`pip install -e .`) — or an equivalent `sys.path`
fix — to actually make `ml` importable from `backend/`; the shared venv is
a prerequisite for that, not the whole solution.
Affects: Phase 2 (training scripts), Phase 4 (backend importing ml/ code),
Phase 9 (Docker — the backend image must install both requirements files).

## [Phase 0] Frontend toolchain
Decided: Vite 8 + React 19 + TypeScript 6 + Tailwind CSS v4 (via the
`@tailwindcss/vite` plugin, no separate PostCSS config file), with
`oxlint` (not ESLint) as the linter — run via `npm run lint`.
Why: Tailwind v4's Vite plugin removes the postcss.config/tailwind.config
boilerplate v3 required — fewer files, same capability, and it's the
current recommended setup for a new Vite project. (React 19 is what
`npm create vite@latest` scaffolds by default as of this build; no reason
to force a downgrade to 18.)
Affects: Phase 5 (theme config lives in `frontend/src/index.css` via `@theme`,
not `tailwind.config.js`), Phase 9 (frontend Docker build step is unchanged:
`npm run build`), Phase 10 (CI lint step must invoke `oxlint`, not `eslint`).
Node version is pinned via `.nvmrc` (22.19.0) and `frontend/package.json`'s
`engines` field, and Phase 9's Docker frontend image must match this Node
major version.

## [Phase 0] ML artifact and data files kept out of git
Decided: `ml/models/*.pkl`, `ml/data/*.csv`, and `ml/data/motion_sequences/`
are gitignored; the directories themselves are kept via `.gitkeep`.
Why: Trained model files and raw per-frame landmark data are regenerable
from the collection/training scripts and would otherwise bloat repo size
with binary/large CSV diffs on every retrain.
Affects: Phase 1 (data collection writes into gitignored paths — expected,
not a bug), Phase 2 (trained `.pkl` files are gitignored — Phase 9's Docker
volume mount is what makes them available to the backend at runtime instead
of a git-tracked file), Phase 11 (README must note that models aren't in git
and how to regenerate them).

## [Phase 1] Data collection constants and per-take file format
Decided: Static capture uses a MediaPipe handedness-score confidence threshold of 0.7
(`is_confident()` in `collection_utils.py`), 200 frames requested per `collect_static.py`
run (spec's 150-300 range), and a 3-second countdown. Motion capture uses a 1.3-second
recording window, resampled to a fixed 20 frames via linear interpolation
(`resample_sequence()`), also with a 3-second countdown; takes with fewer than 2 confident
frames are discarded rather than saved. Each motion take is saved as its own small CSV file
(`<LABEL>_<NNN>.csv`, header = landmark columns only, no label column) rather than one large
combined file, indexed by a `manifest.csv` (label, source, filepath, num_raw_frames,
captured_at) in the same directory.
Why: These were the concrete choices the spec deliberately left open ("e.g., 200", "~1-1.5s",
"a row (or small file)"). Per-take files + a manifest were chosen over one combined file
because Phase 2's training script can load exactly what it needs (label + filepath) without
parsing variable-length embedded sequences out of a single wide CSV, and it makes it trivial
to inspect or delete one bad take without touching the rest of the dataset.
Affects: Phase 2's `ml/train_motion.py` (must read `manifest.csv` to find each take's file,
then load and flatten each `<LABEL>_<NNN>.csv`), `ml/validate_data.py` (already implements
these exact floors: `MIN_STATIC_SAMPLES = 150`, `MIN_MOTION_TAKES = 40`). Two follow-on notes
from the final Phase 1 review: (a) the manifest's `source` column is currently always
identical to `label` — it's reserved for future provenance (e.g. distinguishing multiple
signers) and isn't meaningful today; (b) handedness (left/right) is not recorded anywhere,
so the human doing data collection must sign with one consistent hand throughout — mixing
hands would put mirrored poses into the same class and degrade the trained model.

## [Phase 1] MediaPipe Tasks API migration (post-hoc fix)
Decided: `collect_static.py` and `collect_motion.py` were originally written against the
legacy `mp.solutions.hands.Hands` API. `mediapipe==1.0.0` (the version already pinned in
`ml/requirements.txt`) removed that API entirely in favor of the Tasks API. Both scripts'
`_run_interactive()` now build a `mediapipe.tasks.python.vision.HandLandmarker` in `VIDEO`
running mode (matching the original's cross-frame tracking behavior) from a downloaded
`ml/models/hand_landmarker.task` bundle, addressable via a new `--model-path` flag
(default `ml/models/hand_landmarker.task`). `ml/models/*.task` is gitignored alongside the
existing `*.pkl` rule — same "regenerable artifact" reasoning as the Phase 0 decision above.
Why: This bug was invisible until the project owner actually ran the scripts at a webcam —
Phase 1's 35-test suite deliberately doesn't exercise `_run_interactive()` (hardware-only
code, per the Phase 1 entry above), so the legacy-API call only surfaced as an
`AttributeError: module 'mediapipe' has no attribute 'solutions'` at first live use.
Affects: Anyone re-collecting data or re-running these scripts needs
`ml/models/hand_landmarker.task` present locally first — it is not in git. Phase 3's
standalone inference loop will hit the same legacy-API problem if it copies the old pattern;
it should use the same `HandLandmarker`/`VIDEO`-mode approach instead.

## [Phase 2] Real training run results and winning models
Decided: Trained on the real Phase 1 dataset (24 static letters ~200 samples each, J/Z/negative
motion takes at 46/48/43). `python train_static.py` compared 4 model types (random forest, SVM,
gradient boosting, logistic regression) across 2 feature sets (raw 63-float landmark coordinates
vs. the 40-float engineered features from `features_static.py`), then ran `GridSearchCV` on the
best combination. Winner: **random forest on engineered features**, CV accuracy 0.994, test
accuracy 0.994 (see `ml/results/comparison.md` for the full 8-row table; next best was gradient
boosting/engineered at 0.990 test accuracy, and raw-feature SVM was worst at 0.849). `python
train_motion.py` compared random forest vs. SVM on the 49-float motion-trajectory features.
Winner: **random forest**, test accuracy 0.893, per-class recall J=0.889, Z=1.000,
**negative=0.778** (see `ml/results/motion_comparison.md`). The negative-class recall is lower
than the other two classes; the test split is only ~9 negative takes (20% of 43), so this number
is noisy, but it is the metric to watch. **If Phase 3 live testing shows J/Z false-triggering on
ordinary hand movement, the correct response is collecting more negative takes and retraining —
not tuning thresholds in the inference loop.** Exported
bundles: `ml/models/static_model.pkl` = `{"model", "feature_set", "classes"}` (`feature_set` is
the string `"engineered"`), `ml/models/motion_model.pkl` = `{"model", "classes"}` (no
`feature_set` key — the motion script only ever uses one feature representation). `matplotlib`
(already pinned in `ml/requirements.txt` since the Task 3 commit) is used only for
`ml/results/static_confusion_matrix.png`, a gitignored, regenerable diagnostic plot — no other
code path needs it.
Why: This is the only Phase 2 task that runs against real (not synthetic-fixture) data, so
these are the actual numbers the project will ship with, not projections. Random forest won
both classifiers, which is unsurprising for small, mostly-tabular-feature datasets like these.
Engineered features clearly beat raw landmark coordinates for the static classifier (0.994 vs.
0.987 for random forest, and a much larger gap for weaker models like SVM: 0.941 vs. 0.849) —
confirming the effort put into `features_static.py`'s hand-normalized distances/angles paid off.
Affects: Phase 3 (standalone inference loop) and Phase 4 (backend) must load
`ml/models/static_model.pkl` via `joblib.load(...)` and branch on the loaded dict's
`feature_set` key before calling `.predict()`: if it reads `"engineered"`, run
`extract_static_features()` from `ml/features_static.py` on the raw landmarks first; if it were
ever `"raw"`, feed the flat 63-float landmark list directly. `ml/models/motion_model.pkl` has no
such branch — always run `extract_motion_features()` from `ml/features_motion.py` first. Both
loaders need the same landmark tuple ordering assumption already shared by
`ml/train_static.py`/`ml/train_motion.py` (`(x, y, z)` triples in MediaPipe's 21-landmark index
order) — see `ml/features_static.py`'s `FINGERS`/`FINGERTIPS` constants and
`ml/features_motion.py`'s reuse of `extract_static_features` on `frames[0]`. Three of
`extract_motion_features`'s outputs — `path_length`, `curvature`, and `direction_reversals` — are
frame-count/timebase-sensitive: they were trained exclusively on exactly-20-frame resampled
full-gesture takes (`collection_utils.resample_sequence(raw_take, target_len=20)` over a complete
gesture window), never a fixed-time rolling buffer. Phase 3/4 must first segment the motion, then
call `collection_utils.resample_sequence(segment, target_len=20)` before calling
`extract_motion_features()` — feeding a different frame count or a different capture window will
silently produce out-of-distribution feature values. Phase 3/4 rely on `.predict_proba()` for
confidence scores; the current winners (RandomForest for both) support this, but if a future
retrain ever selects SVM, it must be constructed with `probability=True` or confidence reporting
breaks silently.

**Known limitation — motion trajectory features are not camera-distance invariant.** Indices 0-8
of `extract_motion_features`'s output (net displacement, path length, curvature, reversals, bbox
ratios) are computed from un-normalized landmark centroids — MediaPipe x/y are image-normalized,
so the same physical motion performed at a different distance from the camera yields different
displacement/path-length values. Indices 9-48 (the starting-handshape block, reused from
`features_static`) ARE scale-normalized (divided by wrist-to-middle-MCP distance), so this
asymmetry is isolated to the trajectory sub-block. This is a known plan-level tradeoff, not a bug
— the feature computation itself is unchanged here. Scoped remedy if Phase 3 live testing shows
distance sensitivity: divide the trajectory magnitude features by the per-take hand-size scalar
(`dist(landmarks[0], landmarks[9])` of the take's first frame) before retraining.

Both training scripts now also write a machine-readable metrics artifact —
`ml/results/metrics.json` (static) and `ml/results/motion_metrics.json` (motion) — a JSON dump of
the full per-model/per-feature-set `results` list, for Phase 4's `GET /metrics` endpoint to serve
directly. Both are gitignored (`ml/results/*.json`) and regenerated by rerunning the training
scripts; a fresh clone will not have them until `python train_static.py`/`python train_motion.py`
are run once locally.

## [Phase 3] Inference-loop structure, tuning constants, and the motion start-pose gate
Decided: The live pipeline is split into a pure, hardware-free `ml/inference.py`
(`StaticSmoother`, `MotionGate`, `InferenceEngine`, all unit-tested against fake
predictors and synthetic landmarks) and a thin hardware-bound `ml/live_demo.py`
(webcam + MediaPipe + OpenCV, not unit-tested). Model loading + the
`static_model.pkl` `feature_set` dispatch + the mandatory 20-frame motion
resample are factored into `ml/model_loader.py` (`StaticPredictor` /
`MotionPredictor` / `load_static_model` / `load_motion_model`) so Phase 4's
backend imports it verbatim.

Starting tuning constants (top of `ml/inference.py`), chosen as reasonable
defaults for the live pass, NOT yet validated at a webcam:
- `STATIC_VOTE_WINDOW = 8` frames, `STATIC_STABLE_MS = 500` — majority vote over
  the last 8 per-frame predictions, commit a letter once the majority holds
  ≥500ms. Re-commit only after the majority changes and a new letter stabilises.
  Note: the static smoother's majority vote ignores no-hand (`None`) frames, so a
  letter that has been stable can still commit during the brief window where the
  hand is leaving the frame; benign for practice use and self-correcting once the
  vote window fills with `None`, but flagged here as a known edge for the live pass.
- `MOTION_BUFFER_LEN = 30` frames rolling buffer (~1s at 30fps).
- `MOTION_MOVEMENT_THRESHOLD = 0.15` (image-normalized centroid displacement
  over the buffer) to arm the gate.
- `MOTION_STOP_VELOCITY = 0.02` per-frame centroid delta below which the gesture
  is considered finished → classify.
- `MOTION_MIN_SEGMENT_FRAMES = 5`, `MOTION_MIN_CONFIDENCE = 0.6`,
  `MOTION_START_POSE_CONFIDENCE = 0.5`.
- `MOTION_NO_HAND_ABORT = 3` — while the gate is armed, this many consecutive
  no-hand frames abandons the in-progress gesture (disarm + clear the buffer)
  rather than letting the gate stay wedged until the deque happens to fill.
  Added by the Phase 3 final-review fix wave (a hand that left frame mid-gesture
  previously froze the gate armed, which also suppressed the static path).
- `MOTION_START_POSES = {"I": "J", "D": "Z"}` — the gate only arms if the
  buffer's first frame is classified by the *static* model as `I` (→ gates J)
  or `D` (→ gates Z) above `MOTION_START_POSE_CONFIDENCE`, AND centroid
  displacement exceeds the movement threshold. Rationale: J's starting
  handshape is essentially the static letter `I` (pinky extended) and Z's is
  essentially `D` / index-point; the static model never saw J/Z so this reuses
  what it *did* learn. This is a heuristic precondition, not a hard
  requirement — the motion model's `negative` class is still the primary
  false-trigger defense (see `[Phase 2]`). The gate arms on the `I`/`D` start
  pose but does **not** require the motion model's output letter to match that
  pose — `negative`-class recall + `MOTION_MIN_CONFIDENCE` are the sole
  false-trigger filters. (The plan's Task 3 sketch mentioned recording an
  `_armed_letter = start_poses[label]` for a cross-check; that was intentionally
  dropped and never implemented, consistent with the `[Phase 2]` policy.)
- `FrameResult` carries `committed_confidence: float` alongside
  `committed_letter` / `committed_source`: on a motion commit it is the motion
  model's confidence for the J/Z (previously discarded — the engine hard-coded
  `static_confidence=0.0` on that path), on a static commit it is the smoothed
  letter's per-frame confidence, and `0.0` when nothing committed. Phase 4's
  WebSocket payload needs this.
Why: The spec deliberately left all of these open ("~20 frames", "~500ms", "a
movement threshold"). Keeping them as one clearly-labeled constant block makes
the live tuning pass a single-file edit. The `I`/`D` start-pose map is the one
non-obvious call — flagged here so it's an explicit, revisitable choice.
Affects: The live-webcam verification pass (deferred) will adjust these —
expect `MOTION_MOVEMENT_THRESHOLD` and `MOTION_STOP_VELOCITY` to need the most
tuning since they depend on camera framerate and how close the signer sits.
Phase 4 reuses `ml/model_loader.py` and the `InferenceEngine` logic unchanged;
only the frame *source* (WebSocket vs. webcam) differs. That reuse from
`backend/` first requires the root `pyproject.toml` / editable-install (or
`sys.path`) step already called out in `[Phase 0] Python version and venv
layout` — `ml/` has no `__init__.py` and uses bare sibling imports.

## [Phase 3 follow-up] Trim idle frames before motion classification
Resolved 2026-08-31 — `MotionGate` now trims leading/trailing near-stationary
frames (`_trim_still`, `MOTION_STOP_VELOCITY` threshold) before calling
`motion_predictor.predict`, so the classifier sees the gesture segment not the
full rolling buffer; falls back to the full buffer if trimming leaves < 2
frames. This closes the whole-branch Phase 3 review item where idle approach /
idle hold padding shifted the mandatory 20-frame resample away from the
training distribution and depressed borderline J/Z confidence.

## [Phase 3] WebSocket payload direction (recorded early for Phase 4)
Decided: Deferred to Phase 4, but noting the constraint now: `live_demo.py`
extracts landmarks client-side (in the demo process) and `InferenceEngine`
consumes landmark tuples, never raw images. Phase 4 should keep landmark
extraction on the client (browser MediaPipe) and send landmark frames over the
WebSocket, so the backend's `prediction.py` can wrap `InferenceEngine` with no
change to its input contract. Confirm and log formally in Phase 4.
Affects: Phase 4 (`/ws/predict` payload), Phase 5 (browser webcam component
must run MediaPipe and send landmarks, not frames).

## [Phase 4] WebSocket payload — client-side landmark extraction
Decided: Browser runs MediaPipe Hands and sends landmark frames to `/ws/predict`
as `{"landmarks": [[x,y,z] ×21] | null, "t": <int>}`. The backend never imports
or uses `cv2`/`mediapipe` — it receives pre-extracted landmarks only. This
confirms the constraint pre-recorded in `[Phase 3]`.
Why: Landmark extraction is expensive and must run in-browser (both for latency
and for direct webcam access without sending video to the server). Reusing
`InferenceEngine`'s landmark-based contract keeps the backend logic pure and
unchanged from Phase 3.
Affects: Phase 5's webcam component must run MediaPipe Hands in-browser and
emit this exact schema; `backend/app/` imports nothing from `cv2`/`mediapipe`.

## [Phase 4] Outbound prediction-event schema
Decided: One message per received frame, emitted by `WS /ws/predict` with the
schema below:

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

`fps` is an integer count of frames received in the last 1.0 s (it reads `0`
until at least 2 frames are in the window, so it is unreliable below ~2 fps),
and malformed frames — which get an `{"error": ...}` reply instead of a
prediction event — are not counted toward it.

Why: Phase 5's corner readout needs per-frame confidence + motion-active state
for visual feedback. The `static_label`/`static_confidence` are intermediate
predictions (feed to the static smoother), while `prediction`/`confidence` are
final commits. `fps` indicates client send regularity without trusting the
client's clock. One message per frame keeps the real-time contract tight and
deterministic — no aggregation or batching.
Affects: Phase 5 reads `static_label`/`static_confidence`/`motion_active`/`fps`
for the corner readout and reacts to `prediction`/`source` for gesture commits.

## [Phase 4] `sys.path` bridge, not repackaging
Decided: `backend/app/_ml_bridge.py` appends `<repo>/ml` to `sys.path`
(using `sys.path.append`, not `insert(0)`) and re-exports `load_static_model`,
`load_motion_model`, `InferenceEngine`, `FrameResult`, and `RESULTS_DIR`. This
avoids converting `ml/`'s bare sibling imports (e.g., `from features_static
import ...`) and destabilising its `cd ml && pytest` workflow.
Why: `ml/` has no `__init__.py` and cannot be imported as a package — a root
`pyproject.toml` + `pip install -e .` would require rewriting all `ml/`'s
imports, risking breakage. Appending (not prepending) to `sys.path` ensures that
if `ml/tests/` is ever on the path, it won't shadow `backend/tests/` — the
bridge is the single seam between the two, keeping each self-contained. The
`[Phase 0] Python version and venv layout` DECISIONS entry sanctions this
approach.
Affects: Phase 9's `Dockerfile.backend` must `COPY` both `backend/` and `ml/`
into the image so the relative `parents[2]/"ml"` path in the bridge resolves
correctly. If `ml/` is ever repackaged, this bridge becomes dead code and should
be deleted.

## [Phase 4] One `InferenceEngine` per WebSocket connection; models loaded once per process
Decided: `PredictionService` (one instance per process, built in the FastAPI
lifespan) loads both classifiers once and holds them as stateless, shared
predictor objects. Each incoming `/ws/predict` connection calls
`service.new_engine()` to get a fresh `InferenceEngine`, ensuring each client's
rolling buffer, smoother state, and motion gate are isolated. All connections
in a process share the same model weights (read-only).
Why: Models are large; loading them per-connection is wasteful. Per-connection
engines are small (a deque + two stateless objects). The isolation prevents one
client's gesture state from leaking to another and makes horizontal scaling
straightforward — each process is self-contained.
Affects: Horizontal scaling is fine; Phase 6/7's `transcript.py` / `race.py`
will attach to the same per-connection engine (reusing its buffer and state).

## [Phase 4] Server owns smoother/gate timing
Decided: `InferenceEngine.process_frame(landmarks, now_ms)` is fed
`now_ms = time.monotonic() * 1000.0`, measured server-side at frame receive
time. The client's optional `t` field (inbound timestamp) is echoed back as
`client_timestamp` only — never used for smoother stability windows or motion
gate timing. This makes prediction output independent of client clock skew,
jitter, or out-of-order delivery.
Why: Clients may have poor clocks, variable network latency, or retry-send
frames. Server time is authoritative and stable. The echo of `client_timestamp`
still allows Phase 5 to detect stale frames or out-of-order delivery if needed,
but stability decisions are server-local.
Affects: Prediction stability is decoupled from client-side factors like WiFi
jitter. Phase 5's UI can use `client_timestamp` for debugging or metrics, but
must not use it to override server timing.

## [Phase 4] `GET /metrics` degradation when files missing
Decided: If `ml/results/metrics.json` or `ml/results/motion_metrics.json` is
absent (fresh clone before first training run, or in a Docker image without
the training step), `GET /metrics` returns that key as `[]` plus two metadata
fields: `missing` lists the absent filenames (e.g. `["metrics.json",
"motion_metrics.json"]`), and `hint` is a string telling the caller to run the
two training scripts to regenerate them:

```
run `python ml/train_static.py` / `python ml/train_motion.py` to regenerate
```

The endpoint still returns 200 — no error state, just empty
lists and guidance. A corrupt or truncated JSON file degrades the same way as
a missing one (the read is guarded against `OSError`/`ValueError`).
Why: Metrics are optional; the backend can run without them (e.g., for live
testing before the models are trained). Degrading gracefully with a hint helps
users or CI/CD scripts self-service the missing step without being blocked.
Affects: Phase 10's CI must run the training scripts (or ship pre-trained
`.pkl` files and JSON metrics) for full `/metrics` output. Phase 9's
`Dockerfile.backend` must either run the training commands or use a volume
mount to supply the regenerated JSON files.

## [Phase 5] Client-side MediaPipe, assets served locally
Decided: The browser runs `@mediapipe/tasks-vision`'s `HandLandmarker` in
`VIDEO` running mode and streams `[[x,y,z] ×21] | null` landmark frames over
`/ws/predict`; the backend never touches an image. The WASM runtime and the
`hand_landmarker.task` bundle are copied into `frontend/public/` by
`scripts/copy-mediapipe.mjs` (a dependency-free Node script wired to the
`predev` / `prebuild` / `pretest` npm hooks) from `node_modules/@mediapipe/
tasks-vision/wasm/*` and `ml/models/hand_landmarker.task` — not loaded from a
CDN, so the app works offline and pins one known-good runtime version. The
in-browser detector's confidence parameters mirror the Python side: 0.7
min detection confidence, 0.5 min tracking confidence. `frontend/public/
mediapipe/` and `frontend/public/models/` are gitignored (regenerable — the
copy script rebuilds them).
Why: Landmark extraction is latency-sensitive and keeps raw webcam video off
the network; reusing `InferenceEngine`'s landmark contract (see `[Phase 4]`)
keeps the backend pure. Serving the assets locally avoids a hard runtime
dependency on a third-party CDN and version drift between the JS API and its
WASM.
Affects: Phase 9's `Dockerfile.frontend` must run `scripts/copy-mediapipe.mjs`
during the image build (it needs `ml/models/hand_landmarker.task` present in
the build context). A fresh clone has neither `public/` subdirectory until an
`npm run dev` / `build` / `test` runs the hook.

## [Phase 5] Frontend test stack and gate
Decided: The frontend is unit-tested with Vitest + `@testing-library/react` +
`jsdom`. The per-task gate is `cd frontend && npm run lint && npm test &&
npm run build` (`npm run lint` = `oxlint`, `npm run build` = `tsc -b &&
vite build`). All non-visual logic — WS client and backoff, landmark FPS /
normalise helpers, theme hook, skeleton draw fn, component branching — is
covered here (45 tests at end of Phase 5). Visual layout, animation feel, and
real-webcam behaviour are a human pass, not automated. Vitest resolved to v4,
not the 2.x the plan sketched — the registry lacked the 2.x pin and v4 runs
the same suite unchanged.
Why: The plan's TDD-per-task rule needs a fast headless runner; jsdom covers
everything except the parts a human has to look at or sign in front of.
Affects: Phases 6/7 add their Train/Race tests the same way and keep the same
gate green.

## [Phase 5] One `PredictionClient` per mount; `usePrediction` owns it
Decided: `usePrediction` constructs exactly one `PredictionClient` per mount
and tears it down (socket closed, reconnect timer cleared) on unmount.
Reconnect uses a fixed backoff schedule `[500, 1000, 2000, 5000]` ms (last
value repeats); `close()` stops reconnection for good. One WS message is sent
per landmark frame as `{ landmarks, t }` (`t = Date.now()`), and the inbound
event is consumed field-for-field as the 9-field `PredictionEvent` matching
`[Phase 4]`'s outbound schema. `AppShell` calls `sendLandmarks(hand.landmarks)`
from a single `useEffect` keyed on `[hand.landmarks]` only, so exactly one
send happens per new frame and the subscription is not rebuilt every render.
An inbound message with an `error` key is surfaced (error toast) without
closing the socket.
Why: A single owned client avoids duplicate sockets and reconnect storms; a
bounded backoff keeps a downed backend from being hammered while still
recovering quickly. Keying the send effect on the landmark array alone is what
makes "one send per frame" hold.
Affects: Phases 6/7 read `lastEvent` / `status` from the same `usePrediction`
hook instance — they must not open a second socket.

## [Phase 5] `useTheme` is per-hook state, not a context
Decided: `useTheme` keeps its own state per call site; the shared source of
truth is the `data-theme` attribute on `<html>` (plus `localStorage
["squidspell-theme"]` for persistence), which CSS reads directly. Dark is the
default; the toggle flips to a minimal light palette. `ThemeToggle` is mounted
once, in `AppShell`.
Why: There is a single live theme consumer today (the one toggle), so a
context provider would be ceremony. The DOM attribute already broadcasts the
value to every stylesheet.
Affects: If a later phase needs multiple interactive theme consumers kept in
sync, lift `useTheme` to a context then — the `data-theme` / `localStorage`
contract stays the same.

## [Phase 5] Lottie deferred — mascot is inline SVG + Framer Motion
Decided: The squid mascot (`SquidMascot`) is a hand-built inline SVG with a
`mood` prop (`"idle" | "celebrate" | "sleeping"`) driving Framer-Motion
animation (an idle bob under `mood="idle"`), all `useReducedMotion`-gated. The
design spec's Lottie idle animation is deferred to Phase 11 polish; a CC0
Lottie can replace the component internals later without touching any consumer.
Why: Hand-authoring a Lottie JSON now would be fragile and slow to iterate;
the SVG gives the same interface and ships immediately.
Affects: Phase 11 polish may swap the mascot internals for a Lottie behind the
unchanged `mood` prop.

## [Phase 5] No Vite dev proxy
Decided: The frontend talks to the backend directly — REST via `VITE_API_URL`
(default `http://localhost:8000`), WS via `VITE_WS_URL` (default `ws://
localhost:8000/ws/predict`) — both resolved once in `src/lib/config.ts` and
nowhere else. No `server.proxy` entry in `vite.config.ts`.
Why: The Phase 4 backend's CORS already allows `http://localhost:5173`, so a
dev proxy adds a layer with no benefit, and centralising env access in one
module keeps `import.meta.env` from scattering.
Affects: Phase 9/10 configure the deployed URLs through these two env vars; any
new backend call reads its base URL from `config.ts`.

## [Phase 6] Server-authoritative transcript; mode-parameterized `/ws/predict`
Decided: The client sends `{"mode":"train"|"race"|null}` on connect (and re-sends
it on every reconnect); a `train`-mode connection keeps a per-connection
`TranscriptBuilder` (`backend/app/transcript.py`). Committed letters from the
inference engine and inbound `{"action":"delete"|"space"|"clear"}` messages both
mutate it, and every outbound prediction frame now carries `transcript: str |
null` (the current text for a train connection, `null` otherwise). An unknown
mode or action gets an `{"error": ...}` reply and the socket stays open.
A `train→race` switch, a `race→train` switch, or a WebSocket reconnect starts a
**fresh** transcript — the previous text is discarded server-side (a new
`TranscriptBuilder`) and cleared client-side (`usePrediction.setMode` resets the
local `transcript` string) — so a long-lived transcript must be Saved before
switching modes. The `transcript` field is also currently re-sent in full on
every outbound frame; Phase 7 should switch to change-only / versioned delivery
when it adds race payload to the same envelope. `TranscriptBuilder` caps the
text at `MAX_TRANSCRIPT_CHARS = 2000` (further committed letters are silently
dropped) to bound that per-frame redundancy.
Why: Chosen over a client-side transcript so the same pattern serves Phase 7's
server-side Race scorer and matches the spec's "one FastAPI app, internal modules
(prediction / transcript / race)". Keeping the transcript next to the engine that
produces the commits avoids a second source of truth for what has been signed.
Affects: Phase 7 adds a `race` branch to the same mode switch plus a
`backend/app/race.py` scorer that attaches to the same per-connection engine;
Phase 8's history persistence reads `usePrediction().transcript`.

## [Phase 6] No time-window dedupe in `TranscriptBuilder`
Decided: `commit_letter(letter, ts)` appends the (uppercased) letter
unconditionally — the only guard is an exact byte-identical duplicate frame
(same letter, same timestamp), which is dropped. There is no "ignore a repeat
within N ms" window.
Why: The inference layer already commits a letter only once per stable run
(majority vote held ≥ `STATIC_STABLE_MS`, re-commit only after the majority
changes), so a second dedupe layer here would be redundant — and a time window
would swallow deliberate double letters (LL, SS, EE).
Affects: Nothing downstream. Known limitation: two identical letters signed
faster than the smoother can re-stabilise in the *inference* layer (~500 ms
`STATIC_STABLE_MS`) merge into one — acceptable for v1; the fix, if ever needed,
is a brief "letter released" gap requirement in the smoother, not a timer in
`TranscriptBuilder`.

## [Phase 6] `GESTURE_ACTIONS = {}` — control-gesture poses deferred
Decided: `GESTURE_ACTIONS: dict[str, str]` in `transcript.py` is empty. Delete /
Space / Clear are driven only by on-screen buttons in `TrainPane` this phase.
This entry is the "log the final gesture-to-action mapping in DECISIONS.md" the
Phase 6 spec asks for — the current mapping is deliberately "none; the buttons
are the mechanism".
Why: A pose→action map is only safe once the poses are known to be visually
distinct from the 26 letters, and that judgement needs the Phase 1/2 data
already in hand plus a dedicated pass to pick and validate candidate poses.
Shipping an empty map keeps the seam in place without guessing.
Affects: The `frontend/README.md` Train-mode controls section (documents
gestures as not wired yet); a future data-collection pass that picks the poses.
Wiring a chosen pose is then a one-line `GESTURE_ACTIONS` entry plus a
client-side detector that sends the matching `{"action"}` message.

## [Phase 6] Hold-to-Clear is client-side timing only
Decided: `HoldButton` (`frontend/src/components/HoldButton.tsx`) delays the
`{"action":"clear"}` send by `durationMs` (1000 in `TrainPane`) while showing a
fill indicator; releasing early cancels and sends nothing. The server just
applies `clear` when the message finally arrives — it does no timing. The
on-screen Clear control IS the hold button; there is no separate instant-clear
path.
Why: Clear is the one destructive Train action, so it inherits the
"destructive-action-needs-intent" rule. With no control gesture yet, the button
is the sole clear mechanism, so the intent gate lives on the button. Keeping the
delay client-side keeps the server's action handler a plain switch.
Affects: The `frontend/README.md` Train-mode controls section.

## [Phase 6] Train history is client-only
Decided: Saved Train transcripts live in React `useState` seeded from and mirrored
to `localStorage["squidspell-train-history"]`; every read and write is wrapped in
try/catch so a private window, cleared storage, or a JSON-parse failure degrades
to an empty list rather than throwing. There is no REST endpoint and no server
persistence.
Why: History is a per-device convenience this phase, not shared data. Adding a
backend store now would be throwaway work.
Affects: Phase 8 replaces this with direct Supabase persistence (auth + a
`transcripts` table); the `localStorage` key and shape are the migration
starting point.

## [Phase 7] Server-authoritative Race on the same `/ws/predict` mode switch as Train
Decided: `mode == "race"` gives the connection a per-connection `RaceState`
(`backend/app/race.py`, pure) alongside the existing engine, exactly parallel to
Train's `TranscriptBuilder`. Inbound `{"race":"start","duration":15|30|60}` starts
a round (any other duration → `ValueError` → `{"error": ...}`, socket stays open)
and `{"race":"stop"}` ends one early; a bad or unknown `race` message gets an
`{"error": ...}` reply and the socket stays open. Committed letters from the
inference engine are matched against the current target word server-side — a
correct letter grows the round's `typed`/`correct` counts, a completed word
advances the queue (which auto-extends so `upcoming` never empties), and a wrong
letter counts as an attempt without advancing. `RaceState.tick(now_ms)` runs on
every frame and finalises the round on expiry, so a race ends and produces its
`results` even if the client never sends `{"race":"stop"}` (the client streams
frames continuously). `snapshot(now_ms)` returns the `RaceSnapshot` dict carried
on the outbound frame.
Why: Chosen over a client-side timer/scorer so scoring can't be gamed and so the
same mode-switch pattern serves both game modes — matching the spec's "one FastAPI
app, internal modules (prediction / transcript / race)". Keeping the scorer next
to the engine that produces the commits avoids a second source of truth for what
has been signed.
Affects: Phase 8 persists `race_results` from `usePrediction().race.results`; the
client transport layer needed only a `sendRace('start'|'stop', duration?)`
addition, no second socket.

## [Phase 7] Change-only `transcript` + `race` in the per-frame envelope
Decided: Both `transcript` and `race` in the outbound prediction frame are now
change-only (this closes the delivery item deferred from Phase 6). Each field
carries its current value on the first frame it changes and `null` on every frame
where it did not change; the client keeps its last non-null value for each.
Per-connection `_last_transcript_sent` / `_last_race_sent` trackers hold the last
value emitted and are reset on a mode-switch message so the next frame re-emits
full state (which is also what makes a reconnect recover — `onopen` re-sends
`mode`). To make change detection effective, `RaceState.snapshot()` integer-rounds
the running `spm` (computed from whole elapsed seconds) and `seconds_left`, so a
steady race produces byte-identical snapshot dicts frame to frame and only a real
change re-sends the payload.
Why: Two stateful payloads now share one envelope; re-sending both in full on
every frame (~30/s) is wasteful, and the transcript can be up to
`MAX_TRANSCRIPT_CHARS` long. Change-only keeps the frame small without a version
counter.
Affects: Any future per-connection stateful field on this frame follows the same
pattern (a `_last_*_sent` tracker, reset on mode switch, `null` when unchanged).

## [Phase 7] Consistency metric = `100 * (1 - CoV)`
Decided: The results screen's "consistency" number is `100 * (1 - CoV)` where
`CoV = pstdev(inter-letter gaps) / mean(gaps)` over the timestamps of the letters
signed during the round, clamped to 0..100, and `0.0` when fewer than 2 letters
were signed. 100 means a perfectly even signing cadence; a jittery cadence pulls
it down. It is displayed as a number out of 100.
Why: A single dimensionless evenness score is more legible than raw gap variance
and is duration-independent, so it reads the same for a 15s and a 60s round.
Affects: `frontend/README.md`'s Race-mode section documents it; Phase 8's
`race_results` schema stores it as a number.

## [Phase 7] Personal bests are client-only
Decided: Best SPM per duration lives only in the browser, in
`localStorage["squidspell-race-bests"]` as `{15,30,60 → SPM}`. It is
shape-validated on load — a plain object whose present values are numbers,
anything else falls back to `{}` — and a finished round writes its bucket only
when it beats the stored value.
Why: Bests are a per-device convenience this phase, not shared or authoritative
data; a backend store now would be throwaway work.
Affects: Phase 8 replaces this with a Supabase `race_results` table (and an
optional public leaderboard); the `localStorage` key and shape are the migration
starting point.

## [Phase 7] Word pool is a static curated list
Decided: `RACE_WORDS` in `backend/app/race.py` is a hand-picked list of ~40
common lowercase English words 2-5 letters long. A round starts from a shuffled
copy (seedable for tests) and the queue auto-extends by reshuffling and appending
whenever it nears its end, so `upcoming` never empties for any duration.
Why: A curated short-word list keeps rounds fingerspelling-friendly and avoids a
dictionary dependency or generation logic for v1.
Affects: Phase 8 optionally swaps this for a Supabase-backed word list; the
`RaceState` queue interface stays the same.
