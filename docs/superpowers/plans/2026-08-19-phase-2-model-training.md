# Phase 2: Feature Engineering & Model Training — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two trained, evaluated, exported classifiers — static-letter (24 classes) and motion-letter (J / Z / negative) — plus documented model comparisons, built entirely from the real dataset collected in Phase 1 (`ml/data/static_landmarks.csv`, `ml/data/motion_sequences/`).

**Architecture:** Feature extraction is split into two pure, hardware-free modules (`ml/features_static.py`, `ml/features_motion.py`) that take already-loaded landmark data (never touch cv2/mediapipe/pandas) so they're trivially unit-testable with synthetic fixtures. Two training scripts (`ml/train_static.py`, `ml/train_motion.py`) own I/O (loading CSVs, calling the feature modules, fitting sklearn models, writing results/model files) and expose their core logic as importable functions so tests can run the full pipeline against tiny synthetic datasets instead of the full real one — real-dataset training happens once, for real, in Task 5.

**Tech Stack:** Python 3.11 (repo's shared `.venv`), pandas, NumPy, scikit-learn 1.5.2 (already in `ml/requirements.txt`), Joblib, matplotlib (new — needed for confusion-matrix plots; already an indirect dependency via mediapipe, being added directly since these scripts use it themselves), pytest.

## Global Constraints

- Static letters: exactly `A,B,C,D,E,F,G,H,I,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y` (24 classes).
- Motion labels: exactly `J`, `Z`, `negative` — this is the spec's "J / Z / reject" 3-class task; our actual label string is `negative` (established in Phase 1), so "reject-class recall" in results/reporting means the `negative` class's recall.
- MediaPipe Hands landmark indexing (standard 21-point model): `0`=wrist; thumb=`(1,2,3,4)` (CMC,MCP,IP,TIP); index=`(5,6,7,8)`; middle=`(9,10,11,12)`; ring=`(13,14,15,16)`; pinky=`(17,18,19,20)` (each finger = 4 points, MCP/base→...→TIP). Fingertips = `[4, 8, 12, 16, 20]`.
- Static CSV schema (`ml/data/static_landmarks.csv`): `label,x0,y0,z0,...,x20,y20,z20` (64 columns) — read via pandas.
- Motion data: `ml/data/motion_sequences/manifest.csv` (columns `label,source,filepath,num_raw_frames,captured_at`) indexes per-take files, each a CSV with header `x0,y0,z0,...,x20,y20,z20` (63 columns, no label — one row per resampled frame, fixed length per take, no header row for label since it's single-take/single-label).
- `ml/models/*.pkl` and `ml/results/*.png`/`ml/results/*.json` are gitignored (regenerable artifacts — see `DECISIONS.md`'s Phase 0 entry); `ml/results/*.md` is **not** ignored and must be committed (the human-readable comparison tables the spec's acceptance criteria require).
- Exported `.pkl` files are joblib-dumped **dicts**, not bare sklearn estimators: `{"model": <fitted estimator>, "feature_set": "raw"|"engineered", "classes": [...]}` — Phase 3/4 need to know which feature representation to feed the model at inference time, and there's no other place to record that.
- Run tests with `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/ -v`.
- Every task-ending commit happens on `main` directly (repo convention, one contributor, per Phase 0/1).
- New open decisions (winning model/feature-set per classifier, feature formulas, matplotlib addition) get appended to `DECISIONS.md` in the final task, once — same pattern as Phase 1.
- Full phase detail: `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 2" section — this plan implements only that section.

---

### Task 1: `ml/features_static.py` — engineered static-hand features

**Files:**
- Create: `ml/features_static.py`
- Test: `ml/tests/test_features_static.py`

**Interfaces:**
- Produces: `extract_static_features(landmarks) -> list[float]` (40 floats, fixed order below). `landmarks`: list of 21 `(x, y, z)` tuples, **raw/un-normalized** (as loaded straight from a CSV row) — normalization happens inside this function. Task 2 and Task 3 both import this.

**Feature vector layout (40 values, in this exact order):**
1. **Pairwise fingertip distances (10)** — Euclidean distance, in normalized space, between every pair of `itertools.combinations([4, 8, 12, 16, 20], 2)` (natural order: (4,8),(4,12),(4,16),(4,20),(8,12),(8,16),(8,20),(12,16),(12,20),(16,20)).
2. **Joint angles (10)** — for each finger `(a, b, c, d)` in order thumb/index/middle/ring/pinky: angle at `b` between vectors `(a-b)` and `(c-b)`, then angle at `c` between vectors `(b-c)` and `(d-c)` — 2 angles/finger × 5 fingers, radians.
3. **Finger extension values (5)** — one per finger, in thumb/index/middle/ring/pinky order: `dist(a, d) / (dist(a,b) + dist(b,c) + dist(c,d) + 1e-9)` (straight-line tip distance over summed segment lengths; 1.0 = fully straight, lower = more bent).
4. **Wrist-to-fingertip vectors (15)** — for each tip in `[4, 8, 12, 16, 20]`: its normalized `(x, y, z)` (3 fingertips × 5 = 15). Since normalization translates the wrist to the origin, this is just the tip's normalized coordinate directly — no separate subtraction needed.

**Normalization (applied once, before any of the above):** translate all 21 points so landmark 0 (wrist) is the origin, then scale every coordinate by dividing by `dist(landmarks[0], landmarks[9]) + 1e-9` (wrist→middle-finger-MCP distance) so hand size/distance-from-camera doesn't affect the features.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_features_static.py
import math

import pytest

from features_static import extract_static_features


def _flat_hand():
    """A synthetic hand: wrist at origin, all 5 fingers straight and splayed
    along the xy-plane at different angles, all the same length. Lets us
    assert exact extension (1.0) and exact fingertip-distance/angle values."""
    landmarks = [(0.0, 0.0, 0.0)] * 21
    landmarks[0] = (0.0, 0.0, 0.0)  # wrist
    # middle finger straight up the y-axis: MCP(9), PIP(10), DIP(11), TIP(12)
    landmarks[9] = (0.0, 1.0, 0.0)
    landmarks[10] = (0.0, 2.0, 0.0)
    landmarks[11] = (0.0, 3.0, 0.0)
    landmarks[12] = (0.0, 4.0, 0.0)
    # index finger straight, angled 90 degrees away on the x-axis
    landmarks[5] = (1.0, 0.0, 0.0)
    landmarks[6] = (2.0, 0.0, 0.0)
    landmarks[7] = (3.0, 0.0, 0.0)
    landmarks[8] = (4.0, 0.0, 0.0)
    # thumb, ring, pinky: give them non-degenerate (bent) shapes so
    # normalization's reference distance (wrist->9) and extension both work
    landmarks[1], landmarks[2], landmarks[3], landmarks[4] = (
        (0.5, 0.0, 0.0), (1.0, 0.3, 0.0), (1.3, 0.3, 0.0), (1.3, 0.6, 0.0),
    )
    landmarks[13], landmarks[14], landmarks[15], landmarks[16] = (
        (-1.0, 0.0, 0.0), (-2.0, 0.0, 0.0), (-2.0, 1.0, 0.0), (-2.0, 2.0, 0.0),
    )
    landmarks[17], landmarks[18], landmarks[19], landmarks[20] = (
        (-0.5, 0.0, 0.0), (-1.0, 0.0, 0.0), (-1.0, 0.5, 0.0), (-1.0, 1.0, 0.0),
    )
    return landmarks


def test_extract_static_features_returns_40_floats():
    features = extract_static_features(_flat_hand())
    assert len(features) == 40
    assert all(isinstance(f, float) for f in features)


def test_middle_finger_fully_extended_has_extension_near_one():
    features = extract_static_features(_flat_hand())
    # extension values are features[20:25] in thumb,index,middle,ring,pinky
    # order (FINGERS dict order) -> middle is global index 22
    middle_extension = features[22]
    assert middle_extension == pytest.approx(1.0, abs=1e-6)


def test_middle_index_fingertip_distance_is_normalized_scale():
    features = extract_static_features(_flat_hand())
    # middle(12)-index(8) is the 5th pairwise distance (0-indexed 4) in
    # combinations([4,8,12,16,20], 2) order: (4,8),(4,12),(4,16),(4,20),(8,12),...
    dist_8_12 = features[4]
    # raw distance between (4,0,0) and (0,4,0) is sqrt(32); normalization
    # divides by dist(wrist, landmark 9) = 1.0, so it's unchanged here
    assert dist_8_12 == pytest.approx(math.sqrt(32), rel=1e-4)


def test_straight_finger_joint_angles_are_near_pi():
    features = extract_static_features(_flat_hand())
    # joint angles are features[10:20], 2 per finger in thumb,index,middle,
    # ring,pinky order -> middle's pair is global indices [14, 15]
    middle_angle_1, middle_angle_2 = features[14], features[15]
    assert middle_angle_1 == pytest.approx(math.pi, abs=1e-6)
    assert middle_angle_2 == pytest.approx(math.pi, abs=1e-6)


def test_bent_finger_has_extension_below_one():
    landmarks = _flat_hand()
    # bend the middle finger's DIP joint (11) off to the side instead of
    # straight up, without changing MCP/PIP/TIP
    landmarks[11] = (1.0, 3.0, 0.0)
    features = extract_static_features(landmarks)
    middle_extension = features[22]  # see test above for index derivation
    assert middle_extension < 0.99
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_features_static.py -v`
Expected: FAIL / ERROR — `features_static` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/features_static.py`**

```python
"""Engineered feature extraction for static-letter hand landmarks.

Pure, hardware-free: takes already-loaded 21 (x, y, z) landmark tuples
(e.g. one row of ml/data/static_landmarks.csv) and returns a fixed-order
list of 40 engineered floats. See docs/superpowers/plans/
2026-08-19-phase-2-model-training.md, Task 1, for the exact feature layout
and formula for each of the four feature groups below.
"""
from __future__ import annotations

import itertools
import math

WRIST = 0
FINGERS = {
    "thumb": (1, 2, 3, 4),
    "index": (5, 6, 7, 8),
    "middle": (9, 10, 11, 12),
    "ring": (13, 14, 15, 16),
    "pinky": (17, 18, 19, 20),
}
FINGERTIPS = [4, 8, 12, 16, 20]
EPSILON = 1e-9


def _dist(p, q):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p, q)))


