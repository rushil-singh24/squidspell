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
