import pytest

from inference import STATIC_STABLE_MS, STATIC_VOTE_WINDOW, StaticSmoother


def test_no_commit_before_stable_ms():
    sm = StaticSmoother(window=5, stable_ms=500)
    # feed "A" every 100ms; should not commit until >= 500ms elapsed
    assert sm.update("A", 0) is None
    assert sm.update("A", 100) is None
    assert sm.update("A", 200) is None
    assert sm.update("A", 400) is None
    assert sm.update("A", 499) is None


def test_commits_once_after_stable_ms():
    sm = StaticSmoother(window=5, stable_ms=500)
    sm.update("A", 0)
    assert sm.update("A", 500) == "A"
    # no re-commit while "A" stays the majority
    assert sm.update("A", 600) is None
    assert sm.update("A", 5000) is None


def test_majority_vote_ignores_minority_jitter():
    sm = StaticSmoother(window=5, stable_ms=100)
    sm.update("A", 0)
    sm.update("A", 20)
    sm.update("B", 40)   # single jitter frame, "A" still majority
    sm.update("A", 60)
    assert sm.update("A", 200) == "A"


def test_new_letter_can_commit_after_change():
    sm = StaticSmoother(window=3, stable_ms=100)
    sm.update("A", 0)
    assert sm.update("A", 100) == "A"
    # switch to B: fill the window with B
    sm.update("B", 200)
    sm.update("B", 220)
    sm.update("B", 240)
    assert sm.update("B", 400) == "B"


def test_none_label_breaks_stability():
    sm = StaticSmoother(window=3, stable_ms=100)
    sm.update("A", 0)
    # hand disappears: window fills with None -> majority is None -> no commit
    sm.update(None, 50)
    sm.update(None, 100)
    sm.update(None, 150)
    assert sm.update(None, 500) is None


def test_reset_clears_state():
    sm = StaticSmoother(window=3, stable_ms=100)
    sm.update("A", 0)
    sm.update("A", 100)
    sm.reset()
    sm.update("A", 200)
    assert sm.update("A", 260) is None      # stability clock restarted at 200
    assert sm.update("A", 300) == "A"


def test_default_constants():
    assert STATIC_VOTE_WINDOW == 8
    assert STATIC_STABLE_MS == 500


from inference import (
    MOTION_BUFFER_LEN,
    MOTION_START_POSES,
    MotionGate,
    centroid,
)


class _ScriptedStatic:
    """Returns a fixed (label, conf) regardless of input."""

    def __init__(self, label, conf):
        self.ret = (label, conf)

    def predict(self, landmarks):
        return self.ret


class _ScriptedMotion:
    def __init__(self, label, conf):
        self.ret = (label, conf)
        self.calls = 0

    def predict(self, frames):
        self.calls += 1
        return self.ret


def _hand_at(cx, cy):
    """21 landmarks clustered around (cx, cy)."""
    return [(cx + 0.001 * i, cy + 0.001 * i, 0.0) for i in range(21)]


def _still_buffer(n, cx=0.5, cy=0.5):
    return [_hand_at(cx, cy) for _ in range(n)]


def _moving_buffer(n, start=0.2, end=0.8):
    xs = [start + (end - start) * k / (n - 1) for k in range(n)]
    return [_hand_at(x, 0.5) for x in xs]


def test_centroid_is_mean_of_points():
    cx, cy, cz = centroid(_hand_at(0.5, 0.4))
    assert cx == pytest.approx(0.5 + 0.001 * 10)   # mean of 0..20 * 0.001 offset
    assert cy == pytest.approx(0.4 + 0.001 * 10)
    assert cz == pytest.approx(0.0)


def test_gate_stays_idle_when_hand_barely_moves():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.9))
    committed, clear = gate.update(_still_buffer(10), hand_present=True, now_ms=0)
    assert (committed, clear) == (None, False)
    assert gate.active is False


def test_gate_arms_on_movement_plus_matching_start_pose():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.9))
    committed, clear = gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    assert (committed, clear) == (None, False)
    assert gate.active is True


def test_gate_does_not_arm_when_start_pose_unmatched():
    gate = MotionGate(_ScriptedStatic("B", 0.99), _ScriptedMotion("J", 0.9))
    committed, clear = gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    assert gate.active is False
    assert (committed, clear) == (None, False)


def test_gate_does_not_arm_when_start_pose_confidence_low():
    gate = MotionGate(_ScriptedStatic("I", 0.3), _ScriptedMotion("J", 0.9))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    assert gate.active is False


def test_gate_commits_j_when_motion_stops():
    motion = _ScriptedMotion("J", 0.95)
    gate = MotionGate(_ScriptedStatic("I", 0.9), motion)
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)          # arm
    # hand now still for >= min_segment_frames more frames -> classify
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, clear = gate.update(buf, hand_present=True, now_ms=100)
    assert committed == "J"
    assert clear is True
    assert gate.active is False
    assert motion.calls == 1


def test_gate_discards_on_negative_class():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("negative", 0.9))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, clear = gate.update(buf, hand_present=True, now_ms=100)
    assert committed is None
    assert clear is True
    assert gate.active is False


def test_gate_discards_on_low_confidence_jz():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.4))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, clear = gate.update(buf, hand_present=True, now_ms=100)
    assert (committed, clear) == (None, True)


def test_gate_forces_classification_when_buffer_full():
    motion = _ScriptedMotion("Z", 0.9)
    gate = MotionGate(_ScriptedStatic("D", 0.9), motion)
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)          # arm (D -> Z)
    full = _moving_buffer(MOTION_BUFFER_LEN)   # still "moving", never stops
    committed, clear = gate.update(full, hand_present=True, now_ms=200)
    assert committed == "Z"
    assert clear is True


def test_gate_classifies_when_hand_disappears_while_armed():
    motion = _ScriptedMotion("J", 0.9)
    gate = MotionGate(_ScriptedStatic("I", 0.9), motion)
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, clear = gate.update(buf, hand_present=False, now_ms=100)
    assert committed == "J"


def test_gate_reset_returns_to_idle():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.9))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    gate.reset()
    assert gate.active is False


def test_start_poses_default_mapping():
    assert MOTION_START_POSES == {"I": "J", "D": "Z"}
