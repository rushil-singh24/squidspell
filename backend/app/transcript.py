"""Server-authoritative Train-mode transcript. One TranscriptBuilder per
train-mode WebSocket connection (see main.py). Pure — no FastAPI import.

The inference layer commits each letter exactly once per stable run, so
commit_letter appends near-unconditionally; the guards are an empty letter,
a byte-identical duplicate frame, and the MAX_TRANSCRIPT_CHARS length cap.
No time-window dedupe (it would eat deliberate double letters like the L's
in HELLO). See DECISIONS.md [Phase 6].
"""
from __future__ import annotations

VALID_ACTIONS = ("delete", "space", "clear")

# Hard cap on transcript length. The full string is serialised into every
# per-frame outbound envelope, so an unbounded transcript means unbounded
# per-frame redundancy. Past this many characters commit_letter silently
# stops appending. See DECISIONS.md [Phase 6].
MAX_TRANSCRIPT_CHARS = 2000

# static/motion pose label -> action. Empty until Phase 1/2 data collection
# picks control poses visually distinct from the 26 letters. Populating this
# is a one-line change; nothing else in Train mode depends on the poses.
GESTURE_ACTIONS: dict[str, str] = {}


class TranscriptBuilder:
    def __init__(self) -> None:
        self._text = ""
        self._last: tuple[str, float] | None = None

    @property
    def text(self) -> str:
        return self._text

    def commit_letter(self, letter: str, timestamp: float) -> bool:
        if not letter:
            return False
        token = (letter, timestamp)
        if token == self._last:
            return False
        if len(self._text) >= MAX_TRANSCRIPT_CHARS:
            return False
        self._last = token
        self._text += letter.upper()
        return True

    def apply(self, action: str) -> bool:
        if action not in VALID_ACTIONS:
            raise ValueError(f"unknown transcript action: {action!r}")
        before = self._text
        if action == "delete":
            self._text = self._text[:-1]
        elif action == "space":
            if self._text and not self._text.endswith(" "):
                self._text += " "
        elif action == "clear":
            self._text = ""
        self._text = self._text[:MAX_TRANSCRIPT_CHARS]
        return self._text != before

    def load(self, text: str) -> None:
        """Replace the transcript with a previously-saved string so it can be
        reopened for editing. Mirrors commit_letter's uppercase + length cap.
        Resets _last so an identical next committed letter still appends."""
        self._text = text.upper()[:MAX_TRANSCRIPT_CHARS]
        self._last = None

    def reset(self) -> None:
        self._text = ""
        self._last = None
