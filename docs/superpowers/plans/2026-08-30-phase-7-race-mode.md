# SquidSpell Phase 7 — Mode B: Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** The right pane becomes a MonkeyType-style timed fingerspelling test — pick 15s/30s/60s, sign the prompted word stream, and get scored on Signs Per Minute / accuracy / consistency, with a local personal best per duration bucket. Same prediction engine as Train, zero duplicated CV/ML.

**Architecture:** Server-authoritative, extending Phase 6's `/ws/predict` mode switch. A `race`-mode connection keeps a `backend/app/race.py::RaceState`: the client sends `{"mode":"race"}` then `{"race":"start","duration":N}`; committed letters from the shared inference engine feed `RaceState.commit_letter`, which matches them against the current target word and advances the queue on a full correct word; each frame the server ticks the race clock and, on expiry, finalises SPM/accuracy/consistency. The outbound frame carries a `race` snapshot **only when it changed** — and as part of this phase the `transcript` field becomes change-only too (the deferred Phase 6 item), so the per-frame envelope stays small now that two stateful payloads share it. The frontend `RacePane` renders three phases off one `usePrediction().race` object: pre-race duration picker, running word-stream HUD, results screen (with a quick skippable `SquidMascot` celebration). Personal bests live in `localStorage` (Phase 8 moves them to Supabase).

**Tech Stack:** unchanged. Backend: FastAPI + `/ws/predict`. Frontend: React 19 + Vitest, the Phase 5/6 shell (`usePrediction`, `AppShell`, `PanelSwap`, `SquidMascot`, `--sq-*`).

**Spec:** `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md` → "Phase 7 — Mode B: Race (the differentiator)".

## Global Constraints

- **Backend:** Python 3.11, `cd backend && python -m pytest tests/ -q` (currently 38). `backend/app/*` imports nothing from `cv2`/`mediapipe`. No new deps. `race.py` is PURE (no FastAPI import). `from __future__ import annotations`.
- **Frontend:** `cd frontend && npm run lint && npm test && npm run build` all green (currently 70). TS: `erasableSyntaxOnly` (no TS parameter properties / enums / namespaces — string unions + explicit field assignment), `verbatimModuleSyntax` (`import type`), `noUnusedLocals/Parameters`, `strict`. `oxlint`. Tailwind v4 `@theme`. No new deps.
- **Change-only envelope (the deferred Phase 6 item, done here):** every outbound `/ws/predict` frame keeps its 10 base fields, and:
  - `transcript` is the current text on the first frame after it changes, and `null` on every frame where it did not change since the last send (was: the full string every frame). Not-in-train-mode is also `null`.
  - `race` is the `RaceState` snapshot dict on the first frame after any field of it changes, and `null` otherwise / when not in race mode.
  - Per-connection tracking: `_last_transcript_sent: str | None`, `_last_race_sent: dict | None`.
  - Client contract: `usePrediction` updates its `transcript` / `race` state only on frames where the value is non-`null`; a `null` means "unchanged, keep what you have".
