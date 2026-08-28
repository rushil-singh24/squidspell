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