def _sub(p, q):
    return tuple(a - b for a, b in zip(p, q))


def _angle(u, v):
    dot = sum(a * b for a, b in zip(u, v))
    norm = math.sqrt(sum(a * a for a in u)) * math.sqrt(sum(a * a for a in v))
    if norm < EPSILON:
        return 0.0
    return math.acos(max(-1.0, min(1.0, dot / norm)))


def _normalize(landmarks):
    wrist = landmarks[WRIST]
    scale = _dist(wrist, landmarks[9]) + EPSILON
    return [tuple((c - w) / scale for c, w in zip(pt, wrist)) for pt in landmarks]


def extract_static_features(landmarks):
    norm = _normalize(landmarks)

    pairwise_distances = [
        _dist(norm[a], norm[b]) for a, b in itertools.combinations(FINGERTIPS, 2)
    ]

    joint_angles = []
    finger_extensions = []
    for a, b, c, d in FINGERS.values():
        joint_angles.append(_angle(_sub(norm[a], norm[b]), _sub(norm[c], norm[b])))
        joint_angles.append(_angle(_sub(norm[b], norm[c]), _sub(norm[d], norm[c])))
        segment_len = _dist(norm[a], norm[b]) + _dist(norm[b], norm[c]) + _dist(norm[c], norm[d])
        finger_extensions.append(_dist(norm[a], norm[d]) / (segment_len + EPSILON))

    fingertip_vectors = []
    for tip in FINGERTIPS:
        fingertip_vectors.extend(norm[tip])

    return [float(v) for v in (*pairwise_distances, *joint_angles, *finger_extensions, *fingertip_vectors)]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_features_static.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/squidspell && git add ml/features_static.py ml/tests/test_features_static.py
