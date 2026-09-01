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
from dataclasses import dataclass

# --- Static smoothing -------------------------------------------------------
STATIC_VOTE_WINDOW = 12     # frames in the majority-vote window
STATIC_STABLE_MS = 800      # majority must hold this long before a letter commits
                           # (raised from 8/500 after the 2026-08-31 live pass: a
                           #  handshape passed through between two letters was
                           #  committing before the signer settled on the target)


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
        if label is None:
            # Hand not visible this frame: keep the stability clock running so a
            # 1-2 frame dropout doesn't reset a held letter, but never *commit*
            # a letter on a frame where the hand isn't there.
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
MOTION_NO_HAND_ABORT = 3  # consecutive no-hand frames while armed -> abandon the gesture


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


def _trim_still(frames, stop_velocity):
    """Drop leading and trailing frames whose centroid barely moved relative to
    their neighbour (idle approach / idle hold), so the motion classifier sees
    the gesture segment rather than the whole rolling buffer. Returns the input
    unchanged if trimming would leave fewer than 2 frames."""
    n = len(frames)
    if n < 3:
        return frames
    lo = 0
    while lo + 1 < n and _dist(centroid(frames[lo]), centroid(frames[lo + 1])) < stop_velocity:
        lo += 1
    hi = n
    while hi - 1 > lo and _dist(centroid(frames[hi - 1]), centroid(frames[hi - 2])) < stop_velocity:
        hi -= 1
    trimmed = frames[lo:hi]
    return trimmed if len(trimmed) >= 2 else frames


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
        no_hand_abort=MOTION_NO_HAND_ABORT,
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
        self._no_hand_abort = no_hand_abort
        self._armed = False
        self._armed_at_len = 0
        self._no_hand_streak = 0

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
            return (None, 0.0, False)

        if hand_present:
            self._no_hand_streak = 0
        else:
            self._no_hand_streak += 1
            if self._no_hand_streak >= self._no_hand_abort:
                self._armed = False
                self._armed_at_len = 0
                self._no_hand_streak = 0
                return (None, 0.0, True)   # discard + clear

        stopped = (not hand_present) or (_velocity(buffer) < self._stop_velocity)
        window_full = len(buffer) >= self._buffer_len
        enough = len(buffer) - self._armed_at_len >= self._min_segment_frames
        if window_full or (stopped and enough):
            label, conf = self._motion.predict(_trim_still(buffer, self._stop_velocity))
            self._armed = False
            self._armed_at_len = 0
            self._no_hand_streak = 0
            if label in ("J", "Z") and conf >= self._min_confidence:
                return (label, conf, True)
            return (None, 0.0, True)
        return (None, 0.0, False)

    def reset(self):
        self._armed = False
        self._armed_at_len = 0
        self._no_hand_streak = 0


@dataclass
class FrameResult:
    static_label: str | None
    static_confidence: float
    motion_active: bool
    committed_letter: str | None
    committed_confidence: float
    committed_source: str | None


class InferenceEngine:
    """Owns the rolling landmark buffer and merges the static + motion paths.
    One call per webcam frame. The precedence rule: while the motion gate is
    armed, static per-frame commits are suppressed (and the smoother is not
    advanced) so a J/Z in progress does not also spam static letters.
    """

    def __init__(
        self,
        static_predictor,
        motion_predictor,
        *,
        buffer_len=MOTION_BUFFER_LEN,
        smoother=None,
        gate=None,
    ):
        self._static = static_predictor
        self._buffer = deque(maxlen=buffer_len)
        self._smoother = smoother if smoother is not None else StaticSmoother()
        self._gate = (
            gate
            if gate is not None
            else MotionGate(static_predictor, motion_predictor, buffer_len=buffer_len)
        )
        # The gate's window_full trigger must track the real rolling-buffer
        # capacity (this deque's maxlen), or `len(buffer) - _armed_at_len` can
        # silently freeze once the deque saturates. See DECISIONS.md [Phase 3].
        self._gate._buffer_len = buffer_len

    def process_frame(self, landmarks, now_ms):
        hand_present = landmarks is not None
        if hand_present:
            self._buffer.append(landmarks)

        committed_motion, committed_motion_conf, should_clear = self._gate.update(
            list(self._buffer), hand_present, now_ms
        )
        if should_clear:
            self._buffer.clear()
            self._smoother.reset()

        if committed_motion is not None:
            return FrameResult(
                static_label=None,
                static_confidence=0.0,
                motion_active=self._gate.active,
                committed_letter=committed_motion,
                committed_confidence=committed_motion_conf,
                committed_source="motion",
            )

        if hand_present:
            static_label, static_conf = self._static.predict(landmarks)
        else:
            static_label, static_conf = None, 0.0

        if self._gate.active:
            committed_static = None
        else:
            committed_static = self._smoother.update(static_label, now_ms)

        return FrameResult(
            static_label=static_label,
            static_confidence=static_conf,
            motion_active=self._gate.active,
            committed_letter=committed_static,
            committed_confidence=static_conf if committed_static else 0.0,
            committed_source="static" if committed_static else None,
        )

    def reset(self):
        self._buffer.clear()
        self._smoother.reset()
        self._gate.reset()
