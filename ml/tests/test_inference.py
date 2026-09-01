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
    assert sm.update("A", 0) is None
    assert sm.update(None, 50) is None
    assert sm.update(None, 100) is None
    assert sm.update(None, 150) is None
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
    assert STATIC_VOTE_WINDOW == 12
    assert STATIC_STABLE_MS == 650


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
    committed, conf, clear = gate.update(_still_buffer(10), hand_present=True, now_ms=0)
    assert (committed, conf, clear) == (None, 0.0, False)
    assert gate.active is False


def test_gate_arms_on_movement_plus_matching_start_pose():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.9))
    committed, conf, clear = gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    assert (committed, conf, clear) == (None, 0.0, False)
    assert gate.active is True


def test_gate_does_not_arm_when_start_pose_unmatched():
    gate = MotionGate(_ScriptedStatic("B", 0.99), _ScriptedMotion("J", 0.9))
    committed, conf, clear = gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    assert gate.active is False
    assert (committed, conf, clear) == (None, 0.0, False)


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
    committed, conf, clear = gate.update(buf, hand_present=True, now_ms=100)
    assert committed == "J"
    assert conf == pytest.approx(0.95)
    assert clear is True
    assert gate.active is False
    assert motion.calls == 1


def test_gate_discards_on_negative_class():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("negative", 0.9))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, conf, clear = gate.update(buf, hand_present=True, now_ms=100)
    assert committed is None
    assert clear is True
    assert gate.active is False


def test_gate_discards_on_low_confidence_jz():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.4))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, conf, clear = gate.update(buf, hand_present=True, now_ms=100)
    assert (committed, conf, clear) == (None, 0.0, True)


def test_gate_forces_classification_when_buffer_full():
    motion = _ScriptedMotion("Z", 0.9)
    gate = MotionGate(_ScriptedStatic("D", 0.9), motion)
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)          # arm (D -> Z)
    full = _moving_buffer(MOTION_BUFFER_LEN)   # still "moving", never stops
    committed, conf, clear = gate.update(full, hand_present=True, now_ms=200)
    assert committed == "Z"
    assert clear is True


def test_gate_classifies_when_hand_disappears_while_armed():
    motion = _ScriptedMotion("J", 0.9)
    gate = MotionGate(_ScriptedStatic("I", 0.9), motion)
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    buf = _moving_buffer(10) + _still_buffer(6, cx=0.8, cy=0.5)
    committed, conf, clear = gate.update(buf, hand_present=False, now_ms=100)
    assert committed == "J"


def test_gate_reset_returns_to_idle():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.9))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)
    gate.reset()
    assert gate.active is False


def test_start_poses_default_mapping():
    assert MOTION_START_POSES == {"I": "J", "D": "Z", "X": "Z"}


from inference import FrameResult, InferenceEngine


def test_engine_static_commit_flows_through():
    eng = InferenceEngine(_ScriptedStatic("A", 0.9), _ScriptedMotion("J", 0.9))
    # still hand at center -> gate never arms; smoother commits "A" after STATIC_STABLE_MS (650ms)
    r = None
    for t in range(0, 1100, 33):
        r = eng.process_frame(_hand_at(0.5, 0.5), now_ms=t)
    assert isinstance(r, FrameResult)
    # somewhere in that loop "A" was committed exactly once
    # re-run fresh and capture:
    eng2 = InferenceEngine(_ScriptedStatic("A", 0.9), _ScriptedMotion("J", 0.9))
    commits = [
        eng2.process_frame(_hand_at(0.5, 0.5), now_ms=t).committed_letter
        for t in range(0, 1100, 33)
    ]
    assert commits.count("A") == 1


def test_engine_suppresses_static_commit_while_gate_armed():
    # static predictor always says "I" (a start pose) with high confidence;
    # moving buffer -> gate arms -> static commits must be suppressed
    eng = InferenceEngine(_ScriptedStatic("I", 0.9), _ScriptedMotion("negative", 0.1))
    xs = [0.2 + 0.02 * k for k in range(12)]   # steady movement, never "stops"
    commits = []
    for k, x in enumerate(xs):
        res = eng.process_frame(_hand_at(x, 0.5), now_ms=k * 100)
        commits.append((res.motion_active, res.committed_letter))
    # gate became active at some point
    assert any(active for active, _ in commits)
    # while active, no static letter was committed
    assert all(letter is None for active, letter in commits if active)


def test_engine_motion_commit_clears_buffer_and_smoother():
    eng = InferenceEngine(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.95))
    # arm with movement
    for k in range(10):
        eng.process_frame(_hand_at(0.2 + 0.03 * k, 0.5), now_ms=k * 30)
    # then hold still to trigger classification
    res = None
    for k in range(10, 20):
        res = eng.process_frame(_hand_at(0.5, 0.5), now_ms=k * 30)
        if res.committed_letter:
            break
    assert res.committed_letter == "J"
    assert res.committed_source == "motion"
    assert len(eng._buffer) == 0