git commit -m "Phase 2: engineered static-hand feature extraction"
```

---

### Task 2: `ml/features_motion.py` — trajectory features for motion sequences

**Files:**
- Create: `ml/features_motion.py`
- Test: `ml/tests/test_features_motion.py`

**Interfaces:**
- Consumes: `features_static.extract_static_features(landmarks) -> list[float]` (Task 1) for the starting-handshape sub-block.
- Produces: `extract_motion_features(frames) -> list[float]` (49 floats, fixed order below). `frames`: list of T resampled frames, each a list of 21 `(x, y, z)` tuples (T = `resample_sequence()`'s `target_len`, default 20 — function must not hardcode T, just use `len(frames)`). Task 4 imports this.

**Feature vector layout (49 values, in this exact order):**
1. **Net displacement (4)** — using the per-frame centroid (mean of all 21 landmarks) as the tracked point: `(dx, dy, dz)` = last centroid − first centroid, then `magnitude` = its Euclidean norm.
2. **Path length (1)** — sum of Euclidean distances between every pair of consecutive centroids.
3. **Curvature (1)** — `path_length / (net_displacement_magnitude + 1e-9)` — 1.0 means a perfectly straight path; higher means the path curved/looped relative to its net displacement (separates J's hook from a straight stroke).
4. **Direction reversals (1)** — count of consecutive centroid-to-centroid displacement vectors whose dot product is negative (a count, returned as a float).
5. **Bounding-box aspect ratios (2)** — over all centroids' x/y/z extents: `width = max(x) - min(x)`, `height = max(y) - min(y)`, `depth = max(z) - min(z)`; return `(width / (height + 1e-9), width / (depth + 1e-9))`.
6. **Starting handshape (40)** — `extract_static_features(frames[0])`.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_features_motion.py
import pytest

from features_motion import extract_motion_features


def _straight_line_frames(num_frames=20):
    """Hand centroid moves in a straight line along +x, handshape held
    constant (all landmarks at the origin each frame except a fixed offset
    pattern, so extract_static_features doesn't blow up on degenerate input)."""
    base = [(i * 0.01, i * 0.01, 0.0) for i in range(21)]
    frames = []
    for t in range(num_frames):
        offset = t * 0.1
        frames.append([(x + offset, y, z) for x, y, z in base])
    return frames


def _zigzag_frames(num_frames=20):
    """Centroid reverses x-direction every other frame — high reversal count,
    net displacement much smaller than path length."""
    base = [(i * 0.01, i * 0.01, 0.0) for i in range(21)]
    frames = []
    x = 0.0
    for t in range(num_frames):
        x += 0.1 if t % 2 == 0 else -0.1
        frames.append([(px + x, py, pz) for px, py, pz in base])
    return frames


def test_extract_motion_features_returns_49_floats():
    features = extract_motion_features(_straight_line_frames())
    assert len(features) == 49
    assert all(isinstance(f, float) for f in features)


def test_straight_line_has_zero_direction_reversals():
    features = extract_motion_features(_straight_line_frames())
    direction_reversals = features[6]
    assert direction_reversals == pytest.approx(0.0)


def test_zigzag_has_many_direction_reversals():
    features = extract_motion_features(_zigzag_frames())
    direction_reversals = features[6]
    assert direction_reversals > 10


def test_straight_line_curvature_near_one():
    features = extract_motion_features(_straight_line_frames())
    curvature = features[5]
    assert curvature == pytest.approx(1.0, abs=1e-3)


def test_zigzag_path_length_exceeds_net_displacement():
    features = extract_motion_features(_zigzag_frames())
    dx, dy, dz, magnitude = features[0:4]
    path_length = features[4]
    assert path_length > magnitude
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_features_motion.py -v`
Expected: FAIL / ERROR — `features_motion` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/features_motion.py`**

```python
"""Trajectory-level feature extraction for resampled motion sequences
(J / Z / negative). Pure, hardware-free — see docs/superpowers/plans/
2026-08-19-phase-2-model-training.md, Task 2, for the exact feature layout.
"""
from __future__ import annotations

