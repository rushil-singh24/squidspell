import pytest
from app.transcript import (
    MAX_TRANSCRIPT_CHARS,
    TranscriptBuilder,
    VALID_ACTIONS,
    GESTURE_ACTIONS,
)


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


def test_empty_letter_is_a_no_op():
    b = TranscriptBuilder()
    assert b.commit_letter("", 1) is False
    assert b.text == ""


def test_transcript_length_is_capped():
    b = TranscriptBuilder()
    last = True
    for i in range(MAX_TRANSCRIPT_CHARS + 10):
        last = b.commit_letter("a", i)
    assert len(b.text) == MAX_TRANSCRIPT_CHARS
    assert last is False


def test_apply_rejects_unknown_action():
    with pytest.raises(ValueError):
        TranscriptBuilder().apply("backspace")


def test_load_uppercases_and_truncates():
    b = TranscriptBuilder()
    b.load("hello")
    assert b.text == "HELLO"
    b.load("x" * (MAX_TRANSCRIPT_CHARS + 50))
    assert len(b.text) == MAX_TRANSCRIPT_CHARS


def test_load_resets_last_so_identical_next_letter_commits():
    b = TranscriptBuilder()
    b.commit_letter("A", 5)
    b.load("A")
    assert b.text == "A"
    # same (letter, timestamp) as the earlier commit would normally dedupe,
    # but load() cleared _last, so this appends.
    assert b.commit_letter("A", 5) is True
    assert b.text == "AA"


def test_reset_and_config_surface():
    b = TranscriptBuilder()
    b.commit_letter("x", 1)
    b.reset()
    assert b.text == ""
    assert VALID_ACTIONS == ("delete", "space", "clear")
    assert GESTURE_ACTIONS == {}
