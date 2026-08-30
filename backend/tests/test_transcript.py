import pytest
from app.transcript import TranscriptBuilder, VALID_ACTIONS, GESTURE_ACTIONS


def test_commit_letters_appends_uppercase():
    b = TranscriptBuilder()
    assert b.commit_letter("h", 1) is True
    assert b.commit_letter("i", 2) is True
    assert b.text == "HI"


def test_deliberate_double_letter_is_kept():
    b = TranscriptBuilder()
    b.commit_letter("L", 100)
    b.commit_letter("L", 700)          # distinct frame -> second L kept
    assert b.text == "LL"


def test_exact_duplicate_frame_is_ignored():
    b = TranscriptBuilder()
    b.commit_letter("A", 5)
    assert b.commit_letter("A", 5) is False   # same (letter,timestamp) -> ignored
    assert b.text == "A"


def test_delete_space_clear():
    b = TranscriptBuilder()
    for i, ch in enumerate("cat"):
        b.commit_letter(ch, i)
    assert b.apply("delete") is True and b.text == "CA"
    assert b.apply("space") is True and b.text == "CA "
    assert b.apply("space") is False and b.text == "CA "     # no double space
    assert b.apply("delete") is True and b.text == "CA"
    assert b.apply("clear") is True and b.text == ""
    assert b.apply("clear") is False                          # no-op on empty
    assert b.apply("delete") is False                         # no-op on empty
    assert b.apply("space") is False                          # no leading space


def test_apply_rejects_unknown_action():
    with pytest.raises(ValueError):
        TranscriptBuilder().apply("backspace")


def test_reset_and_config_surface():
    b = TranscriptBuilder()
    b.commit_letter("x", 1)
    b.reset()
    assert b.text == ""
    assert VALID_ACTIONS == ("delete", "space", "clear")
    assert GESTURE_ACTIONS == {}