import math

from features_static import extract_static_features

EPSILON = 1e-9


def _centroid(frame):
    n = len(frame)
    xs, ys, zs = zip(*frame)
    return (sum(xs) / n, sum(ys) / n, sum(zs) / n)


def _dist(p, q):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p, q)))


def _sub(p, q):
    return tuple(a - b for a, b in zip(p, q))


def extract_motion_features(frames):
    centroids = [_centroid(f) for f in frames]

    dx, dy, dz = _sub(centroids[-1], centroids[0])
    magnitude = math.sqrt(dx * dx + dy * dy + dz * dz)

    path_length = sum(_dist(centroids[i], centroids[i + 1]) for i in range(len(centroids) - 1))
    curvature = path_length / (magnitude + EPSILON)

    displacements = [_sub(centroids[i + 1], centroids[i]) for i in range(len(centroids) - 1)]
    reversals = sum(
        1 for i in range(len(displacements) - 1)
        if sum(a * b for a, b in zip(displacements[i], displacements[i + 1])) < 0
    )

    xs = [c[0] for c in centroids]
    ys = [c[1] for c in centroids]
    zs = [c[2] for c in centroids]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    depth = max(zs) - min(zs)

    starting_handshape = extract_static_features(frames[0])

    return [float(v) for v in (
        dx, dy, dz, magnitude, path_length, curvature, reversals,
        width / (height + EPSILON), width / (depth + EPSILON),
        *starting_handshape,
    )]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_features_motion.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/squidspell && git add ml/features_motion.py ml/tests/test_features_motion.py