- **`PredictionEvent` (frontend `types.ts`):** `transcript: string | null` stays; ADD `race: RaceSnapshot | null` (11th field). `RaceSnapshot` is a new exported interface (fields below).
- **No new REST endpoints.** Personal bests are client-only (`localStorage["squidspell-race-bests"]`, every access try/caught, shape-validated on load — same discipline as Phase 6's train history).
- **Reuse the shared engine:** race matching consumes `result.committed_letter` exactly as Train does — no second inference path, no CV/ML in `race.py`.
- **Commit per task**, `Phase 7: <what>`. Auto-push to `origin/main` after each reviewed task is pre-approved for `rushil-singh24/squidspell`.

## `RaceSnapshot` shape (produced by `RaceState.snapshot()`, consumed everywhere)

```
{
  "phase": "idle" | "running" | "finished",
  "target_word": str | null,        # current word to sign, null when idle/finished
  "typed": str,                     # correct prefix of target_word signed so far
  "word_index": int,                # 0-based position in the shuffled queue
  "upcoming": list[str],            # next up to 5 words after target_word
  "correct_letters": int,
  "attempted_letters": int,
  "seconds_left": int,              # max(0, ceil(remaining)); 0 when not running
  "spm": int,                       # running Signs Per Minute (correct_letters / elapsed_minutes), 0 before the first letter
  "results": { "spm": float, "accuracy": float, "consistency": float } | null   # only when phase == "finished"
}
```

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `backend/app/race.py` | Create | `RaceState` (pure): word pool, `start`/`commit_letter`/`tick`/`snapshot`/`results`; `RACE_WORDS`, `RACE_DURATIONS`. |
| `backend/tests/test_race.py` | Create | `RaceState` unit tests. |
| `backend/app/main.py` | Modify | `/ws/predict`: `mode=="race"` → per-connection `RaceState`; inbound `{"race":"start"|"stop", "duration"?}`; feed committed letters; tick + finalise; change-only `transcript` + `race` in the outbound frame. |
| `backend/tests/test_ws.py` | Modify | Race cases + update the Phase-6 transcript assertions for change-only. |
| `frontend/src/types.ts` | Modify | `RaceSnapshot` interface; `PredictionEvent.race: RaceSnapshot \| null`. |
| `frontend/src/lib/predictionClient.ts` | Modify | `sendRace(action: 'start' \| 'stop', duration?: number)`. |
| `frontend/src/lib/predictionClient.test.ts` | Modify | cover `sendRace`. |
| `frontend/src/hooks/usePrediction.ts` | Modify | `race: RaceSnapshot \| null` state (change-only update); `startRace(d)` / `stopRace()`; keep `transcript` change-only-safe. |
| `frontend/src/hooks/usePrediction.test.ts` | Modify | cover `race` state + `startRace`/`stopRace`. |
| `frontend/src/modes/RaceWordStream.tsx` | Create | MonkeyType-style display: current word with per-letter marks, upcoming words dimmed. Presentational. |
| `frontend/src/modes/RaceWordStream.test.tsx` | Create | render tests. |
| `frontend/src/modes/RacePane.tsx` | Create | 3-phase orchestration (pre-race picker / running HUD / results), personal bests, celebration; consumes `usePrediction().race` + `startRace`/`stopRace`. |
| `frontend/src/modes/RacePane.test.tsx` | Create | behaviour tests. |
| `frontend/src/modes/RacePanePlaceholder.tsx` | Delete | replaced by `RacePane`. |
| `frontend/src/components/AppShell.tsx` | Modify | render `<RacePane />` in the race branch of `PanelSwap` (was `RacePanePlaceholder`). |
| `frontend/src/components/AppShell.test.tsx` | Modify | race-branch assertion → `RacePane` pre-race text. |
| `DECISIONS.md` | Modify | `[Phase 7]` entries. |
| `HANDOFF.md` | Modify | status → Phase 7 done, Phase 8 next (+ its human-setup gate). |
| `frontend/README.md` | Modify | "Race mode" section. |

---

## Task 1: `backend/app/race.py` — `RaceState`

**Files:** Create `backend/app/race.py`, `backend/tests/test_race.py`.

**Interface produced (Task 2 consumes):**
```python
RACE_DURATIONS = (15, 30, 60)
RACE_WORDS: tuple[str, ...]   # ~40 common 2-5 letter lowercase words

class RaceState:
    def __init__(self, words: tuple[str, ...] | None = None, seed: int | None = None) -> None
    @property
    def phase(self) -> str                                   # "idle" | "running" | "finished"
    def start(self, duration_s: int, now_ms: float) -> None   # ValueError if duration_s not in RACE_DURATIONS
    def stop(self) -> None                                     # -> phase "idle", counters reset
    def commit_letter(self, letter: str, now_ms: float) -> None
    def tick(self, now_ms: float) -> None                      # flips to "finished" once elapsed >= duration
    def snapshot(self, now_ms: float) -> dict                  # the RaceSnapshot shape above
```

**Behaviour:**
- `__init__`: store the word pool (default `RACE_WORDS`); `seed` makes `start`'s shuffle deterministic for tests. Initial `phase == "idle"`.
- `start(duration_s, now_ms)`: validate `duration_s`; `random.Random(seed).shuffle` a `list(words)` copy → `_queue`; `_index = 0`; `_typed = ""`; `_correct = 0`; `_attempted = 0`; `_gaps: list[float] = []`; `_last_ms = None`; `_start_ms = now_ms`; `_duration_ms = duration_s * 1000`; `phase = "running"`.
- `commit_letter(letter, now_ms)`:
  - if `phase != "running"`: return.
  - `_attempted += 1`. If `_last_ms is not None`: `_gaps.append(now_ms - _last_ms)`. `_last_ms = now_ms`.
  - `target = _queue[_index]`; `expected = target[len(_typed)]`.
  - if `letter.upper() == expected.upper()`: `_typed += expected.lower()`; `_correct += 1`; if `len(_typed) == len(target)`: `_index += 1`; `_typed = ""`; if `_index >= len(_queue) - 5`: extend `_queue` with another shuffled copy of the pool (so `upcoming` never runs dry).
  - else (wrong letter): leave `_typed` unchanged (word does not advance). The attempt is still counted.
- `tick(now_ms)`: if `phase == "running"` and `now_ms - _start_ms >= _duration_ms`: `phase = "finished"`; `_end_ms = now_ms`.
- `stop()`: `phase = "idle"`; clear the queue/counters (a fresh `start` re-inits anyway).
- `snapshot(now_ms)`:
  - `elapsed_min` = `max(1e-9, (min(now_ms, _start_ms + _duration_ms) - _start_ms) / 60000)` when running/finished, else `0`.
  - `spm` (running) = `round(_correct / elapsed_min)` when running and `_correct > 0`, else `0`.
  - `seconds_left` = `max(0, math.ceil((_duration_ms - (now_ms - _start_ms)) / 1000))` when running, else `0`.
  - `target_word` = `_queue[_index]` when running, else `None`. `upcoming` = `_queue[_index+1 : _index+6]` when running, else `[]`.
  - `results` = `None` unless `phase == "finished"`, then:
    - `spm` = `_correct / (_duration_ms / 60000)` (float, round to 1 dp)
    - `accuracy` = `_correct / _attempted` if `_attempted else 0.0` (0..1, round to 3 dp)
    - `consistency` = `0.0` if `len(_gaps) < 2` else `round(max(0.0, 1.0 - _stdev(_gaps) / _mean(_gaps)) * 100, 1)` — a 0..100 score where 100 = perfectly even letter cadence (coefficient of variation → consistency). Use `statistics.pstdev` / `statistics.mean`; guard `mean == 0`.

- [ ] **Step 1: failing tests** `backend/tests/test_race.py`:
```python
import math
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
    assert 0.0 <= res["consistency"] <= 100.0


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
```
Run `cd backend && python -m pytest tests/test_race.py -q` → FAIL (no module).

- [ ] **Step 2: implement** `backend/app/race.py` per the interface + behaviour above. `RACE_WORDS` = a curated tuple of ~40 common 2-5 letter lowercase English words (cat, dog, run, the, and, you, for, are, sun, day, new, big, red, hot, fun, map, cup, hat, bed, key, car, box, egg, sky, top, arm, leg, eye, ear, cow, pig, bee, ant, oak, ice, fog, mud, gem, jam, owl, ...). `_mean`/`_stdev` via `statistics`.

- [ ] **Step 3:** `cd backend && python -m pytest tests/ -q` — all green (38 + new).
- [ ] **Step 4: commit** `git add backend/app/race.py backend/tests/test_race.py && git commit -m "Phase 7: RaceState (server-authoritative Race scorer)"`

---

## Task 2: `/ws/predict` race branch + change-only transcript/race delivery

**Files:** Modify `backend/app/main.py`, `backend/tests/test_ws.py`.

**Changes to `backend/app/main.py` `ws_predict`:**
- Top-level import: `from app.race import RaceState, RACE_DURATIONS`.
- Per-connection locals: add `race: RaceState | None = None`, `_last_transcript_sent: str | None = None`, `_last_race_sent: dict | None = None`.
- In the `{"mode"}` branch: after setting `mode`, set `transcript = TranscriptBuilder() if mode == "train" else None` (unchanged) and `race = RaceState() if mode == "race" else None`. Reset `_last_transcript_sent = None` and `_last_race_sent = None` so the first frame in the new mode always emits current state.
- Add a `{"race"}` message branch (after the `{"action"}` branch, same placement rules — ends with `continue`):
  ```python
  if "race" in msg:
      cmd = msg["race"]
      if cmd == "start":
          duration = msg.get("duration")
          if race is None or duration not in RACE_DURATIONS:
              await websocket.send_json({"error": "bad race command", "timestamp": int(time.time() * 1000)})
              continue
          race.start(duration, time.monotonic() * 1000.0)
      elif cmd == "stop":
          if race is not None:
              race.stop()
      else:
          await websocket.send_json({"error": "unknown race command", "timestamp": int(time.time() * 1000)})
      continue
  ```
- In the landmarks-frame path, after `result = engine.process_frame(...)`:
  ```python
  now_ms = now_mono * 1000.0
  if transcript is not None and result.committed_letter is not None:
      transcript.commit_letter(result.committed_letter, now_ms)
  if race is not None:
      if result.committed_letter is not None:
          race.commit_letter(result.committed_letter, now_ms)
      race.tick(now_ms)
  ```
- Replace the outbound `"transcript"` line with change-only logic; add `"race"` the same way. Right before the `await websocket.send_json({...})`:
  ```python
  transcript_out = None
  if transcript is not None and transcript.text != _last_transcript_sent:
      transcript_out = transcript.text
      _last_transcript_sent = transcript.text
  race_out = None
  if race is not None:
      snap = race.snapshot(now_ms)
      if snap != _last_race_sent:
          race_out = snap
          _last_race_sent = snap
  ```
  and in the dict: `"transcript": transcript_out, "race": race_out`.
- Everything else (malformed-transport guards, the 9 base fields, fps) unchanged.

**Tests — `backend/tests/test_ws.py`:**
- **Update Phase 6 assertions for change-only:** any test asserting `msg["transcript"] == ""` on a *repeat* (unchanged) train frame becomes `msg["transcript"] is None`; the *first* train frame still carries `""`. `test_ws_transcript_null_until_train_mode` and `test_ws_emits_one_message_per_frame_with_schema` (asserts `transcript is None` outside train) stay valid; add `"race" in msg` and `msg["race"] is None` to the schema test.
- New: `test_ws_race_mode_snapshot_appears_on_start` — `{"mode":"race"}` then `{"race":"start","duration":15}` then a `{"landmarks":None}` frame → `msg["race"]` is a dict with `phase == "running"` and a string `target_word`.
- New: `test_ws_race_committed_letters_advance` — using the monkeypatched `app.main.time.monotonic` tick generator + `FakeStatic("A", 0.95)`, start a race whose first target word starts with "A" (seed the `RaceState`? the WS builds its own `RaceState()` with no seed — instead: just assert that after enough frames to commit some letters, `msg["race"]["attempted_letters"] >= 1`, and `correct_letters` is 0 or more; don't over-constrain the word).
- New: `test_ws_race_expiry_produces_results` — start a 15s race, advance the monotonic clock past 15s via the tick generator, send a frame → `msg["race"]["phase"] == "finished"` and `msg["race"]["results"]` is a dict with `spm`/`accuracy`/`consistency` keys.
- New: `test_ws_bad_race_command_errors_keep_open` — `{"race":"start"}` with no duration → `{"error"}` + socket stays open; `{"race":"start","duration":99}` → `{"error"}`; `{"race":"boom"}` → `{"error"}`.
- New: `test_ws_race_and_transcript_are_null_in_wrong_mode` — in `race` mode, `msg["transcript"] is None` always; in `train` mode, `msg["race"] is None` always.

- [ ] Steps: tests RED → implement → `cd backend && python -m pytest tests/ -q` green → `python -c "from app.main import app"` clean → commit `git add backend/app/main.py backend/tests/test_ws.py && git commit -m "Phase 7: /ws/predict race branch + change-only transcript/race delivery"`

---

## Task 3: Frontend WS layer — `race` state + `startRace` / `stopRace`

**Files:** Modify `frontend/src/types.ts`, `frontend/src/lib/predictionClient.ts` (+test), `frontend/src/hooks/usePrediction.ts` (+test).

**Interfaces produced (Tasks 4-5 consume):**
- `types.ts`:
  ```ts
  export interface RaceResults { spm: number; accuracy: number; consistency: number }
  export interface RaceSnapshot {
    phase: 'idle' | 'running' | 'finished'
    target_word: string | null
    typed: string
    word_index: number
    upcoming: string[]
    correct_letters: number
    attempted_letters: number
    seconds_left: number
    spm: number
    results: RaceResults | null
  }
  ```
  and `PredictionEvent.race: RaceSnapshot | null` (11th field).
- `PredictionClient.sendRace(action: 'start' | 'stop', duration?: number): void` — `rawSend({ race: action, ...(duration !== undefined ? { duration } : {}) })`.
- `usePrediction(...)` return adds: `race: RaceSnapshot | null` (state; updated from a frame's `race` field only when it is non-`null`), `startRace: (duration: number) => void` (`useCallback` → `client.sendRace('start', duration)`), `stopRace: () => void` (`useCallback` → `client.sendRace('stop')`).
- **Change-only handling:** in the `onFrame` handler — `if (e.transcript !== null && e.transcript !== undefined) setTranscript(e.transcript)` (already effectively true via the Phase 6 `typeof === 'string'` guard — make it explicit); `if (e.race != null) setRace(e.race)`. A `null`/absent value means "unchanged".
- `setMode` still calls `setTranscript('')`; ALSO `setRace(null)` (leaving race mode drops the local snapshot).

- [ ] **Step 1: failing tests.**
  - `predictionClient.test.ts`: `sendRace('start', 30)` when OPEN → `FakeWS.sent` contains `{"race":"start","duration":30}`; `sendRace('stop')` → `{"race":"stop"}` (no `duration` key); not-OPEN → nothing.
  - `usePrediction.test.ts`: feed a frame `{...evt, race: <snapshot with phase:'running'>}` → `result.current.race.phase === 'running'`; feed `{...evt, race: null}` → `race` retained (still `'running'`). `startRace(15)` / `stopRace()` send through (spy `FakeWS.sent`). `setMode('train')` → `race` becomes `null`.
- [ ] **Step 2: implement** the four file changes.
- [ ] **Step 3: gate** `cd frontend && npm run lint && npm test && npm run build` — green. (Note: `WebcamPane.test.tsx`'s `mkEvent` default may need `race: null` added — one line, defaults only, same as Phase 6 added `transcript: null`.)
- [ ] **Step 4: commit** `git add frontend/src/types.ts frontend/src/lib/predictionClient.ts frontend/src/lib/predictionClient.test.ts frontend/src/hooks/usePrediction.ts frontend/src/hooks/usePrediction.test.ts frontend/src/components/WebcamPane.test.tsx && git commit -m "Phase 7: WS client race + usePrediction race snapshot"`

---

## Task 4: `RaceWordStream` component

**Files:** Create `frontend/src/modes/RaceWordStream.tsx`, `frontend/src/modes/RaceWordStream.test.tsx`.

**Interface:** `<RaceWordStream target={string} typed={string} upcoming={string[]} />` — presentational, no hooks beyond none.
- Renders the **current word** prominently: each character a `<span>`; chars in `typed` (the correct prefix) styled "done" (`color: var(--sq-accent)`), the next expected char "cursor" (underline / `var(--sq-fg)` + a subtle box), the rest "pending" (`var(--sq-fg-muted)`). `typed` is always a prefix of `target` (server guarantees), so index by `typed.length`.
- Renders `upcoming` words after it, smaller and dimmed (`var(--sq-fg-muted)`, ~0.8em), space-separated.
- Monospace-ish, centered, generous size for the current word.
- No animation needed here (the letter-commit pop is optional; skip for v1 to keep the fast-race render cheap). Wrap in `memo`.

- [ ] **Step 1: failing tests** `RaceWordStream.test.tsx`:
  - `<RaceWordStream target="cat" typed="ca" upcoming={["dog","the"]} />` → the letters `c`,`a`,`t` are all present; `dog` and `the` present; assert the "done" letters (`c`,`a`) carry the accent style / a `data-state="done"` attribute and `t` carries `data-state="cursor"` (add small `data-state` attrs to make this testable: `done` | `cursor` | `pending`).
  - `typed === ""` → first char is `cursor`, rest `pending`.
  - `typed === target` (word fully signed, brief moment before the server advances) → all `done`, no `cursor`.
- [ ] **Step 2: implement.** Add `data-state` per char for testability.
- [ ] **Step 3: gate** — green.
- [ ] **Step 4: commit** `git add frontend/src/modes/RaceWordStream.tsx frontend/src/modes/RaceWordStream.test.tsx && git commit -m "Phase 7: RaceWordStream (MonkeyType-style word display)"`

---

## Task 5: `RacePane` + wire into `AppShell`

**Files:** Create `frontend/src/modes/RacePane.tsx`, `frontend/src/modes/RacePane.test.tsx`. Modify `frontend/src/components/AppShell.tsx` (+test). Delete `frontend/src/modes/RacePanePlaceholder.tsx`.

**`<RacePane />`** — self-contained; calls `usePrediction()` for `{ race, startRace, stopRace }`. Three phases keyed off `race?.phase` (treat `race == null` or `phase === 'idle'` as **pre-race**):

- **Pre-race:** a duration segmented control (`15s` / `30s` / `60s`, one selected via local `useState<number>(30)`), a big **Start** button → `startRace(selectedDuration)`. Show the personal best for the selected bucket if one exists ("Best: 42 SPM"). Centered `<SquidMascot mood="idle" size={96} />` above it.
- **Running** (`phase === 'running'`):
  - top: a live countdown `race.seconds_left` and a live `race.spm` ("SPM 37").
  - center: `<RaceWordStream target={race.target_word ?? ''} typed={race.typed} upcoming={race.upcoming} />`.
  - a small "Stop" (`stopRace()`) link (returns to pre-race).
  - No manual clear/controls — an incorrect letter simply doesn't advance (server handles it).
- **Finished** (`phase === 'finished'`, `race.results` present):
  - Results card: **SPM** (`results.spm`, 1 dp), **Accuracy** (`Math.round(results.accuracy * 100)%`), **Consistency** (`Math.round(results.consistency)`/100).
  - On mount of this phase (a `useEffect` keyed on entering `finished`): compare `results.spm` to the stored best for the race's duration bucket; if better, persist it. **How do we know the duration?** Keep the `selectedDuration` from pre-race in a ref/state that survives into the results phase (it does — `RacePane` doesn't unmount between phases). Persist `{ [15]: number, [30]: number, [60]: number }` in `localStorage["squidspell-race-bests"]` (try/caught, shape-validated on load: an object whose values are numbers; anything else → `{}`).
  - A quick `<SquidMascot mood="celebrate" size={120} />` shown for ~1.5s when `results.spm` beats the old best (or always, briefly) — skippable: it does not block the "Try Again" button, which is always active.
  - **Try Again** button → back to pre-race (local state: set a `phase override` to `'idle'`, or simply call `stopRace()` which the server turns into `phase: 'idle'` and the next frame's snapshot clears it; simplest: `stopRace()` + a local `useState` `showResults` gate you flip off).
- All colours `--sq-*`. Wrap the pane in `memo` is NOT needed (it calls hooks); but keep expensive work (best lookup, `localStorage`) out of the render body — do it in effects / lazy initializers.

**`AppShell.tsx`:** replace `import { RacePanePlaceholder } ...` with `import { RacePane } from '../modes/RacePane'`; in the `PanelSwap` race branch render `<RacePane />`. `git rm frontend/src/modes/RacePanePlaceholder.tsx`.

- [ ] **Step 1: failing tests** `RacePane.test.tsx` — `vi.mock('../hooks/usePrediction', () => ({ usePrediction: () => mock }))` with a mutable `mock` object:
  - `race: null` → renders the duration control (`15s`/`30s`/`60s` buttons) + a `Start` button + the idle mascot (`role="img"`).
  - click `15s` then `Start` → `mock.startRace` called with `15`.
  - `race: { phase: 'running', target_word: 'cat', typed: 'c', upcoming: ['dog'], seconds_left: 12, spm: 30, ... }` → `cat` letters shown, `12` and `30` shown, a `Stop` control present; click Stop → `mock.stopRace` called.
  - `race: { phase: 'finished', results: { spm: 41.2, accuracy: 0.9, consistency: 78 }, ... }` → `41.2`, `90%`, `78` shown; `Try Again` button present and enabled; `localStorage["squidspell-race-bests"]` after render has the bucket set (pick the bucket from a preceding pre-race `15s` click, or default 30).
  - corrupt `localStorage["squidspell-race-bests"]` (`'[1,2]'`) → pre-race renders without throwing, no "Best:" line.
  `AppShell.test.tsx`: the `usePrediction` mock gains `race: null`, `startRace: vi.fn()`, `stopRace: vi.fn()`. Race-branch assertion: click the Race tab → the RacePane pre-race text (e.g. a `Start` button or "Choose a duration") appears instead of `/Race mode/`.
- [ ] **Step 2: implement** `RacePane.tsx` + the `AppShell` swap; `git rm RacePanePlaceholder.tsx`.
- [ ] **Step 3: gate** `cd frontend && npm run lint && npm test && npm run build` — green; `grep -rn RacePanePlaceholder frontend/src` → empty.
- [ ] **Step 4: commit**
```
git add frontend/src/modes/RacePane.tsx frontend/src/modes/RacePane.test.tsx frontend/src/components/AppShell.tsx frontend/src/components/AppShell.test.tsx
git rm frontend/src/modes/RacePanePlaceholder.tsx
git commit -m "Phase 7: RacePane — duration picker, live word-stream HUD, results + local bests"
```

---

## Task 6: Docs

**Files:** Modify `DECISIONS.md`, `HANDOFF.md`, `frontend/README.md`.

- [ ] **Step 1: `DECISIONS.md` `[Phase 7]` entries** (`Decided:`/`Why:`/`Affects:`):
  1. **Server-authoritative Race, same mode switch as Train.** `mode == "race"` → per-connection `RaceState`; `{"race":"start","duration":15|30|60}` / `{"race":"stop"}`; committed letters matched against the target word server-side; `tick` on each frame finalises on expiry. Affects: Phase 8 persists `race_results` from `usePrediction().race.results`; the client transport layer needed only `sendRace`.
  2. **Change-only `transcript` + `race` in the per-frame envelope** (the deferred Phase 6 item). Each is the current value on the first frame it changes and `null` on unchanged frames; the client keeps its last non-null value. Keeps the frame small now that two stateful payloads share the envelope. Affects: any future per-connection stateful field follows the same pattern.
  3. **Consistency metric = `100 * (1 - CoV)`** where CoV is `pstdev(inter-letter gaps) / mean(gaps)`, clamped to 0..100, `0` when fewer than 2 letters. 100 = perfectly even cadence. Affects: README + results display; Phase 8's `race_results` schema stores it as a number.
  4. **Personal bests are client-only**, `localStorage["squidspell-race-bests"]` = `{15,30,60 → SPM}`, shape-validated on load. Phase 8 replaces with a Supabase `race_results` table + leaderboard. Affects: Phase 8.
  5. **Word pool is a static curated list** (`RACE_WORDS`, ~40 common 2-5 letter words), auto-extended by reshuffling when the queue nears its end so `upcoming` never empties. Phase 8 optionally swaps it for a Supabase-backed list. Affects: Phase 8.

- [ ] **Step 2: `HANDOFF.md`** — update `**Last updated:**` + status: Phase 7 complete — `/ws/predict` handles `mode == "race"` with a server-side `RaceState`; `RacePane` renders the pre-race picker / running word-stream HUD / results with local personal bests; `transcript`/`race` are now change-only in the frame. `cd backend && python -m pytest tests/ -q` and `cd frontend && npm run lint && npm test && npm run build` both green. `RacePanePlaceholder` is gone. **Phase 8 (Auth & Persistence — Supabase) is next, and it has an explicit human-setup gate BEFORE any agent work:** create a Supabase project (Project URL + anon key) and a Google Cloud OAuth client — see the Phase 8 section of the spec. Preserve the push-policy note and the per-phase "Where the human is needed" list; the three open gates (Phase 3 live pass, Phase 5 visual pass, Phase 3 motion-buffer follow-up) plus the Phase 6 end-to-end-word check are unchanged — ADD a Phase 7 note to race a real 30s round and sanity-check the SPM/accuracy numbers.

- [ ] **Step 3: `frontend/README.md`** — add a "Race mode" section: pick 15/30/60s and Start; sign the highlighted word letter by letter (wrong letters just don't advance, no penalty beyond lost time); the HUD shows time left and a live SPM; the results screen shows SPM / accuracy / consistency and stores a personal best per duration in the browser only. Note the same shared prediction engine drives Train and Race.

- [ ] **Step 4:** `git diff --check` clean; both suites green. Commit `git add DECISIONS.md HANDOFF.md frontend/README.md && git commit -m "Phase 7: docs — DECISIONS [Phase 7], handoff, README Race section"`

---

## Final whole-branch review

After all 6 tasks, one whole-branch review on the most capable model. Focus: (a) `/ws/predict` message dispatch — `race`/`mode`/`action` frames never fall through to the landmarks path and never emit a spurious prediction frame; Phase 4 malformed-transport guards intact; (b) per-connection isolation of `RaceState` AND the `_last_transcript_sent`/`_last_race_sent` trackers (two race clients don't cross-contaminate); (c) change-only correctness — the first frame after a change always carries the value, an unchanged frame always carries `null`, and the client never gets stuck showing stale state after a reconnect (`onopen` re-sends `mode`, and the server resets the `_last_*_sent` trackers on the mode message so the next frame re-emits full state); (d) `RaceState.tick` — the race actually finishes even though the loop is frame-driven (client streams frames continuously), and `snapshot` after `finished` is stable (equal dicts) so it's not re-sent every frame; (e) `snapshot` dict equality for change detection — no non-deterministic field (e.g. a recomputed `spm`/`seconds_left` that changes every frame would defeat change-only; confirm `seconds_left` only changes at 1s boundaries and `spm` is integer-rounded, so a steady state produces equal snapshots); (f) `RacePane` phase transitions and the personal-best write (fires once per finish, not every render); (g) `RacePanePlaceholder` fully removed. One fix wave + scoped re-review.

Note for the reviewer: item (e) is the subtle one — if `snapshot()` embeds a raw float `spm` or a sub-second `seconds_left`, change-only delivery collapses to every-frame delivery. The plan rounds both; verify the implementation did.

---

## Self-Review (plan author)

**Spec coverage:** pre-race 15/30/60 selector + start → Task 5. `backend/app/race.py` word queue + live match + advance-on-correct-word + per-race correct/attempted/timestamps → Task 1. SPM/accuracy/consistency on expiry → Task 1 (`results`) + Task 2 (`tick` finalise) + Task 5 (display). MonkeyType word stream (current highlighted, upcoming visible, letters marked off) → Task 4. Live countdown + running SPM → Task 5 HUD. Incorrect letter doesn't advance, self-resetting, no clear → Task 1 (`commit_letter` wrong-letter branch) + Task 5 (no controls). Results screen + Try Again → Task 5. Mascot celebration, quick + skippable → Task 5. Personal best per duration bucket, stored locally → Task 5 + DECISIONS. Same engine as Train, no duplicated CV/ML → Task 2 (feeds `result.committed_letter` to `race.commit_letter`, no second inference path). Acceptance (select duration → word stream → counts down → advances only on correct completion → correct SPM/accuracy/consistency) → Tasks 1/2/5; the true "race it" verification is a human note in Task 6 / HANDOFF.

**No placeholders:** Task 2's WS race tests avoid over-constraining the (unseeded) server-side word by asserting counts/phases rather than exact letters; that's a deliberate, stated choice, not a gap. All component interfaces are given field-by-field with `data-state` hooks for testability.

**Type/name consistency:** `RaceSnapshot`/`RaceResults` field names identical between `race.py::snapshot()` (Task 1), `types.ts` (Task 3), `usePrediction().race` (Task 3), `RaceWordStream` props (Task 4 uses `target`/`typed`/`upcoming` — a subset), `RacePane` (Task 5). `sendRace('start'|'stop', duration?)` identical between `predictionClient` (Task 3) and `usePrediction`'s `startRace`/`stopRace` (Task 3). `RACE_DURATIONS = (15, 30, 60)` identical between `race.py` and `main.py`'s validation (Task 2). Change-only contract (`null` = unchanged) identical between `main.py` outbound (Task 2) and `usePrediction` `onFrame` (Task 3).
