"""Pure, server-authoritative Race-mode scorer.

No web layer, no ML: stdlib only. Task 2 (the WS layer) consumes ``RaceState``
and relies on ``snapshot`` returning an *equal* dict across frames when the race
state has not meaningfully changed (change-only delivery via dict-equality), so
``spm`` and ``seconds_left`` are always integer-rounded here.
"""

from __future__ import annotations

import math
import random
import statistics

RACE_DURATIONS: tuple[int, ...] = (15, 30, 60)

RACE_WORDS: tuple[str, ...] = (
    "cat", "dog", "run", "the", "and", "you", "for", "are", "sun", "day",
    "new", "big", "red", "hot", "fun", "map", "cup", "hat", "bed", "key",
    "car", "box", "egg", "sky", "top", "arm", "leg", "eye", "ear", "cow",
    "pig", "bee", "ant", "oak", "ice", "fog", "mud", "gem", "jam", "owl",
)


class RaceState:
    """Server-side scorer for one Race attempt.

    Lifecycle: ``idle`` -> ``start`` -> ``running`` -> (``tick`` past duration) ->
    ``finished`` -> ``stop``/``start`` again.
    """

    def __init__(
        self,
        words: tuple[str, ...] | None = None,
        seed: int | None = None,
    ) -> None:
        self._words: tuple[str, ...] = tuple(words) if words else RACE_WORDS
        self._seed = seed
        self._phase: str = "idle"
        self._reset()

    # -- internal ----------------------------------------------------------

    def _reset(self) -> None:
        self._queue: list[str] = []
        self._index: int = 0
        self._typed: str = ""
        self._correct: int = 0
        self._attempted: int = 0
        self._gaps: list[float] = []
        self._last_ms: float | None = None
        self._start_ms: float = 0.0
        self._duration_ms: int = 0
        self._rng: random.Random | None = None

    def _shuffled_pool(self) -> list[str]:
        pool = list(self._words)
        assert self._rng is not None
        self._rng.shuffle(pool)
        return pool

    # -- public API ------------------------------------------------------

    @property
    def phase(self) -> str:
        return self._phase

    def start(self, duration_s: int, now_ms: float) -> None:
        if duration_s not in RACE_DURATIONS:
            raise ValueError(f"duration_s must be one of {RACE_DURATIONS}, got {duration_s!r}")
        self._reset()
        self._rng = random.Random(self._seed)
        self._queue = self._shuffled_pool()
        self._start_ms = now_ms
        self._duration_ms = duration_s * 1000
        self._phase = "running"

    def stop(self) -> None:
        self._phase = "idle"
        self._reset()

    def commit_letter(self, letter: str, now_ms: float) -> None:
        if self._phase != "running":
            return

        self._attempted += 1
        if self._last_ms is not None:
            self._gaps.append(now_ms - self._last_ms)
        self._last_ms = now_ms

        target = self._queue[self._index]
        expected = target[len(self._typed)]
        if letter.upper() != expected.upper():
            return  # wrong letter: attempt counted, word does not advance

        self._typed += expected.lower()
        self._correct += 1
        if len(self._typed) == len(target):
            self._index += 1
            self._typed = ""
            if self._index >= len(self._queue) - 5:
                self._queue.extend(self._shuffled_pool())

    def tick(self, now_ms: float) -> None:
        if self._phase == "running" and now_ms - self._start_ms >= self._duration_ms:
            self._phase = "finished"

    def snapshot(self, now_ms: float) -> dict:
        running = self._phase == "running"

        if running:
            target_word: str | None = self._queue[self._index]
            upcoming = list(self._queue[self._index + 1 : self._index + 6])
            seconds_left = max(
                0, math.ceil((self._duration_ms - (now_ms - self._start_ms)) / 1000)
            )
            # Quantize the running spm to whole elapsed seconds so change-only
            # delivery emits a race update ~1x/sec (matching seconds_left) rather
            # than on nearly every frame once the racer has signed a letter.
            elapsed_s = max(
                1,
                int((min(now_ms, self._start_ms + self._duration_ms) - self._start_ms) / 1000),
            )
            spm = round(self._correct / (elapsed_s / 60)) if self._correct > 0 else 0
        else:
            target_word = None
            upcoming = []
            seconds_left = 0
            spm = 0

        results = self._results() if self._phase == "finished" else None

        return {
            "phase": self._phase,
            "target_word": target_word,
            "upcoming": upcoming,
            "word_index": self._index,
            "typed": self._typed,
            "correct_letters": self._correct,
            "attempted_letters": self._attempted,
            "spm": spm,
            "seconds_left": seconds_left,
            "results": results,
        }

    # -- results -------------------------------------------------------------

    def _results(self) -> dict:
        minutes = self._duration_ms / 60000
        spm = round(self._correct / minutes, 1) if minutes else 0.0
        accuracy = round(self._correct / self._attempted, 3) if self._attempted else 0.0

        consistency: float | None
        if len(self._gaps) < 2:
            consistency = None
        else:
            mean = statistics.mean(self._gaps)
            if mean == 0:
                consistency = 0.0
            else:
                cv = statistics.pstdev(self._gaps) / mean
                consistency = round(max(0.0, 1.0 - cv) * 100, 1)

        return {
            "spm": spm,
            "accuracy": accuracy,
            "consistency": consistency,
            "duration_s": self._duration_ms // 1000,
        }