git commit -m "Phase 2: trajectory feature extraction for motion sequences"
```

---

### Task 3: `ml/train_static.py` — static-letter classifier training

**Files:**
- Create: `ml/train_static.py`
- Modify: `ml/requirements.txt` (add `matplotlib==3.9.2` — needed for confusion-matrix plots; already an indirect mediapipe dependency, now a direct one)
- Test: `ml/tests/test_train_static.py`

**Interfaces:**
- Consumes: `features_static.extract_static_features` (Task 1), `collection_utils.flatten_landmarks` (Phase 1, existing — used as the "raw" feature set).
- Produces (importable, used by Task 5's real run and by this task's own tests):
  - `load_static_dataset(csv_path) -> (raw_X, engineered_X, y)` — three parallel lists/arrays.
  - `build_candidate_models() -> dict[str, sklearn estimator]` — the 4 untrained model instances (RandomForestClassifier, SVC, GradientBoostingClassifier, LogisticRegression), keyed by name.
  - `evaluate_model(model, X, y, cv_folds=5) -> dict` — returns `{"cv_accuracy_mean": float, "test_accuracy": float, "precision": float, "recall": float, "f1": float, "confusion_matrix": list[list[int]]}` (precision/recall/f1 are weighted-average via `sklearn.metrics.classification_report(..., output_dict=True)["weighted avg"]`; internally does its own stratified train/test split).
  - `write_comparison_report(results, path)` — `results`: list of `{"model": str, "feature_set": str, **evaluate_model(...) output}` dicts; writes a Markdown table to `path`.
  - `train_and_export(csv_path, model_out_path, report_out_path)` — the full pipeline: load data, evaluate all 4 models × 2 feature sets, GridSearchCV-tune the single best-by-`cv_accuracy_mean` combination, export it (bundled dict format from Global Constraints) via joblib, write the report. Returns the winning `{"model_name": str, "feature_set": str, "test_accuracy": float}` summary dict (Task 5 logs this into `DECISIONS.md`).

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_train_static.py
import csv
import os

import joblib
import pytest

from train_static import (
    build_candidate_models,
    evaluate_model,
    load_static_dataset,
    train_and_export,
    write_comparison_report,
)


@pytest.fixture
def tiny_csv(tmp_path):
    """8 samples per letter across 3 letters — enough for a stratified
    train/test split and 3-fold CV without real hand-tracked data."""
    path = tmp_path / "static_landmarks.csv"
    header = ["label"] + [f"{axis}{i}" for i in range(21) for axis in ("x", "y", "z")]
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for letter_seed, letter in enumerate(["A", "B", "C"]):
            for sample in range(8):
                jitter = sample * 0.001
                row = [letter] + [letter_seed + i * 0.05 + jitter for i in range(63)]
                writer.writerow(row)
    return str(path)


def test_load_static_dataset_shapes(tiny_csv):
    raw_X, engineered_X, y = load_static_dataset(tiny_csv)
    assert len(raw_X) == len(engineered_X) == len(y) == 24
    assert len(raw_X[0]) == 63
    assert len(engineered_X[0]) == 40
    assert set(y) == {"A", "B", "C"}


def test_build_candidate_models_has_four_named_models():
    models = build_candidate_models()
    assert set(models.keys()) == {
        "random_forest", "svm", "gradient_boosting", "logistic_regression",
    }


def test_evaluate_model_returns_expected_keys(tiny_csv):
    raw_X, _, y = load_static_dataset(tiny_csv)
    model = build_candidate_models()["random_forest"]
    result = evaluate_model(model, raw_X, y, cv_folds=3)
    for key in ("cv_accuracy_mean", "test_accuracy", "precision", "recall", "f1", "confusion_matrix"):
        assert key in result
    assert 0.0 <= result["test_accuracy"] <= 1.0


def test_write_comparison_report_creates_markdown_table(tmp_path):
    results = [{
        "model": "random_forest", "feature_set": "raw", "cv_accuracy_mean": 0.9,
        "test_accuracy": 0.95, "precision": 0.94, "recall": 0.95, "f1": 0.94,
        "confusion_matrix": [[3, 0], [0, 3]],
    }]
    out_path = tmp_path / "comparison.md"
    write_comparison_report(results, str(out_path))
    content = out_path.read_text()
    assert "random_forest" in content
    assert "0.95" in content


def test_train_and_export_produces_loadable_model(tiny_csv, tmp_path):
    model_path = tmp_path / "static_model.pkl"
    report_path = tmp_path / "comparison.md"
    summary = train_and_export(tiny_csv, str(model_path), str(report_path))

    assert os.path.exists(model_path)
    assert os.path.exists(report_path)
    assert summary["feature_set"] in ("raw", "engineered")

    bundle = joblib.load(model_path)
    assert set(bundle.keys()) == {"model", "feature_set", "classes"}
    assert set(bundle["classes"]) == {"A", "B", "C"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_train_static.py -v`
Expected: FAIL / ERROR — `train_static` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/train_static.py`**

Add `matplotlib==3.9.2` to `ml/requirements.txt`, then `pip install matplotlib==3.9.2` into the repo's venv. Implement:

```python
"""Static-letter (24-class) classifier training: loads ml/data/static_landmarks.csv,
compares raw-coordinate vs. engineered features across 4 model types, tunes and
exports the winner. See docs/superpowers/plans/2026-08-19-phase-2-model-training.md,
Task 3, for the exact pipeline. Run for real: `python train_static.py`.
"""
from __future__ import annotations

import argparse
import os

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import ConfusionMatrixDisplay, classification_report, confusion_matrix
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_score, train_test_split
from sklearn.svm import SVC

from features_static import extract_static_features

DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "static_model.pkl")
DEFAULT_REPORT_PATH = os.path.join(os.path.dirname(__file__), "results", "comparison.md")
DEFAULT_CONFUSION_MATRIX_PATH = os.path.join(os.path.dirname(__file__), "results", "static_confusion_matrix.png")

TUNING_GRIDS = {
    "random_forest": {"n_estimators": [100, 300], "max_depth": [None, 10, 20]},
    "svm": {"C": [0.1, 1, 10], "kernel": ["rbf", "linear"]},
    "gradient_boosting": {"n_estimators": [100, 200], "learning_rate": [0.05, 0.1]},
    "logistic_regression": {"C": [0.1, 1, 10]},
}


def load_static_dataset(csv_path):
    df = pd.read_csv(csv_path)
    landmark_cols = [c for c in df.columns if c != "label"]
    raw_X, engineered_X, y = [], [], []
    for _, row in df.iterrows():
        flat = [row[c] for c in landmark_cols]
        landmarks = [tuple(flat[i:i + 3]) for i in range(0, len(flat), 3)]
        raw_X.append(flat)
        engineered_X.append(extract_static_features(landmarks))
        y.append(row["label"])
    return raw_X, engineered_X, y


def build_candidate_models():
    return {
        "random_forest": RandomForestClassifier(n_estimators=200, random_state=42),
        "svm": SVC(kernel="rbf", C=1.0, random_state=42),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=150, random_state=42),
        "logistic_regression": LogisticRegression(max_iter=2000, random_state=42),
    }


def evaluate_model(model, X, y, cv_folds=5):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv)

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
    weighted = report["weighted avg"]

    return {
        "cv_accuracy_mean": float(cv_scores.mean()),
        "test_accuracy": float(report["accuracy"]),
        "precision": float(weighted["precision"]),
        "recall": float(weighted["recall"]),
        "f1": float(weighted["f1-score"]),
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
    }


