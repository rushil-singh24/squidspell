# Phase 1: Data Collection Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scripts that capture labeled training data — 24 static-letter poses via `ml/collect_static.py`, J/Z motion sequences (plus negative examples) via `ml/collect_motion.py` — and a validator that checks any collected dataset against the spec's acceptance criteria.

**Architecture:** Each script's webcam/MediaPipe loop is a thin wrapper around a pure, dependency-injected core function (`run_static_collection`, `run_motion_capture`) that takes a `frame_source` iterator and a `hand_processor` callable instead of touching `cv2`/`mediapipe` directly. This makes the actual capture *logic* fully unit-testable without a camera, while the real webcam wiring — which no subagent in this build can exercise — is isolated behind an `if __name__ == "__main__":` guard and a `_run_interactive()` function. **No subagent can produce the real dataset.** Every task in this plan ends with automated tests, but the spec's acceptance criteria (actual sample counts) can only be met by a human running the finished scripts at a webcam — that happens after this plan, not as part of it.

**Tech Stack:** Python 3.11 (repo's shared `.venv`), OpenCV, MediaPipe Hands, NumPy (for resampling), pytest, argparse, csv (stdlib).

## Global Constraints

- Static letters: exactly `A,B,C,D,E,F,G,H,I,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y` (24 letters — J and Z excluded, they're motion letters).
- Motion labels: exactly `J`, `Z`, `negative`.
- CSV schema for static data: `label,x0,y0,z0,x1,y1,z1,...,x20,y20,z20` (1 + 21×3 = 64 columns) — 21 landmarks per MediaPipe Hands' output.
- Acceptance floor (from the spec): static — minimum 150 samples per letter (spec says "150-300", no enforced ceiling). Motion — minimum 40 takes per class (spec says "aim for 40-60").
- Motion sequences are resampled to a fixed length (default 20 frames) via linear interpolation before being saved, so takes of different durations/frame-rates are comparable.
- All new Python files live under `ml/` (repo already has this directory from Phase 0); tests live under `ml/tests/`.
- Run tests with `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/ -v` — running via `python -m pytest` from inside `ml/` puts `ml/` on `sys.path` so `from collection_utils import ...`-style imports resolve without an `__init__.py` or packaging setup.
- Every task-ending commit happens on `main` directly (no worktree — this repo has one contributor and Phase 0 established the same pattern).
- Any new open decision (confidence threshold value, frame counts, per-take file format, etc.) gets appended to `DECISIONS.md` in the existing format before Phase 1 is considered done — done once, in the final task, not per-task, since these are genuinely one Phase-1-wide set of decisions.
- Full phase detail: `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 1" section — this plan implements only that section.

---

### Task 1: `ml/collection_utils.py` — pure, hardware-free helpers

**Files:**
- Create: `ml/collection_utils.py`
- Test: `ml/tests/test_collection_utils.py`

**Interfaces:**
- Produces: `flatten_landmarks(landmarks) -> list[float]`, `landmark_row_header() -> list[str]`, `landmarks_to_row(label, landmarks) -> list`, `is_confident(handedness_score, threshold=0.7) -> bool`, `resample_sequence(frames, target_len=20) -> list[list[tuple[float,float,float]]]`. Tasks 2-4 import all five.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_collection_utils.py
import pytest

from collection_utils import (
    flatten_landmarks,
    is_confident,
    landmark_row_header,
    landmarks_to_row,
    resample_sequence,
)


def _landmarks(seed=0.0):
    return [(seed + i, seed + i + 0.1, seed + i + 0.2) for i in range(21)]


def test_flatten_landmarks_orders_coordinates_correctly():
    flat = flatten_landmarks(_landmarks(seed=1.0))
    assert flat[0:3] == [1.0, 1.1, 1.2]
    assert flat[3:6] == [2.0, 2.1, 2.2]
    assert len(flat) == 63


def test_flatten_landmarks_wrong_length_raises():
    with pytest.raises(ValueError):
        flatten_landmarks(_landmarks()[:20])


def test_landmark_row_header_matches_flatten_order():
    header = landmark_row_header()
    assert header[0] == "label"
    assert header[1:4] == ["x0", "y0", "z0"]
    assert header[-3:] == ["x20", "y20", "z20"]
    assert len(header) == 64


def test_landmarks_to_row_prepends_label():
    row = landmarks_to_row("A", _landmarks())
    assert row[0] == "A"
    assert len(row) == 64


def test_is_confident_above_threshold():
    assert is_confident(0.9, threshold=0.7) is True


def test_is_confident_below_threshold():
    assert is_confident(0.5, threshold=0.7) is False


def test_is_confident_at_threshold_boundary_is_confident():
    assert is_confident(0.7, threshold=0.7) is True


def test_is_confident_none_score_is_not_confident():
    assert is_confident(None, threshold=0.7) is False


def test_resample_sequence_output_length_matches_target():
    frames = [_landmarks(seed=float(i)) for i in range(5)]
    out = resample_sequence(frames, target_len=20)
    assert len(out) == 20
    assert len(out[0]) == 21
    assert len(out[0][0]) == 3


def test_resample_sequence_preserves_endpoints():
    frames = [_landmarks(seed=0.0), _landmarks(seed=10.0), _landmarks(seed=20.0)]
    out = resample_sequence(frames, target_len=5)
    assert out[0][0][0] == pytest.approx(frames[0][0][0])
    assert out[-1][0][0] == pytest.approx(frames[-1][0][0])


def test_resample_sequence_linear_interpolation_midpoint():
    # x for landmark 0 goes 0.0 -> 1.0 -> 2.0 linearly across 3 evenly-spaced frames;
    # resampling to 3 points should reproduce the same linear values.
    frames = [
        [(0.0, 0.0, 0.0)] * 21,
        [(1.0, 0.0, 0.0)] * 21,
        [(2.0, 0.0, 0.0)] * 21,
    ]
    out = resample_sequence(frames, target_len=3)
    assert out[1][0][0] == pytest.approx(1.0)


def test_resample_sequence_upsamples_short_take():
    frames = [_landmarks(seed=0.0), _landmarks(seed=1.0)]
    out = resample_sequence(frames, target_len=20)
    assert len(out) == 20


def test_resample_sequence_too_few_frames_raises():
    with pytest.raises(ValueError):
        resample_sequence([_landmarks()], target_len=20)


def test_resample_sequence_target_len_too_small_raises():
    with pytest.raises(ValueError):
        resample_sequence([_landmarks(), _landmarks()], target_len=1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_collection_utils.py -v`
Expected: FAIL / ERROR — `collection_utils` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/collection_utils.py`**

```python
"""Pure, hardware-free helper functions shared by collect_static.py and collect_motion.py.

Nothing in this module touches cv2, mediapipe, or a webcam — that's deliberate, so all of
it is unit-testable without a camera. See collect_static.py / collect_motion.py for where
these functions plug into the actual capture loops.
"""
from __future__ import annotations

import numpy as np

NUM_LANDMARKS = 21


def flatten_landmarks(landmarks):
    """Flatten a sequence of 21 (x, y, z) tuples into 63 floats: x0,y0,z0,...,x20,y20,z20."""
    if len(landmarks) != NUM_LANDMARKS:
        raise ValueError(f"expected {NUM_LANDMARKS} landmarks, got {len(landmarks)}")
    flat = []
    for x, y, z in landmarks:
        flat.extend([x, y, z])
    return flat


def landmark_row_header():
    """Column headers matching flatten_landmarks' output order, prefixed with 'label'."""
    header = ["label"]
    for i in range(NUM_LANDMARKS):
        header.extend([f"x{i}", f"y{i}", f"z{i}"])
    return header


def landmarks_to_row(label, landmarks):
    """Build one CSV row (list) for a single labeled frame of landmarks."""
    return [label] + flatten_landmarks(landmarks)


def is_confident(handedness_score, threshold=0.7):
    """True if a MediaPipe handedness classification score clears the capture threshold."""
    return handedness_score is not None and handedness_score >= threshold


def resample_sequence(frames, target_len=20):
    """Resample a variable-length sequence of landmark-frames to exactly target_len frames
    via linear interpolation per coordinate, so takes of different durations/frame-rates
    become comparable-length inputs for the motion classifier.

    frames: list of frames, each frame a list of NUM_LANDMARKS (x, y, z) tuples.
    Returns: list of target_len frames in the same (x, y, z)-tuple-list shape.
    """
    n = len(frames)
    if n < 2:
        raise ValueError("need at least 2 frames to resample")
    if target_len < 2:
        raise ValueError("target_len must be at least 2")

    arr = np.array(frames, dtype=float)  # shape (n, 21, 3)
    src_x = np.linspace(0.0, 1.0, num=n)
    dst_x = np.linspace(0.0, 1.0, num=target_len)

    resampled = np.empty((target_len, arr.shape[1], arr.shape[2]), dtype=float)
    for landmark_i in range(arr.shape[1]):
        for coord_i in range(arr.shape[2]):
            resampled[:, landmark_i, coord_i] = np.interp(dst_x, src_x, arr[:, landmark_i, coord_i])

    return [
        [tuple(resampled[frame_i, landmark_i]) for landmark_i in range(arr.shape[1])]
        for frame_i in range(target_len)
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_collection_utils.py -v`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/squidspell
git add ml/collection_utils.py ml/tests/test_collection_utils.py
git commit -m "Phase 1: pure landmark/resampling helpers for data collection"
```

---

### Task 2: `ml/collect_static.py` — static-letter capture (24 letters)

**Files:**
- Create: `ml/collect_static.py`
- Test: `ml/tests/test_collect_static.py`

**Interfaces:**
- Consumes: `is_confident`, `landmark_row_header`, `landmarks_to_row` from `ml/collection_utils.py` (Task 1).
- Produces: `STATIC_LETTERS` (list of 24 letters), `run_static_collection(letter, num_frames, confidence_threshold, frame_source, hand_processor, on_progress=None) -> list[list]`, `append_rows_to_csv(rows, csv_path) -> None`. Task 4 (`validate_data.py`) imports `STATIC_LETTERS`.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_collect_static.py
import csv
import os

import pytest

from collect_static import STATIC_LETTERS, append_rows_to_csv, run_static_collection


def test_static_letters_excludes_j_and_z():
    assert "J" not in STATIC_LETTERS
    assert "Z" not in STATIC_LETTERS
    assert len(STATIC_LETTERS) == 24


def _landmarks():
    return [(0.1, 0.2, 0.3)] * 21


def test_run_static_collection_keeps_only_confident_frames():
    frames = ["f1", "f2", "f3", "f4"]

    def hand_processor(frame):
        # f1: confident, f2: low confidence, f3: no hand, f4: confident
        return {
            "f1": (_landmarks(), 0.9),
            "f2": (_landmarks(), 0.2),
            "f3": (None, None),
            "f4": (_landmarks(), 0.95),
        }[frame]

    rows = run_static_collection("A", num_frames=10, confidence_threshold=0.7,
                                  frame_source=iter(frames), hand_processor=hand_processor)
    assert len(rows) == 2
    assert all(row[0] == "A" for row in rows)


def test_run_static_collection_stops_at_num_frames():
    frames = ["f"] * 500

    def hand_processor(_frame):
        return _landmarks(), 0.99

    rows = run_static_collection("B", num_frames=5, confidence_threshold=0.7,
                                  frame_source=iter(frames), hand_processor=hand_processor)
    assert len(rows) == 5


def test_run_static_collection_invalid_letter_raises():
    with pytest.raises(ValueError):
        run_static_collection("J", num_frames=5, confidence_threshold=0.7,
                               frame_source=iter([]), hand_processor=lambda f: (None, None))


def test_run_static_collection_calls_on_progress():
    frames = ["f", "f"]
    calls = []

    def hand_processor(_frame):
        return _landmarks(), 0.99

    run_static_collection("A", num_frames=2, confidence_threshold=0.7,
                           frame_source=iter(frames), hand_processor=hand_processor,
                           on_progress=lambda collected, total: calls.append((collected, total)))
    assert calls == [(1, 2), (2, 2)]


def test_append_rows_to_csv_writes_header_once(tmp_path):
    csv_path = str(tmp_path / "out.csv")
    append_rows_to_csv([["A"] + [0.0] * 63], csv_path)
    append_rows_to_csv([["A"] + [0.0] * 63], csv_path)

    with open(csv_path, newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0][0] == "label"
    assert len(rows) == 3  # header + 2 data rows
    assert rows.count(rows[0]) == 1  # header appears exactly once
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_collect_static.py -v`
Expected: FAIL / ERROR — `collect_static` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/collect_static.py`**

```python
"""Static-letter data collection: webcam + MediaPipe Hands -> ml/data/static_landmarks.csv.

Run interactively (needs a real webcam): `python collect_static.py --letter A`
See run_static_collection() for the hardware-free, testable capture loop; everything
below the `if __name__ == "__main__":` guard wires it to a real webcam and MediaPipe.
"""
from __future__ import annotations

import argparse
import csv
import os
import time

from collection_utils import is_confident, landmark_row_header, landmarks_to_row

STATIC_LETTERS = [c for c in "ABCDEFGHIKLMNOPQRSTUVWXY"]  # excludes J and Z (motion letters)
DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv")


def run_static_collection(letter, num_frames, confidence_threshold, frame_source,
                           hand_processor, on_progress=None):
    """Capture up to `num_frames` confidently-detected labeled frames for `letter`.

    frame_source: an iterable/iterator yielding raw frames (opaque to this function).
    hand_processor: callable(frame) -> (landmarks, handedness_score), where landmarks is
      a list of 21 (x, y, z) tuples or None if no hand was detected.
    on_progress: optional callable(rows_collected, num_frames) invoked after each confident frame.
    Returns: list of CSV rows (each a list starting with `letter`).
    """
    if letter not in STATIC_LETTERS:
        raise ValueError(f"{letter!r} is not one of the 24 static letters: {STATIC_LETTERS}")

    rows = []
    for frame in frame_source:
        if len(rows) >= num_frames:
            break
        landmarks, score = hand_processor(frame)
        if landmarks is not None and is_confident(score, confidence_threshold):
            rows.append(landmarks_to_row(letter, landmarks))
            if on_progress is not None:
                on_progress(len(rows), num_frames)
    return rows


def append_rows_to_csv(rows, csv_path):
    """Append rows to csv_path, writing the header first if the file doesn't exist yet."""
    file_exists = os.path.exists(csv_path)
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(landmark_row_header())
        writer.writerows(rows)


def _mediapipe_hand_processor(mp_hands_instance):
    """Adapt a real mediapipe.solutions.hands.Hands instance to the hand_processor(frame) contract."""
    def process(frame):
        import cv2
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = mp_hands_instance.process(rgb)
        if not results.multi_hand_landmarks or not results.multi_handedness:
            return None, None
        landmarks = [(lm.x, lm.y, lm.z) for lm in results.multi_hand_landmarks[0].landmark]
        score = results.multi_handedness[0].classification[0].score
        return landmarks, score
    return process


def _run_interactive(args):
    import cv2
    import mediapipe as mp

    cap = cv2.VideoCapture(0)
    hands = mp.solutions.hands.Hands(
        static_image_mode=False, max_num_hands=1,
        min_detection_confidence=0.7, min_tracking_confidence=0.5,
    )
    processor = _mediapipe_hand_processor(hands)

    print(f"Get ready to sign '{args.letter}'. Starting in {args.countdown}s...")
    for remaining in range(args.countdown, 0, -1):
        print(remaining)
        time.sleep(1)
    print(f"Recording {args.num_frames} frames for '{args.letter}'. Hold the pose.")

    def frame_source():
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            cv2.imshow("SquidSpell data collection (press ESC to stop early)", frame)
            if cv2.waitKey(1) & 0xFF == 27:
                break
            yield frame

    def on_progress(collected, total):
        if collected % 20 == 0 or collected == total:
            print(f"  {collected}/{total}")

    rows = run_static_collection(args.letter, args.num_frames, args.confidence_threshold,
                                  frame_source(), processor, on_progress)
    append_rows_to_csv(rows, args.output)
    print(f"Saved {len(rows)} rows for '{args.letter}' to {args.output}")

    cap.release()
    cv2.destroyAllWindows()
    hands.close()


def main():
    parser = argparse.ArgumentParser(description="Collect labeled static-letter hand landmarks.")
    parser.add_argument("--letter", required=True, choices=STATIC_LETTERS, help="Target letter (A-I, K-Y)")
    parser.add_argument("--num-frames", type=int, default=200, help="Confident frames to record (default 200)")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before recording (default 3)")
    parser.add_argument("--confidence-threshold", type=float, default=0.7,
                         help="Min handedness score to keep a frame (default 0.7)")
    parser.add_argument("--output", default=DEFAULT_CSV_PATH, help="CSV path to append to")
    args = parser.parse_args()
    _run_interactive(args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_collect_static.py -v`
Expected: all tests PASS.

- [ ] **Step 5: Verify `--help` works without a webcam (sanity check the CLI wiring doesn't crash before argparse)**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python collect_static.py --help`
Expected: prints usage text and exits 0 — proves `cv2`/`mediapipe` aren't imported until `_run_interactive` actually runs (they're imported locally inside functions, not at module top level).

- [ ] **Step 6: Commit**

```bash
cd ~/squidspell
git add ml/collect_static.py ml/tests/test_collect_static.py
git commit -m "Phase 1: static-letter data collection script (ml/collect_static.py)"
```

---

### Task 3: `ml/collect_motion.py` — J/Z motion + negative-example capture

**Files:**
- Create: `ml/collect_motion.py`
- Test: `ml/tests/test_collect_motion.py`

**Interfaces:**
- Consumes: `flatten_landmarks`, `landmark_row_header`, `resample_sequence` from `ml/collection_utils.py` (Task 1).
- Produces: `MOTION_LABELS = ["J", "Z", "negative"]`, `run_motion_capture(window_seconds, frame_source, hand_processor, clock_fn) -> list[frame]`, `save_take(label, source, resampled_frames, output_dir, index, captured_at) -> str`. Task 4 imports `MOTION_LABELS`.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_collect_motion.py
import csv
import os

from collect_motion import MOTION_LABELS, run_motion_capture, save_take


def _landmarks():
    return [(0.1, 0.2, 0.3)] * 21


def test_motion_labels_are_j_z_negative():
    assert MOTION_LABELS == ["J", "Z", "negative"]


def test_run_motion_capture_stops_after_window_seconds():
    # Fake clock: each call advances by 0.1s. Window is 0.5s -> ~5 calls before stopping,
    # but frame_source must also be effectively infinite for the loop to be clock-bound.
    clock = {"t": 0.0}

    def clock_fn():
        clock["t"] += 0.1
        return clock["t"]

    def infinite_frames():
        while True:
            yield "frame"

    def hand_processor(_frame):
        return _landmarks()

    frames = run_motion_capture(window_seconds=0.5, frame_source=infinite_frames(),
                                 hand_processor=hand_processor, clock_fn=clock_fn)
    assert 3 <= len(frames) <= 6  # clock starts at 0.1 after first call; loose bound on off-by-ones


def test_run_motion_capture_drops_frames_with_no_hand():
    clock = {"t": 0.0}

    def clock_fn():
        clock["t"] += 0.1
        return clock["t"]

    frame_sequence = ["hand", "no_hand", "hand", "no_hand", "hand"]

    def frame_source():
        for f in frame_sequence:
            yield f

    def hand_processor(frame):
        return _landmarks() if frame == "hand" else None

    frames = run_motion_capture(window_seconds=10.0, frame_source=frame_source(),
                                 hand_processor=hand_processor, clock_fn=clock_fn)
    assert len(frames) == 3  # only the three "hand" frames


def test_save_take_writes_resampled_rows_and_manifest(tmp_path):
    from collection_utils import landmark_row_header

    output_dir = str(tmp_path / "motion_sequences")
    resampled = [_landmarks() for _ in range(20)]

    filename = save_take("J", "J", resampled, output_dir, index=0, captured_at=1234567890)

    take_path = os.path.join(output_dir, filename)
    with open(take_path, newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0] == landmark_row_header()[1:]  # no "label" column in a per-take file
    assert len(rows) == 21  # header + 20 data rows

    manifest_path = os.path.join(output_dir, "manifest.csv")
    with open(manifest_path, newline="") as f:
        manifest_rows = list(csv.DictReader(f))
    assert manifest_rows[0]["label"] == "J"
    assert manifest_rows[0]["source"] == "J"
    assert manifest_rows[0]["filepath"] == filename
    assert manifest_rows[0]["num_raw_frames"] == "20"


def test_save_take_appends_without_duplicating_manifest_header(tmp_path):
    output_dir = str(tmp_path / "motion_sequences")
    resampled = [_landmarks() for _ in range(20)]

    save_take("J", "J", resampled, output_dir, index=0, captured_at=1)
    save_take("J", "J", resampled, output_dir, index=1, captured_at=2)

    with open(os.path.join(output_dir, "manifest.csv"), newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0] == ["label", "source", "filepath", "num_raw_frames", "captured_at"]
    assert len(rows) == 3  # header + 2 takes
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_collect_motion.py -v`
Expected: FAIL / ERROR — `collect_motion` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/collect_motion.py`**

```python
"""Motion-letter (J/Z) and negative-example data collection: webcam + MediaPipe Hands ->
ml/data/motion_sequences/<label>_<index>.csv + manifest.csv.

Run interactively (needs a real webcam): `python collect_motion.py --letter J`
See run_motion_capture() and save_take() for the hardware-free, testable logic; everything
below the `if __name__ == "__main__":` guard wires it to a real webcam and MediaPipe.
"""
from __future__ import annotations

import argparse
import csv
import os
import time

from collection_utils import flatten_landmarks, landmark_row_header, resample_sequence

MOTION_LABELS = ["J", "Z", "negative"]
DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "motion_sequences")
MANIFEST_COLUMNS = ["label", "source", "filepath", "num_raw_frames", "captured_at"]


def run_motion_capture(window_seconds, frame_source, hand_processor, clock_fn):
    """Record raw landmark frames for window_seconds, dropping frames with no detected hand.

    frame_source: an iterable/iterator yielding raw frames (opaque to this function).
    hand_processor: callable(frame) -> landmarks | None (a list of 21 (x, y, z) tuples, or
      None if no hand was detected in that frame).
    clock_fn: callable() -> float, monotonic seconds (injected so tests don't need real time).
    Returns: list of frames (each a list of 21 (x, y, z) tuples) — the raw, un-resampled take.
    """
    start = clock_fn()
    raw_frames = []
    for frame in frame_source:
        if clock_fn() - start >= window_seconds:
            break
        landmarks = hand_processor(frame)
        if landmarks is not None:
            raw_frames.append(landmarks)
    return raw_frames


def save_take(label, source, resampled_frames, output_dir, index, captured_at):
    """Write one resampled take to its own CSV file and append a manifest row.

    resampled_frames: list of target_len frames, each a list of 21 (x, y, z) tuples —
      one row per frame in the output file, columns matching landmark_row_header()[1:]
      (no label column in the per-take file; label lives in the manifest).
    Returns: the filename written (relative to output_dir).
    """
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{label}_{index:03d}.csv"
    filepath = os.path.join(output_dir, filename)

    header = landmark_row_header()[1:]  # drop "label" — this file is single-take, single-label
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for frame in resampled_frames:
            writer.writerow(flatten_landmarks(frame))

    manifest_path = os.path.join(output_dir, "manifest.csv")
    manifest_exists = os.path.exists(manifest_path)
    with open(manifest_path, "a", newline="") as f:
        writer = csv.writer(f)
        if not manifest_exists:
            writer.writerow(MANIFEST_COLUMNS)
        writer.writerow([label, source, filename, len(resampled_frames), captured_at])

    return filename


def _mediapipe_hand_processor(mp_hands_instance):
    def process(frame):
        import cv2
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = mp_hands_instance.process(rgb)
        if not results.multi_hand_landmarks:
            return None
        return [(lm.x, lm.y, lm.z) for lm in results.multi_hand_landmarks[0].landmark]
    return process


def _next_index(output_dir, label):
    """Find the next unused index for label_NNN.csv in output_dir."""
    if not os.path.isdir(output_dir):
        return 0
    existing = [f for f in os.listdir(output_dir) if f.startswith(f"{label}_") and f.endswith(".csv")]
    return len(existing)


def _run_interactive(args):
    import cv2
    import mediapipe as mp

    cap = cv2.VideoCapture(0)
    hands = mp.solutions.hands.Hands(
        static_image_mode=False, max_num_hands=1,
        min_detection_confidence=0.7, min_tracking_confidence=0.5,
    )
    processor = _mediapipe_hand_processor(hands)

    print(f"Get ready to sign '{args.letter}'. Starting in {args.countdown}s...")
    for remaining in range(args.countdown, 0, -1):
        print(remaining)
        time.sleep(1)
    print(f"Recording for {args.window_seconds}s. Perform the motion now.")

    def frame_source():
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            cv2.imshow("SquidSpell motion capture (press ESC to stop early)", frame)
            if cv2.waitKey(1) & 0xFF == 27:
                break
            yield frame

    raw_frames = run_motion_capture(args.window_seconds, frame_source(), processor, time.monotonic)
    if len(raw_frames) < 2:
        print(f"Only captured {len(raw_frames)} confident frame(s) — need at least 2. Take discarded, try again.")
    else:
        resampled = resample_sequence(raw_frames, args.resample_len)
        index = _next_index(args.output_dir, args.letter)
        filename = save_take(args.letter, args.letter, resampled, args.output_dir, index, time.time())
        print(f"Saved take '{filename}' ({len(raw_frames)} raw frames -> {args.resample_len} resampled) "
              f"to {args.output_dir}")

    cap.release()
    cv2.destroyAllWindows()
    hands.close()


def main():
    parser = argparse.ArgumentParser(description="Collect a J/Z motion take or a negative example.")
    parser.add_argument("--letter", required=True, choices=MOTION_LABELS, help="J, Z, or negative")
    parser.add_argument("--window-seconds", type=float, default=1.3, help="Recording window in seconds (default 1.3)")
    parser.add_argument("--resample-len", type=int, default=20, help="Fixed sequence length after resampling (default 20)")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before recording (default 3)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Directory to write takes + manifest.csv into")
    args = parser.parse_args()
    _run_interactive(args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_collect_motion.py -v`
Expected: all tests PASS.

- [ ] **Step 5: Verify `--help` works without a webcam**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python collect_motion.py --help`
Expected: prints usage text and exits 0.

- [ ] **Step 6: Commit**

```bash
cd ~/squidspell
git add ml/collect_motion.py ml/tests/test_collect_motion.py
git commit -m "Phase 1: motion (J/Z/negative) data collection script (ml/collect_motion.py)"
```

---

### Task 4: `ml/validate_data.py` — acceptance-criteria validator

**Files:**
- Create: `ml/validate_data.py`
- Test: `ml/tests/test_validate_data.py`

**Interfaces:**
- Consumes: `STATIC_LETTERS` from `ml/collect_static.py` (Task 2), `MOTION_LABELS` from `ml/collect_motion.py` (Task 3), `landmark_row_header` from `ml/collection_utils.py` (Task 1).
- Produces: `validate_static(csv_path) -> (bool, list[str])`, `validate_motion(manifest_path) -> (bool, list[str])`. This is the tool Task 6 (final acceptance) and the human's post-collection check both run — it's the only automated way to confirm the spec's sample-count criteria are met once real data exists.

- [ ] **Step 1: Write the failing tests**

```python
# ml/tests/test_validate_data.py
import csv
import os

from validate_data import MIN_MOTION_TAKES, MIN_STATIC_SAMPLES, validate_motion, validate_static
from collection_utils import landmark_row_header


def _write_static_csv(path, counts):
    """counts: dict of letter -> number of rows to write."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(landmark_row_header())
        for letter, n in counts.items():
            for _ in range(n):
                writer.writerow([letter] + [0.0] * 63)


def test_validate_static_missing_file_fails(tmp_path):
    ok, report = validate_static(str(tmp_path / "nope.csv"))
    assert ok is False
    assert any("MISSING" in line for line in report)


def test_validate_static_passes_when_all_letters_meet_floor(tmp_path):
    from collect_static import STATIC_LETTERS
    path = str(tmp_path / "static.csv")
    _write_static_csv(path, {letter: MIN_STATIC_SAMPLES for letter in STATIC_LETTERS})

    ok, report = validate_static(path)
    assert ok is True
    assert all("FAIL" not in line for line in report)


def test_validate_static_fails_when_one_letter_short(tmp_path):
    from collect_static import STATIC_LETTERS
    path = str(tmp_path / "static.csv")
    counts = {letter: MIN_STATIC_SAMPLES for letter in STATIC_LETTERS}
    counts["A"] = MIN_STATIC_SAMPLES - 1
    _write_static_csv(path, counts)

    ok, report = validate_static(path)
    assert ok is False
    assert any("'A'" in line and "FAIL" in line for line in report)


def test_validate_static_fails_on_malformed_row(tmp_path):
    path = str(tmp_path / "static.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(landmark_row_header())
        writer.writerow(["A", 0.0, 0.0])  # too few columns
    ok, report = validate_static(path)
    assert ok is False
    assert any("malformed" in line.lower() for line in report)


def test_validate_motion_missing_file_fails(tmp_path):
    ok, report = validate_motion(str(tmp_path / "manifest.csv"))
    assert ok is False
    assert any("MISSING" in line for line in report)


def test_validate_motion_passes_when_all_classes_meet_floor(tmp_path):
    path = str(tmp_path / "manifest.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label in ("J", "Z", "negative"):
            for i in range(MIN_MOTION_TAKES):
                writer.writerow([label, label, f"{label}_{i:03d}.csv", 20, i])

    ok, report = validate_motion(path)
    assert ok is True


def test_validate_motion_fails_when_one_class_short(tmp_path):
    path = str(tmp_path / "manifest.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label, n in (("J", MIN_MOTION_TAKES), ("Z", MIN_MOTION_TAKES), ("negative", MIN_MOTION_TAKES - 5)):
            for i in range(n):
                writer.writerow([label, label, f"{label}_{i:03d}.csv", 20, i])

    ok, report = validate_motion(path)
    assert ok is False
    assert any("'negative'" in line and "FAIL" in line for line in report)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_validate_data.py -v`
Expected: FAIL / ERROR — `validate_data` module doesn't exist yet.

- [ ] **Step 3: Implement `ml/validate_data.py`**

```python
"""Validate collected Phase 1 data against the spec's acceptance criteria.

Run after using collect_static.py / collect_motion.py to record real data:
`python validate_data.py`
"""
from __future__ import annotations

import argparse
import csv
import os
from collections import Counter

from collect_motion import MOTION_LABELS
from collect_static import STATIC_LETTERS
from collection_utils import landmark_row_header

MIN_STATIC_SAMPLES = 150
MIN_MOTION_TAKES = 40


def validate_static(csv_path):
    """Returns (ok: bool, report: list[str]) for the static-letter dataset."""
    if not os.path.exists(csv_path):
        return False, [f"MISSING: {csv_path} does not exist yet."]

    expected_header = landmark_row_header()
    with open(csv_path, newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header != expected_header:
            return False, [f"MALFORMED: header {header!r} does not match expected {expected_header!r}"]

        counts = Counter()
        malformed = 0
        for row in reader:
            if len(row) != len(expected_header):
                malformed += 1
                continue
            counts[row[0]] += 1

    ok = malformed == 0
    report = []
    if malformed:
        ok = False
        report.append(f"FAIL: {malformed} malformed row(s) found.")

    for letter in STATIC_LETTERS:
        n = counts.get(letter, 0)
        status = "OK" if n >= MIN_STATIC_SAMPLES else "FAIL"
        if status == "FAIL":
            ok = False
        report.append(f"{status}: '{letter}' has {n} samples (need >= {MIN_STATIC_SAMPLES})")

    extra = set(counts) - set(STATIC_LETTERS)
    if extra:
        ok = False
        report.append(f"FAIL: unexpected labels in dataset: {sorted(extra)}")

    return ok, report


def validate_motion(manifest_path):
    """Returns (ok: bool, report: list[str]) for the motion-sequence dataset."""
    if not os.path.exists(manifest_path):
        return False, [f"MISSING: {manifest_path} does not exist yet."]

    with open(manifest_path, newline="") as f:
        reader = csv.DictReader(f)
        counts = Counter(row["label"] for row in reader)

    ok = True
    report = []
    for label in MOTION_LABELS:
        n = counts.get(label, 0)
        status = "OK" if n >= MIN_MOTION_TAKES else "FAIL"
        if status == "FAIL":
            ok = False
        report.append(f"{status}: '{label}' has {n} takes (need >= {MIN_MOTION_TAKES})")

    extra = set(counts) - set(MOTION_LABELS)
    if extra:
        ok = False
        report.append(f"FAIL: unexpected labels in manifest: {sorted(extra)}")

    return ok, report


def main():
    parser = argparse.ArgumentParser(description="Validate Phase 1 collected data against acceptance criteria.")
    parser.add_argument("--static-csv",
                         default=os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv"))
    parser.add_argument("--motion-manifest",
                         default=os.path.join(os.path.dirname(__file__), "data", "motion_sequences", "manifest.csv"))
    args = parser.parse_args()

    static_ok, static_report = validate_static(args.static_csv)
    motion_ok, motion_report = validate_motion(args.motion_manifest)

    print("=== Static letters ===")
    print("\n".join(static_report))
    print("\n=== Motion sequences ===")
    print("\n".join(motion_report))

    overall_ok = static_ok and motion_ok
    print(f"\nOverall: {'PASS' if overall_ok else 'FAIL'}")
    raise SystemExit(0 if overall_ok else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/test_validate_data.py -v`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/squidspell
git add ml/validate_data.py ml/tests/test_validate_data.py
git commit -m "Phase 1: acceptance-criteria validator for collected data"
```

---

### Task 5: Runbook + decisions log + final acceptance check

**Files:**
- Create: `ml/README.md`
- Modify: `DECISIONS.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing new for later phases to import — this is documentation and final verification only. Phase 2 reads `ml/README.md` to know how the data it trains on was produced, and reads `DECISIONS.md` for the exact constants (confidence threshold, frame counts, resample length) used.

- [ ] **Step 1: Write `ml/README.md`**

```markdown
# ml/ — Data Collection, Training, Evaluation

## Collecting data (you, not an agent — needs a real webcam)

Activate the repo's shared venv first: `cd ~/squidspell && source .venv/bin/activate && cd ml`

**Static letters (24 total: A-I, K-Y).** Run once per letter, repeating until you hit at
least 150 confident samples for that letter (each run adds `--num-frames` more, default 200,
so one run per letter is usually enough):

```bash
python collect_static.py --letter A
python collect_static.py --letter B
# ...repeat for all 24 letters (A-I, K-Y — J and Z are motion letters, see below)
```

Hold the pose steadily once recording starts — frames where MediaPipe can't confidently see
your hand (confidence < 0.7) or doesn't detect a hand at all are automatically skipped and
don't count toward the total. Press ESC in the video window to stop a run early.

**Motion letters (J, Z) and negative examples.** Run repeatedly per class until you have at
least 40 takes each (aim for 40-60, per the spec) — each run captures exactly one take:

```bash
python collect_motion.py --letter J   # repeat ~40-60 times, performing the J motion each time
python collect_motion.py --letter Z   # repeat ~40-60 times, performing the Z motion each time
python collect_motion.py --letter negative   # repeat ~40-60 times: reposition, sign other
                                              # letters, idle drift — anything that ISN'T J or Z
```

Each take is a ~1.3-second recording window (after a 3-second countdown). If fewer than 2
confident frames are captured in that window, the take is discarded automatically (printed
to the console) and doesn't get saved — just run the command again.

## Checking your progress

At any point, check whether you've met the acceptance criteria:

```bash
python validate_data.py
```

This prints a per-letter (static) and per-class (motion) report and exits non-zero if
anything is still short. Keep collecting for whichever letters/classes show `FAIL`.

## Output locations

- `data/static_landmarks.csv` — one row per confident static-letter frame.
- `data/motion_sequences/<LABEL>_<NNN>.csv` — one file per motion take (20 resampled frames).
- `data/motion_sequences/manifest.csv` — index of every motion take (label, source, filepath,
  raw frame count, capture timestamp) — this is what Phase 2's training script will load.

All of the above are gitignored (see root `.gitignore`) — they're regenerable from these
scripts and aren't meant to be committed.
```

- [ ] **Step 2: Update `DECISIONS.md`**

Append this entry (keep everything else in the file unchanged):

```markdown
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
these exact floors: `MIN_STATIC_SAMPLES = 150`, `MIN_MOTION_TAKES = 40`).
```

- [ ] **Step 3: Run the full Phase 1 test suite**

Run: `cd ~/squidspell && source .venv/bin/activate && cd ml && python -m pytest tests/ -v`
Expected: all tests across all four test files PASS (target: 30+ tests, 0 failures).

- [ ] **Step 4: Update `HANDOFF.md`**

Replace the `**Next up:**` paragraph and the `**Nothing blocking...**` line at the bottom
with:

```markdown
**Next up:** Phase 1's code is done and tested, but the actual dataset does not exist yet —
that requires the project owner at a webcam (see `ml/README.md` for exact commands). Run
`cd ml && python validate_data.py` at any time to check progress against the acceptance
floors (150 samples/letter x24, 40 takes/class x3). Once `validate_data.py` reports overall
PASS, Phase 2 (Feature Engineering & Model Training) can start — see
`docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 2" section.

**Before starting Phase 2, read:**
- `DECISIONS.md` in full — the `[Phase 1]` entry documents the exact constants (confidence
  threshold, frame counts, resample length, per-take file format) Phase 2's training script
  needs to know about.
- `ml/README.md` for where the data actually lives.
- The Phase 2 section of the full-phases spec doc.

**Blocking Phase 2: the real dataset must exist and `python ml/validate_data.py` must report
overall PASS.** This is a human task (data collection), not an agent task.
```

- [ ] **Step 5: Commit and push**

```bash
cd ~/squidspell
git add ml/README.md DECISIONS.md HANDOFF.md
git commit -m "Phase 1: runbook, decisions log, and handoff update"
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** `collect_static.py` (24 letters, keypress-triggered capture, confidence/no-hand skip, CSV schema) and `collect_motion.py` (J/Z + negative, resampling to fixed length, manifest) both match the Phase 1 spec section's tasks. The spec's acceptance criteria (actual row/take counts) are explicitly out of scope for this plan's tasks — they're a human follow-up, called out in Task 5 and `HANDOFF.md` rather than silently assumed done.
- **No placeholders:** all file contents above are complete, working Python — no TODOs, no "add error handling here."
- **Type/interface consistency:** `hand_processor` for static capture returns `(landmarks, score)` (a tuple — static needs both landmarks and confidence); `hand_processor` for motion capture returns `landmarks` alone (motion doesn't gate per-frame on confidence, only on hand presence — dropping frames with no hand, per the spec's "skip frames... no hand is detected", while confidence gating is a static-only requirement in the spec). This asymmetry is intentional, not a bug — flagged here so a reviewer doesn't flag it as an inconsistency.
