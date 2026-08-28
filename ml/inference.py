"""Hardware-free real-time inference logic for the Phase 3 standalone demo:
a rolling landmark buffer, a majority-vote static smoother, and a motion-gate
state machine, tied together by InferenceEngine.process_frame().

Nothing here imports cv2 or mediapipe — ml/live_demo.py owns that wiring and
feeds this module plain landmark frames. All tunable numbers are module-level
constants; they are the targets of the live-webcam tuning pass (see
DECISIONS.md [Phase 3]).

A "frame" is a list of 21 (x, y, z) float tuples; None means no hand detected.
"""
from __future__ import annotations

import math
from collections import Counter, deque

# --- Static smoothing -------------------------------------------------------
STATIC_VOTE_WINDOW = 8      # frames in the majority-vote window
STATIC_STABLE_MS = 500      # majority must hold this long before a letter commits


def _majority(labels):
    """Most common non-None label in `labels`, or None if there is no non-None label."""
    counts = Counter(x for x in labels if x is not None)
    if not counts:
        return None
    return counts.most_common(1)[0][0]


class StaticSmoother:
    def __init__(self, window: int = STATIC_VOTE_WINDOW, stable_ms: float = STATIC_STABLE_MS):
        self._history = deque(maxlen=window)
        self._stable_ms = stable_ms
        self._current = None       # current majority label
        self._since_ms = None      # when `_current` became the majority
        self._committed = False    # already emitted for this stable run?

    def update(self, label, now_ms):
        self._history.append(label)
        majority = _majority(self._history)
        if majority != self._current:
            self._current = majority
            self._since_ms = now_ms
            self._committed = False
            return None
        if (
            majority is not None
            and not self._committed
            and now_ms - self._since_ms >= self._stable_ms
        ):
            self._committed = True
            return majority
        return None

    def reset(self):
        self._history.clear()
        self._current = None
        self._since_ms = None
        self._committed = False


# --- Motion gating --------------------------------------------------------
MOTION_BUFFER_LEN = 30            # max frames kept in the rolling buffer (~1s at 30fps)
MOTION_MOVEMENT_THRESHOLD = 0.15  # centroid displacement over the buffer to arm the gate
MOTION_STOP_VELOCITY = 0.02       # per-frame centroid delta below which motion is "stopped"
MOTION_MIN_SEGMENT_FRAMES = 5     # frames of motion required before a stop can classify
MOTION_MIN_CONFIDENCE = 0.6       # min motion-model confidence to commit a J/Z
MOTION_START_POSE_CONFIDENCE = 0.5  # min static confidence for the start-pose precondition
MOTION_START_POSES = {"I": "J", "D": "Z"}  # static label -> motion letter it gates


def centroid(frame):
    n = len(frame)
    sx = sum(p[0] for p in frame)
    sy = sum(p[1] for p in frame)
    sz = sum(p[2] for p in frame)
    return (sx / n, sy / n, sz / n)


def _dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _displacement(buffer):
    return _dist(centroid(buffer[0]), centroid(buffer[-1]))


def _velocity(buffer):
    if len(buffer) < 2:
        return float("inf")
    return _dist(centroid(buffer[-2]), centroid(buffer[-1]))


class MotionGate:
    def __init__(
        self,
        static_predictor,
        motion_predictor,
        *,
        movement_threshold=MOTION_MOVEMENT_THRESHOLD,
        stop_velocity=MOTION_STOP_VELOCITY,
        min_segment_frames=MOTION_MIN_SEGMENT_FRAMES,
        min_confidence=MOTION_MIN_CONFIDENCE,
        start_pose_confidence=MOTION_START_POSE_CONFIDENCE,
        start_poses=None,
        buffer_len=MOTION_BUFFER_LEN,
    ):
        self._static = static_predictor
        self._motion = motion_predictor
        self._movement_threshold = movement_threshold
        self._stop_velocity = stop_velocity
        self._min_segment_frames = min_segment_frames
        self._min_confidence = min_confidence
        self._start_pose_confidence = start_pose_confidence
        self._start_poses = dict(MOTION_START_POSES if start_poses is None else start_poses)
        self._buffer_len = buffer_len
        self._armed = False
        self._armed_at_len = 0

    @property
    def active(self):
        return self._armed

    def update(self, buffer, hand_present, now_ms):
        if not self._armed:
            if (
                hand_present
                and len(buffer) >= self._min_segment_frames
                and _displacement(buffer) >= self._movement_threshold
            ):
                label, conf = self._static.predict(buffer[0])
                if label in self._start_poses and conf >= self._start_pose_confidence:
                    self._armed = True
                    self._armed_at_len = len(buffer)
            return (None, False)

        stopped = (not hand_present) or (_velocity(buffer) < self._stop_velocity)
        window_full = len(buffer) >= self._buffer_len
        enough = len(buffer) - self._armed_at_len >= self._min_segment_frames
        if window_full or (stopped and enough):
            label, conf = self._motion.predict(buffer)
            self._armed = False
            self._armed_at_len = 0
            if label in ("J", "Z") and conf >= self._min_confidence:
                return (label, True)
            return (None, True)
        return (None, False)

    def reset(self):
        self._armed = False
        self._armed_at_len = 0