def write_comparison_report(results, path):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    lines = [
        "# Static Classifier: Raw vs. Engineered Feature Comparison\n",
        "| Model | Feature Set | CV Accuracy | Test Accuracy | Precision | Recall | F1 |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['model']} | {r['feature_set']} | {r['cv_accuracy_mean']:.3f} | "
            f"{r['test_accuracy']:.3f} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |"
        )
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def train_and_export(csv_path, model_out_path, report_out_path,
                      confusion_matrix_out_path=None):
    raw_X, engineered_X, y = load_static_dataset(csv_path)
    feature_sets = {"raw": raw_X, "engineered": engineered_X}

    results = []
    for feature_set_name, X in feature_sets.items():
        for model_name, model in build_candidate_models().items():
            metrics = evaluate_model(model, X, y)
            results.append({"model": model_name, "feature_set": feature_set_name, **metrics})

    best = max(results, key=lambda r: r["cv_accuracy_mean"])
    best_X = feature_sets[best["feature_set"]]
    tuned = GridSearchCV(
        build_candidate_models()[best["model"]],
        TUNING_GRIDS[best["model"]],
        cv=3,
    )
    X_train, X_test, y_train, y_test = train_test_split(
        best_X, y, test_size=0.2, stratify=y, random_state=42
    )
    tuned.fit(X_train, y_train)
    final_model = tuned.best_estimator_
    predictions = final_model.predict(X_test)
    final_test_accuracy = float((predictions == pd.Series(y_test).values).mean())

    if confusion_matrix_out_path:
        os.makedirs(os.path.dirname(confusion_matrix_out_path), exist_ok=True)
        ConfusionMatrixDisplay.from_predictions(y_test, predictions)
        plt.savefig(confusion_matrix_out_path, bbox_inches="tight")
        plt.close()

    write_comparison_report(results, report_out_path)

    classes = sorted(set(y))
    os.makedirs(os.path.dirname(model_out_path), exist_ok=True)
    joblib.dump(
        {"model": final_model, "feature_set": best["feature_set"], "classes": classes},
        model_out_path,
    )

    return {
        "model_name": best["model"], "feature_set": best["feature_set"],
        "test_accuracy": final_test_accuracy,
    }


