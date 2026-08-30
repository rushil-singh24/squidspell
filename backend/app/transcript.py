"""Server-authoritative Train-mode transcript. One TranscriptBuilder per
train-mode WebSocket connection (see main.py). Pure — no FastAPI import.

The inference layer commits each letter exactly once per stable run, so
commit_letter appends unconditionally; the only guard is against a byte-
identical duplicate frame. No time-window dedupe (it would eat deliberate
double letters like the L's in HELLO). See DECISIONS.md [Phase 6].
"""
from __future__ import annotations

VALID_ACTIONS = ("delete", "space", "clear")

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
        token = (letter, timestamp)
        if token == self._last:
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
        return self._text != before

    def reset(self) -> None:
        self._text = ""
        self._last = None
