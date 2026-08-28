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
- `MOTION_START_POSES = {"I": "J", "D": "Z"}` — the gate only arms if the
  buffer's first frame is classified by the *static* model as `I` (→ gates J)
  or `D` (→ gates Z) above `MOTION_START_POSE_CONFIDENCE`, AND centroid
  displacement exceeds the movement threshold. Rationale: J's starting
  handshape is essentially the static letter `I` (pinky extended) and Z's is
  essentially `D` / index-point; the static model never saw J/Z so this reuses
  what it *did* learn. This is a heuristic precondition, not a hard
  requirement — the motion model's `negative` class is still the primary
  false-trigger defense (see `[Phase 2]`).
Why: The spec deliberately left all of these open ("~20 frames", "~500ms", "a
movement threshold"). Keeping them as one clearly-labeled constant block makes
the live tuning pass a single-file edit. The `I`/`D` start-pose map is the one
non-obvious call — flagged here so it's an explicit, revisitable choice.
Affects: The live-webcam verification pass (deferred) will adjust these —
expect `MOTION_MOVEMENT_THRESHOLD` and `MOTION_STOP_VELOCITY` to need the most
tuning since they depend on camera framerate and how close the signer sits.
Phase 4 reuses `ml/model_loader.py` and the `InferenceEngine` logic unchanged;
only the frame *source* (WebSocket vs. webcam) differs.

## [Phase 3] WebSocket payload direction (recorded early for Phase 4)
Decided: Deferred to Phase 4, but noting the constraint now: `live_demo.py`
extracts landmarks client-side (in the demo process) and `InferenceEngine`
consumes landmark tuples, never raw images. Phase 4 should keep landmark
extraction on the client (browser MediaPipe) and send landmark frames over the
WebSocket, so the backend's `prediction.py` can wrap `InferenceEngine` with no
change to its input contract. Confirm and log formally in Phase 4.
Affects: Phase 4 (`/ws/predict` payload), Phase 5 (browser webcam component
must run MediaPipe and send landmarks, not frames).