def main():
    parser = argparse.ArgumentParser(description="Train the static-letter classifier.")
    parser.add_argument("--csv-path", default=DEFAULT_CSV_PATH)
    parser.add_argument("--model-out", default=DEFAULT_MODEL_PATH)
    parser.add_argument("--report-out", default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()
    summary = train_and_export(
        args.csv_path, args.model_out, args.report_out, DEFAULT_CONFUSION_MATRIX_PATH
    )
    print(f"Winner: {summary['model_name']} ({summary['feature_set']} features), "
          f"test accuracy {summary['test_accuracy']:.3f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && pip install matplotlib==3.9.2 && cd ml && python -m pytest tests/test_train_static.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/squidspell && git add ml/train_static.py ml/requirements.txt ml/tests/test_train_static.py
git commit -m "Phase 2: static-letter classifier training pipeline"
```

---

### Task 4: `ml/train_motion.py` — motion classifier training

**Files:**
- Create: `ml/train_motion.py`
- Test: `ml/tests/test_train_motion.py`

**Interfaces:**
- Consumes: `features_motion.extract_motion_features` (Task 2).
- Produces:
  - `load_motion_dataset(manifest_path) -> (X, y)`.
  - `build_candidate_models() -> dict[str, sklearn estimator]` — just `{"random_forest": ..., "svm": ...}` (spec: "no need to sweep all 4 here").
  - `evaluate_model(...)` — same shape as Task 3's, plus `per_class_recall: dict[str, float]` (from `classification_report`'s per-label `"recall"`).
  - `write_motion_report(results, path)` — writes Markdown with per-class precision/recall/F1, explicitly calling out `negative` class recall in its own labeled row/section.
  - `train_and_export(data_dir, model_out_path, report_out_path) -> {"model_name": str, "test_accuracy": float, "negative_recall": float}`.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_train_motion.py
import csv
import os

import joblib
import pytest

from train_motion import (
    build_candidate_models,
    evaluate_model,
    load_motion_dataset,
    train_and_export,
    write_motion_report,
)


@pytest.fixture
def tiny_motion_dataset(tmp_path):
    """6 takes per class (J, Z, negative), 5 resampled frames each — enough
    for a stratified split + 3-fold CV without real recorded takes."""
    data_dir = tmp_path / "motion_sequences"
    data_dir.mkdir()
    header = [f"{axis}{i}" for i in range(21) for axis in ("x", "y", "z")]
    manifest_path = data_dir / "manifest.csv"
    with open(manifest_path, "w", newline="") as manifest_file:
        writer = csv.writer(manifest_file)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label_seed, label in enumerate(["J", "Z", "negative"]):
            for take in range(6):
                filename = f"{label}_{take:03d}.csv"
                with open(data_dir / filename, "w", newline="") as take_file:
                    take_writer = csv.writer(take_file)
                    take_writer.writerow(header)
                    for frame in range(5):
                        drift = label_seed * 2.0 + frame * 0.3 + take * 0.01
                        take_writer.writerow([drift + i * 0.02 for i in range(63)])
                writer.writerow([label, label, filename, 5, 1787000000.0 + take])
    return str(manifest_path)


def test_load_motion_dataset_shapes(tiny_motion_dataset):
    X, y = load_motion_dataset(tiny_motion_dataset)
    assert len(X) == len(y) == 18
    assert len(X[0]) == 49
    assert set(y) == {"J", "Z", "negative"}


def test_build_candidate_models_has_two_named_models():
    models = build_candidate_models()
    assert set(models.keys()) == {"random_forest", "svm"}


def test_evaluate_model_reports_per_class_recall(tiny_motion_dataset):
    X, y = load_motion_dataset(tiny_motion_dataset)
    model = build_candidate_models()["random_forest"]
    result = evaluate_model(model, X, y, cv_folds=3)
    assert "negative" in result["per_class_recall"]
    assert 0.0 <= result["per_class_recall"]["negative"] <= 1.0


def test_write_motion_report_mentions_negative_recall(tmp_path):
    results = [{
        "model": "random_forest", "cv_accuracy_mean": 0.9, "test_accuracy": 0.9,
        "precision": 0.9, "recall": 0.9, "f1": 0.9,
        "confusion_matrix": [[2, 0, 0], [0, 2, 0], [0, 0, 2]],
        "per_class_recall": {"J": 0.9, "Z": 0.85, "negative": 0.95},
    }]
    out_path = tmp_path / "motion_comparison.md"
    write_motion_report(results, str(out_path))
    content = out_path.read_text()
    assert "negative" in content
    assert "0.95" in content


def test_train_and_export_produces_loadable_model(tiny_motion_dataset, tmp_path):
    model_path = tmp_path / "motion_model.pkl"
    report_path = tmp_path / "motion_comparison.md"
    summary = train_and_export(tiny_motion_dataset, str(model_path), str(report_path))

    assert os.path.exists(model_path)
    assert os.path.exists(report_path)
    assert "negative_recall" in summary

    bundle = joblib.load(model_path)
    assert set(bundle.keys()) == {"model", "classes"}
    assert set(bundle["classes"]) == {"J", "Z", "negative"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_train_motion.py -v`
Expected: FAIL / ERROR — `train_motion` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/train_motion.py`**

```python
"""Motion-letter (J / Z / negative) classifier training: loads
ml/data/motion_sequences/manifest.csv + per-take files, trains and exports
the better of Random Forest / SVM. See docs/superpowers/plans/
2026-08-19-phase-2-model-training.md, Task 4. Run for real: `python train_motion.py`.
"""
from __future__ import annotations

import argparse
import os

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.svm import SVC

from features_motion import extract_motion_features

DEFAULT_DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "motion_sequences")
DEFAULT_MANIFEST_PATH = os.path.join(DEFAULT_DATA_DIR, "manifest.csv")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "motion_model.pkl")
DEFAULT_REPORT_PATH = os.path.join(os.path.dirname(__file__), "results", "motion_comparison.md")


def load_motion_dataset(manifest_path):
    data_dir = os.path.dirname(manifest_path)
    manifest = pd.read_csv(manifest_path)
    X, y = [], []
    for _, row in manifest.iterrows():
        take_df = pd.read_csv(os.path.join(data_dir, row["filepath"]))
        frames = [
            [tuple(take_row[i:i + 3]) for i in range(0, len(take_row), 3)]
            for take_row in take_df.values.tolist()
        ]
        X.append(extract_motion_features(frames))
        y.append(row["label"])
    return X, y


def build_candidate_models():
    return {
        "random_forest": RandomForestClassifier(n_estimators=200, random_state=42),
        "svm": SVC(kernel="rbf", C=1.0, random_state=42),
    }


def evaluate_model(model, X, y, cv_folds=5):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv)

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
    weighted = report["weighted avg"]
    per_class_recall = {
        label: metrics["recall"] for label, metrics in report.items()
        if label not in ("accuracy", "macro avg", "weighted avg")
    }

    return {
        "cv_accuracy_mean": float(cv_scores.mean()),
        "test_accuracy": float(report["accuracy"]),
        "precision": float(weighted["precision"]),
        "recall": float(weighted["recall"]),
        "f1": float(weighted["f1-score"]),
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
        "per_class_recall": per_class_recall,
    }


