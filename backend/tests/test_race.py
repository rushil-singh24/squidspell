import pytest
from app.race import RaceState, RACE_DURATIONS, RACE_WORDS


def test_word_pool_is_reasonable():
    assert len(RACE_WORDS) >= 20
    assert all(w.islower() and 2 <= len(w) <= 5 for w in RACE_WORDS)
    assert RACE_DURATIONS == (15, 30, 60)


def test_start_requires_valid_duration():
    r = RaceState(seed=1)
    with pytest.raises(ValueError):
        r.start(45, 0)
    r.start(15, 0)
    assert r.phase == "running"


def test_seeded_start_is_deterministic():
    a = RaceState(seed=7); a.start(30, 0)
    b = RaceState(seed=7); b.start(30, 0)
    assert a.snapshot(0)["target_word"] == b.snapshot(0)["target_word"]
    assert a.snapshot(0)["upcoming"] == b.snapshot(0)["upcoming"]


def test_correct_letters_advance_the_word_and_queue():
    r = RaceState(seed=3); r.start(60, 0)
    word = r.snapshot(0)["target_word"]
    t = 0
    for ch in word:
        t += 100
        r.commit_letter(ch, t)
    snap = r.snapshot(t)
    assert snap["word_index"] == 1
    assert snap["typed"] == ""
    assert snap["correct_letters"] == len(word)
    assert snap["attempted_letters"] == len(word)


def test_wrong_letter_does_not_advance_but_counts_as_attempt():
    r = RaceState(seed=3); r.start(60, 0)
    word = r.snapshot(0)["target_word"]
    wrong = "z" if word[0] != "z" else "q"
    r.commit_letter(wrong, 100)
    snap = r.snapshot(100)
    assert snap["typed"] == ""
    assert snap["word_index"] == 0
    assert snap["correct_letters"] == 0
    assert snap["attempted_letters"] == 1


def test_tick_finishes_race_and_produces_results():
    r = RaceState(seed=3); r.start(15, 0)
    word = r.snapshot(0)["target_word"]
    t = 0
    for ch in word:
        t += 200
        r.commit_letter(ch, t)
    r.tick(15_000)
    snap = r.snapshot(15_000)
    assert snap["phase"] == "finished"
    res = snap["results"]
    assert res is not None
    assert res["spm"] == pytest.approx(len(word) / (15 / 60), rel=1e-3)
    assert 0.0 <= res["accuracy"] <= 1.0
    assert isinstance(res["consistency"], float)
    assert 0.0 <= res["consistency"] <= 100.0
    assert res["duration_s"] == 15


def test_results_consistency_is_none_with_under_two_gaps():
    r = RaceState(seed=3); r.start(15, 0)
    word = r.snapshot(0)["target_word"]
    r.commit_letter(word[0], 200)  # one commit -> zero gaps
    r.tick(15_000)
    res = r.snapshot(15_000)["results"]
    assert res["consistency"] is None
    assert res["duration_s"] == 15


def test_commit_ignored_before_start_and_after_finish():
    r = RaceState(seed=1)
    r.commit_letter("a", 0)                 # idle -> ignored
    assert r.snapshot(0)["attempted_letters"] == 0
    r.start(15, 0); r.tick(20_000)
    r.commit_letter("a", 21_000)            # finished -> ignored
    assert r.snapshot(21_000)["attempted_letters"] == 0


def test_seconds_left_counts_down():
    r = RaceState(seed=1); r.start(30, 1_000)
    assert r.snapshot(1_000)["seconds_left"] == 30
    assert r.snapshot(11_000)["seconds_left"] == 20
    assert r.snapshot(40_000)["seconds_left"] == 0


def test_upcoming_never_runs_dry():
    r = RaceState(seed=2); r.start(60, 0)
    # sign ~ (pool + 3) words correctly; queue must have auto-extended
    t = 0
    for _ in range(len(RACE_WORDS) + 3):
        w = r.snapshot(t)["target_word"]
        assert w is not None
        for ch in w:
            t += 50
            r.commit_letter(ch, t)
    assert len(r.snapshot(t)["upcoming"]) >= 1