def test_engine_handles_no_hand_frames():
    eng = InferenceEngine(_ScriptedStatic("A", 0.9), _ScriptedMotion("J", 0.9))
    res = eng.process_frame(None, now_ms=0)
    assert res.static_label is None
    assert res.static_confidence == 0.0
    assert res.committed_letter is None


def test_engine_reset():
    eng = InferenceEngine(_ScriptedStatic("A", 0.9), _ScriptedMotion("J", 0.9))
    eng.process_frame(_hand_at(0.5, 0.5), now_ms=0)
    eng.reset()
    assert len(eng._buffer) == 0


def test_none_frame_never_commits_but_clock_survives_brief_dropout():
    sm = StaticSmoother(window=5, stable_ms=100)
    assert sm.update("A", 0) is None
    assert sm.update(None, 60) is None       # brief dropout: no commit
    assert sm.update(None, 120) is None      # still no commit, even past stable_ms
    assert sm.update("A", 140) == "A"        # lands on the next real-hand frame


from inference import MOTION_STOP_VELOCITY, _trim_still


def test_trim_still_keeps_all_moving_frames():
    buf = _moving_buffer(12)
    result = _trim_still(buf, MOTION_STOP_VELOCITY)
    assert len(result) == 12


def test_trim_still_drops_leading_still_frames():
    buf = _still_buffer(6, 0.5, 0.5) + _moving_buffer(10, 0.2, 0.8)
    result = _trim_still(buf, MOTION_STOP_VELOCITY)
    assert len(result) < 16
    # near-stationary approach frames are gone (at most the one boundary frame
    # survives); the segment now begins in the moving section.
    still_x = centroid(_hand_at(0.5, 0.5))[0]
    leading_still = sum(1 for f in result if centroid(f)[0] == pytest.approx(still_x))
    assert leading_still <= 1
    assert centroid(result[-1])[0] == pytest.approx(centroid(_hand_at(0.8, 0.5))[0])


def test_trim_still_drops_trailing_still_frames():
    buf = _moving_buffer(10, 0.2, 0.8) + _still_buffer(6, 0.8, 0.5)
    result = _trim_still(buf, MOTION_STOP_VELOCITY)
    assert len(result) < 16
    # last frame is a moving-section frame, not an idle hold frame
    assert result[-1] == _moving_buffer(10, 0.2, 0.8)[-1]


def test_trim_still_returns_fully_still_buffer_unchanged():
    buf = _still_buffer(10)
    result = _trim_still(buf, MOTION_STOP_VELOCITY)
    # trimming would leave < 2 frames -> fall back to the whole buffer
    assert result is buf


def test_trim_still_returns_short_buffer_unchanged():
    buf = _still_buffer(2)
    assert _trim_still(buf, MOTION_STOP_VELOCITY) is buf


def test_gate_trims_idle_frames_before_classifying():
    class _LenSpy:
        def __init__(self):
            self.lengths = []

        def predict(self, frames):
            self.lengths.append(len(frames))
            return ("negative", 0.1)

    spy = _LenSpy()
    gate = MotionGate(_ScriptedStatic("I", 0.9), spy)
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)          # arm
    buf = _moving_buffer(8) + _still_buffer(8, cx=0.8, cy=0.5)            # 16 frames, 8 idle hold
    gate.update(buf, hand_present=False, now_ms=100)                     # stopped -> classify
    assert spy.lengths == [8]
    assert spy.lengths[0] < 16


def test_gate_abandons_when_hand_gone_for_consecutive_frames():
    gate = MotionGate(_ScriptedStatic("I", 0.9), _ScriptedMotion("J", 0.9))
    gate.update(_moving_buffer(10), hand_present=True, now_ms=0)   # arm
    assert gate.active is True
    frozen = _moving_buffer(10)   # engine does not grow the buffer on no-hand frames
    last = None
    for k in range(1, 4):         # 3 consecutive no-hand frames
        last = gate.update(frozen, hand_present=False, now_ms=k * 30)
    assert gate.active is False
    assert last == (None, 0.0, True)


def test_engine_recovers_after_hand_disappears_mid_gesture():
    eng = InferenceEngine(_ScriptedStatic("I", 0.9), _ScriptedMotion("negative", 0.2))
    for k in range(8):
        eng.process_frame(_hand_at(0.2 + 0.03 * k, 0.5), now_ms=k * 30)   # arm via movement
    assert eng._gate.active is True
    for k in range(8, 14):
        eng.process_frame(None, now_ms=k * 30)                            # hand gone
    assert eng._gate.active is False
    assert len(eng._buffer) == 0
    committed = [
        eng.process_frame(_hand_at(0.5, 0.5), now_ms=k * 30).committed_letter
        for k in range(14, 44)
    ]
    assert "I" in committed        # static path is un-wedged again