def write_motion_report(results, path):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    lines = [
        "# Motion Classifier (J / Z / negative) Comparison\n",
        "| Model | CV Accuracy | Test Accuracy | Precision | Recall | F1 |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['model']} | {r['cv_accuracy_mean']:.3f} | {r['test_accuracy']:.3f} | "
            f"{r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |"
        )
    lines.append("\n## Per-class recall (negative-class recall is the key anti-false-trigger metric)\n")
    lines.append("| Model | J recall | Z recall | negative recall |")
    lines.append("|---|---|---|---|")
    for r in results:
        pcr = r["per_class_recall"]
        lines.append(f"| {r['model']} | {pcr.get('J', 0):.3f} | {pcr.get('Z', 0):.3f} | {pcr.get('negative', 0):.3f} |")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def train_and_export(manifest_path, model_out_path, report_out_path):
    X, y = load_motion_dataset(manifest_path)

    results = []
    for model_name, model in build_candidate_models().items():
        metrics = evaluate_model(model, X, y)
        results.append({"model": model_name, **metrics})

    best = max(results, key=lambda r: r["cv_accuracy_mean"])
    final_model = build_candidate_models()[best["model"]]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    final_model.fit(X_train, y_train)

    write_motion_report(results, report_out_path)

    classes = sorted(set(y))
    os.makedirs(os.path.dirname(model_out_path), exist_ok=True)
    joblib.dump({"model": final_model, "classes": classes}, model_out_path)

    negative_result = next(r for r in results if r["model"] == best["model"])
    return {
        "model_name": best["model"],
        "test_accuracy": negative_result["test_accuracy"],
        "negative_recall": negative_result["per_class_recall"].get("negative", 0.0),
    }


def main():
    parser = argparse.ArgumentParser(description="Train the motion (J/Z/negative) classifier.")
    parser.add_argument("--manifest-path", default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--model-out", default=DEFAULT_MODEL_PATH)
    parser.add_argument("--report-out", default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()
    summary = train_and_export(args.manifest_path, args.model_out, args.report_out)
    print(f"Winner: {summary['model_name']}, test accuracy {summary['test_accuracy']:.3f}, "
          f"negative-class recall {summary['negative_recall']:.3f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_train_motion.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd ~/squidspell && git add ml/train_motion.py ml/tests/test_train_motion.py
git commit -m "Phase 2: motion classifier (J/Z/negative) training pipeline"
```

---

### Task 5: Real training run, DECISIONS.md/HANDOFF.md update, final review

**Files:**
- Modify: `DECISIONS.md` (append a `[Phase 2]` entry)
- Modify: `HANDOFF.md` (update status to Phase 2 complete, point at Phase 3)
- Generated (not hand-written): `ml/results/comparison.md`, `ml/results/motion_comparison.md`, `ml/results/static_confusion_matrix.png`, `ml/models/static_model.pkl`, `ml/models/motion_model.pkl`

- [ ] **Step 1: Run the full test suite (all phases) to confirm nothing regressed**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/ -v`
Expected: all tests pass, including Phase 1's 35 and Task 1-4's 20 new ones.

- [ ] **Step 2: Run both training scripts for real, against the actual collected dataset**

Run:
```bash
cd ~/squidspell && source .venv/bin/activate && cd ml
python train_static.py
python train_motion.py
```
Expected: both print a winning model + accuracy line; `ml/models/static_model.pkl`, `ml/models/motion_model.pkl`, `ml/results/comparison.md`, `ml/results/motion_comparison.md` all now exist.

- [ ] **Step 3: Verify both exported models load and predict without error**

```bash
python -c "
import joblib
static = joblib.load('models/static_model.pkl')
motion = joblib.load('models/motion_model.pkl')
print('static classes:', static['classes'])
print('motion classes:', motion['classes'])
print('static feature_set:', static['feature_set'])
"
```
Expected: static classes = the 24 static letters, motion classes = `['J', 'Z', 'negative']`, no errors.

- [ ] **Step 4: Read the generated reports and append a `[Phase 2]` entry to `DECISIONS.md`**

Read `ml/results/comparison.md` and `ml/results/motion_comparison.md` to find the actual winning model/feature-set/accuracy numbers (this plan cannot predict them — they depend on the real collected dataset). Append an entry in the file's existing style (see the `[Phase 1]` entries for format), naming: the winning static model + feature set + test accuracy, the winning motion model + test accuracy + negative-class recall, and the matplotlib addition. State that Phase 3/4 must load `ml/models/static_model.pkl` and read its `feature_set` key to know whether to compute engineered features or feed raw landmarks before calling `.predict()`.

- [ ] **Step 5: Update `HANDOFF.md`**

Change the "Last updated" / status section to reflect Phase 2 complete, name the winning models, and point at Phase 3 (Standalone Real-Time Inference Loop) as next, per `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`.

- [ ] **Step 6: Final whole-branch review, then commit and push**

Review every file touched across Tasks 1-5 together (not just each task's own diff) for cross-task consistency — e.g., feature vector ordering assumptions shared between `features_static.py`/`features_motion.py` and both training scripts, gitignore coverage for the new `.pkl`/`.png` outputs. Fix any findings, then:

```bash
cd ~/squidspell
git add DECISIONS.md HANDOFF.md ml/results/comparison.md ml/results/motion_comparison.md
git commit -m "Phase 2: train and export static + motion classifiers on the real dataset"
git push origin main
```
(`ml/models/*.pkl` and `ml/results/*.png` stay gitignored per Global Constraints — do not `git add` them.)
