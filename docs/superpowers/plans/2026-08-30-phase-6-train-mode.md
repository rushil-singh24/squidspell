# SquidSpell Phase 6 — Mode A: Train Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** The right pane becomes a live, editable transcript — signed letters append to an auto-scrolling chat-log panel; Space / Delete fire instantly; Clear requires a ~1s hold with a visible fill; Save / Download and a local (no-backend) history.

**Architecture:** Server-authoritative transcript. `/ws/predict` gains a per-connection **mode**: the client sends `{"mode":"train"}` on connect / mode-switch; while a connection is in `train` mode the server keeps a `backend/app/transcript.py::TranscriptBuilder`, feeds it every committed letter from the inference engine, and applies inbound `{"action":"delete"|"space"|"clear"}` messages. Every outbound frame carries a `transcript` field (the current text, or `null` when not in train mode). The browser renders that string; control **buttons** send `{"action"}` messages; the hold-to-Clear UI is client-side (it just delays the `{"action":"clear"}` send by 1s). History (Save / Download / list) is entirely client-side — no REST endpoints (Phase 8 swaps it for direct Supabase). Gesture→action detection is out of scope (poses are TBD/untrained); the mapping is an empty config dict in `transcript.py` for Phase 1/2 to fill later.

**Tech Stack:** unchanged. Backend: FastAPI + the Phase 4 `/ws/predict`. Frontend: React 19 + Vitest, the Phase 5 shell (`usePrediction`, `AppShell`, `CommitPop`, `SquidMascot`, `--sq-*` tokens).

**Spec:** `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md` → "Phase 6 — Mode A: Train".

## Global Constraints

- **Backend:** Python 3.11, `cd backend && python -m pytest tests/ -q` (currently 26). `backend/app/*` imports nothing from `cv2`/`mediapipe`. No new deps. `_ml_bridge` unchanged.
- **Frontend:** `cd frontend && npm run lint && npm test && npm run build` all green (currently 48 tests). TS: `erasableSyntaxOnly` (no TS param properties / enums / namespaces — string unions + explicit field assignment), `verbatimModuleSyntax` (`import type`), `noUnusedLocals/Parameters`, `strict`. `oxlint` (only `react/rules-of-hooks` + `react/only-export-components` enabled). Tailwind v4 `@theme` (no config file). No new deps.
- **`PredictionEvent` stays wire-accurate:** the backend now always includes `transcript: string | null` in the outbound frame, so add `transcript: string | null` to `frontend/src/types.ts::PredictionEvent` (10th field). All other fields unchanged.
- **NO `/history` (or any new) REST endpoint.** Train history is client-only (`useState` + `localStorage["squidspell-train-history"]`, every access try/caught).
- **Transcript dedupe:** none by time-window. The inference layer (`StaticSmoother`/`MotionGate`) already commits each letter exactly once per stable run and will not re-emit the same letter until the majority changes and a new one stabilises — so `TranscriptBuilder.commit_letter` appends unconditionally. The only guard is against a byte-identical duplicate frame (`(letter, timestamp)` equal to the immediately previous commit). This is deliberate — a time window would eat deliberate double letters ("HELLO"). Log it.
- **Mode default is `None`** (pure prediction, Phase-5 behaviour). A connection only builds a transcript after it receives `{"mode":"train"}`. Switching to any non-`train` mode discards the builder.
- **Reduced motion:** the hold-to-Clear fill still enforces the 1s delay but renders as a stepwise/!animated bar (no smooth tween) under `useReducedMotion()`.
- **Commit per task**, `Phase 6: <what>`. Auto-push to `origin/main` after each reviewed task is pre-approved for `rushil-singh24/squidspell`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `backend/app/transcript.py` | Create | `TranscriptBuilder` (pure): `text`, `commit_letter(letter, ts)`, `apply(action)`, `reset()`; `VALID_ACTIONS`; `GESTURE_ACTIONS = {}` (TBD poses). |
| `backend/tests/test_transcript.py` | Create | Unit tests for the builder. |
| `backend/app/main.py` | Modify | `/ws/predict`: per-connection `mode` + `TranscriptBuilder`; handle inbound `{"mode"}` / `{"action"}`; add `transcript` to every outbound frame. |
| `backend/tests/test_ws.py` | Modify | Add mode/action/transcript cases. |
| `frontend/src/types.ts` | Modify | `PredictionEvent.transcript: string \| null`. |
| `frontend/src/lib/predictionClient.ts` | Modify | `sendAction(a)`, `setMode(m)`; re-send `mode` on reconnect (`onopen`). |
| `frontend/src/lib/predictionClient.test.ts` | Modify | Cover `sendAction`/`setMode` + mode-resend-on-reconnect. |
| `frontend/src/hooks/usePrediction.ts` | Modify | Expose `transcript: string`, `sendAction`, `setMode` (both `useCallback`). |
| `frontend/src/hooks/usePrediction.test.ts` | Modify | Cover `transcript` state + `sendAction`/`setMode` passthrough. |
| `frontend/src/components/HoldButton.tsx` | Create | Press-and-hold button with a fill overlay; fires `onHoldComplete` once at `durationMs`; resets on release/leave/cancel; reduced-motion aware. |
| `frontend/src/components/HoldButton.test.tsx` | Create | hold-to-complete fires; early release doesn't; disabled state. |
| `frontend/src/modes/TrainPane.tsx` | Create | Auto-scroll transcript panel (`CommitPop` on newest char), Space/Delete buttons, hold-to-Clear (`HoldButton`), Save/Download, local history list, empty state (`SquidMascot`). |
| `frontend/src/modes/TrainPane.test.tsx` | Create | render/behaviour tests. |
| `frontend/src/modes/TrainPanePlaceholder.tsx` | Delete | replaced by `TrainPane`. |
| `frontend/src/components/AppShell.tsx` | Modify | `useEffect([mode]) => prediction.setMode(mode)`; render `<TrainPane transcript={prediction.transcript} onAction={prediction.sendAction} />` in the train branch of `PanelSwap`. |
| `frontend/src/components/AppShell.test.tsx` | Modify | update the train-branch assertion; add a `setMode`-on-mount/switch assertion. |
| `DECISIONS.md` | Modify | `[Phase 6]` entries. |
| `HANDOFF.md` | Modify | status → Phase 6 done, Phase 7 next. |
| `frontend/README.md` | Modify | add a "Train mode controls" section. |

---

## Task 1: `backend/app/transcript.py` — `TranscriptBuilder`

**Files:** Create `backend/app/transcript.py`, `backend/tests/test_transcript.py`.

**Interfaces produced (Task 2 consumes):**
```python
VALID_ACTIONS = ("delete", "space", "clear")
GESTURE_ACTIONS: dict[str, str] = {}   # static/motion pose label -> action; empty until Phase 1/2 choose distinct poses

class TranscriptBuilder:
    def __init__(self) -> None
    @property
    def text(self) -> str
    def commit_letter(self, letter: str, timestamp: float) -> bool   # append uppercased letter; ignore only an exact (letter,timestamp) repeat of the previous call; return whether text changed
    def apply(self, action: str) -> bool                              # action in VALID_ACTIONS; ValueError otherwise. delete: drop last char (no-op if empty). space: append ' ' unless text is empty or already ends with ' '. clear: empty the text if non-empty. return whether text changed.
    def reset(self) -> None
```

- [ ] **Step 1: failing tests** `backend/tests/test_transcript.py`:
```python
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
```
Run `cd backend && python -m pytest tests/test_transcript.py -q` → FAIL (no module).

- [ ] **Step 2: implement** `backend/app/transcript.py`:
```python
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
```

- [ ] **Step 3:** `cd backend && python -m pytest tests/ -q` — all green (26 + new).
- [ ] **Step 4: commit** `git add backend/app/transcript.py backend/tests/test_transcript.py && git commit -m "Phase 6: TranscriptBuilder (server-authoritative Train transcript)"`

---

## Task 2: `/ws/predict` — per-connection mode + transcript

**Files:** Modify `backend/app/main.py`, `backend/tests/test_ws.py`.

**Interfaces produced (Task 3 consumes):**
- Inbound message may now also be `{"mode": "train" | "race" | null}` or `{"action": "delete" | "space" | "clear"}` (in addition to `{"landmarks", "t"}`). Unknown `mode` values → `{"error": "..."}` + keep open; unknown `action` → `{"error": "..."}` + keep open. A frame with none of `landmarks`/`mode`/`action` keys → the existing "expected ... landmarks" error stays for the landmarks path; a bare `{}` → treat as `landmarks: null` (a no-hand frame) exactly as today (`msg.get("landmarks")` is `None`, which `_valid_landmarks` accepts).
- Every outbound prediction frame gains `"transcript": <str> | null` — the connection's current transcript text when `mode == "train"`, else `null`.

- [ ] **Step 1: failing tests** — add to `backend/tests/test_ws.py`:
```python
def test_ws_transcript_null_until_train_mode(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"landmarks": None})
            msg = ws.receive_json()
            assert msg["transcript"] is None


def test_ws_train_mode_accumulates_committed_letters(ws_app_committing):
    # ws_app_committing: a fixture whose FakeStatic drives the smoother to commit "A"
    # after its stability window (reuse the monkeypatched-clock pattern from
    # test_ws_commits_static_letter_after_stability_window).
    ...
    # after mode=train and enough frames to commit "A":
    # some later msg has msg["transcript"] == "A"


def test_ws_train_actions_edit_transcript(ws_app_committing):
    # commit "A", then send {"action": "space"} then {"action": "delete"} then {"action": "clear"};
    # assert the transcript field tracks "A" -> "A " ... -> "" across the echoed frames.


def test_ws_unknown_mode_and_action_error_but_keep_open(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"mode": "sideways"})
            assert "error" in ws.receive_json()
            ws.send_json({"action": "explode"})
            assert "error" in ws.receive_json()
            ws.send_json({"landmarks": None})
            ok = ws.receive_json()
            assert "error" not in ok and ok["transcript"] is None
```
Write concrete versions of the `...` cases using the existing `ws_app` fixtures + the monkeypatched `app.main.time.monotonic` tick pattern already in the file. If wiring a "committing" fixture is fiddly, an acceptable minimum is: mode=train, then directly exercise the action path (`{"action":"space"}` on an empty transcript → `transcript` stays `""`; `{"action":"clear"}` → `""`) and assert `transcript` is a string (not `null`) once mode is train. The committed-letter accumulation is then covered by `TranscriptBuilder`'s own unit tests + one integration assertion.

- [ ] **Step 2: implement** in `backend/app/main.py`, inside `ws_predict`:
  - After `engine = ...`, add `from app.transcript import TranscriptBuilder, VALID_ACTIONS` (top-level import) and per-connection `mode: str | None = None` and `transcript: TranscriptBuilder | None = None`.
  - In the receive loop, after the JSON-object guard and BEFORE the landmarks path:
    ```python
    if "mode" in msg:
        new_mode = msg["mode"]
        if new_mode not in (None, "train", "race"):
            await websocket.send_json({"error": "unknown mode", "timestamp": int(time.time() * 1000)})
            continue
        mode = new_mode
        transcript = TranscriptBuilder() if mode == "train" else None
        continue
    if "action" in msg:
        action = msg["action"]
        if action not in VALID_ACTIONS:
            await websocket.send_json({"error": "unknown action", "timestamp": int(time.time() * 1000)})
            continue
        if transcript is not None:
            transcript.apply(action)
        continue
    ```
  - Where the landmarks frame is processed: after `result = engine.process_frame(...)`, if `transcript is not None and result.committed_letter is not None`: `transcript.commit_letter(result.committed_letter, now_mono * 1000.0)`.
  - Add to the outbound dict: `"transcript": transcript.text if transcript is not None else None`.
  - The malformed-transport guards and the existing landmarks error path are unchanged.

- [ ] **Step 3:** `cd backend && python -m pytest tests/ -q` — green. Then `python -c "from app.main import app"` — clean.
- [ ] **Step 4: commit** `git add backend/app/main.py backend/tests/test_ws.py && git commit -m "Phase 6: /ws/predict per-connection mode + transcript field"`

---

## Task 3: Frontend WS layer — `sendAction` / `setMode` / `transcript`

**Files:** Modify `frontend/src/types.ts`, `frontend/src/lib/predictionClient.ts`, `frontend/src/lib/predictionClient.test.ts`, `frontend/src/hooks/usePrediction.ts`, `frontend/src/hooks/usePrediction.test.ts`, `frontend/src/components/AppShell.tsx`, `frontend/src/components/AppShell.test.tsx`.

**Interfaces produced (Task 5 consumes):**
- `PredictionEvent.transcript: string | null` (10th field, matches the wire).
- `PredictionClient`: `setMode(mode: 'train' | 'race' | null): void` (stores `this.mode`, sends `{mode}` if OPEN, and re-sends on every subsequent `onopen`); `sendAction(action: 'delete' | 'space' | 'clear'): void` (sends `{action}` if OPEN, same OPEN + `bufferedAmount` guards as `send`).
- `usePrediction(...)` return adds: `transcript: string` (from the latest frame's `transcript`, `?? ''`), `sendAction: (a) => void` (`useCallback`), `setMode: (m) => void` (`useCallback`).

- [ ] **Step 1: failing tests.**
  - `predictionClient.test.ts`: (a) `setMode('train')` before open → nothing sent; after `_open()` → one `{"mode":"train"}` sent; a reconnect (`_open()` again on the new socket) → `{"mode":"train"}` re-sent. (b) `sendAction('space')` when OPEN → `{"action":"space"}` sent; when not OPEN → nothing.
  - `usePrediction.test.ts`: feed a frame with `transcript: "HI"` → `result.current.transcript === "HI"`; a frame with `transcript: null` → `transcript` stays `""` (or its last non-null value — pick: **stays `''` when null**, updates when string). `sendAction`/`setMode` call through to the client (spy on the `FakeWS.sent`).
  - `AppShell.test.tsx`: with the `usePrediction` mock exposing `setMode: vi.fn()`, assert `setMode` was called with `'train'` on mount, and with `'race'` after clicking the Race tab.

- [ ] **Step 2: implement.**
  - `types.ts`: add `transcript: string | null` to `PredictionEvent`.
  - `predictionClient.ts`: add a `private mode: 'train' | 'race' | null = null` field; in `onopen` after `this.attempt = 0` and `emitStatus('open')`, `if (this.mode !== null) this.rawSend({ mode: this.mode })`. Add `setMode` / `sendAction` methods; factor a `private rawSend(obj: unknown)` that does the OPEN + `bufferedAmount` guard + `ws.send(JSON.stringify(obj))`, and have `send()` use it too (`rawSend({ landmarks, t: Date.now() })`).
  - `usePrediction.ts`: add `const [transcript, setTranscript] = useState('')`; in the `onFrame` handler, `if (typeof e.transcript === 'string') setTranscript(e.transcript)`. Add `setMode`/`sendAction` `useCallback`s delegating to `clientRef.current`. Return them + `transcript`.
  - `AppShell.tsx`: add `useEffect(() => { prediction.setMode(mode) }, [mode, prediction.setMode])` (`setMode` is `useCallback`-stable so this fires only on real `mode` change).

- [ ] **Step 3: gate** `cd frontend && npm run lint && npm test && npm run build` — green.
- [ ] **Step 4: commit** `git add frontend/src/types.ts frontend/src/lib/predictionClient.ts frontend/src/lib/predictionClient.test.ts frontend/src/hooks/usePrediction.ts frontend/src/hooks/usePrediction.test.ts frontend/src/components/AppShell.tsx frontend/src/components/AppShell.test.tsx && git commit -m "Phase 6: WS client mode/action + usePrediction transcript"`

---

## Task 4: `HoldButton` component

**Files:** Create `frontend/src/components/HoldButton.tsx`, `frontend/src/components/HoldButton.test.tsx`.

**Interface produced (Task 5 consumes):**
`<HoldButton onHoldComplete={() => void} durationMs?={number} disabled?={boolean} className?={string}>{children}</HoldButton>` — default `durationMs = 1000`.
- Press-and-hold: on `pointerdown` (not disabled) start a `requestAnimationFrame` progress loop `0 → 1` over `durationMs`; render a fill overlay whose width/scaleX = progress (absolutely positioned, `var(--sq-error)` at low opacity so it reads as "about to do the destructive thing"). At progress `>= 1`, call `onHoldComplete()` **once** and reset.
- On `pointerup` / `pointerleave` / `pointercancel` / losing the pointer before completion → cancel the rAF, reset progress to `0`, do NOT fire.
- Keyboard: `Space`/`Enter` keydown starts the hold, keyup cancels (mirror the pointer path) so it's operable without a mouse.
- `disabled` → no-op, `aria-disabled`, dimmed.
- `aria`: `role="button"` semantics are native (`<button type="button">`); add `aria-label` from a `label` prop OR rely on `children`. Include `aria-describedby`-style hint text is optional.
- `useReducedMotion()` → keep the `durationMs` timing (still a deliberate hold) but update the fill in coarse steps (e.g. via a `setInterval` at 100ms) instead of a per-frame rAF tween, or simply show a text countdown; no smooth animation.

- [ ] **Step 1: failing tests** `HoldButton.test.tsx`:
  - Stub rAF to drive time deterministically: `let cbs: FrameRequestCallback[] = []; vi.stubGlobal('requestAnimationFrame', (cb) => { cbs.push(cb); return cbs.length }); vi.stubGlobal('cancelAnimationFrame', () => {})`. Advance by calling `cbs` with increasing timestamps, OR use `vi.useFakeTimers()` + `performance.now` stub — pick what the implementation needs.
  - Test: `pointerDown` then advance time past `durationMs` → `onHoldComplete` called exactly once.
  - Test: `pointerDown`, advance halfway, `pointerUp` → `onHoldComplete` NOT called; advancing further still doesn't call it.
  - Test: `disabled` → `pointerDown` + full advance → not called.
  - Test: keyboard `keyDown{ key: ' ' }` then advance → called; `keyUp` before completion → not called.
  - (Use `@testing-library/user-event` / `fireEvent.pointerDown` — jsdom supports PointerEvents via `fireEvent`.)

- [ ] **Step 2: implement** per the interface. Keep it self-contained (no external state). The rAF loop reads `performance.now()`; store `startTime` in a ref; on each frame `progress = min(1, (now - start) / durationMs)`; `setProgress(progress)`; if `>= 1` → `onHoldComplete()` + reset + stop; else schedule next frame. Clean up rAF on unmount and on every reset.

- [ ] **Step 3: gate** — green.
- [ ] **Step 4: commit** `git add frontend/src/components/HoldButton.tsx frontend/src/components/HoldButton.test.tsx && git commit -m "Phase 6: HoldButton (press-and-hold with fill, keyboard-operable)"`

---

## Task 5: `TrainPane` + wire into `AppShell`

**Files:** Create `frontend/src/modes/TrainPane.tsx`, `frontend/src/modes/TrainPane.test.tsx`. Modify `frontend/src/components/AppShell.tsx`, `frontend/src/components/AppShell.test.tsx`. Delete `frontend/src/modes/TrainPanePlaceholder.tsx`.

**Interface:** `<TrainPane transcript={string} onAction={(a: 'delete'|'space'|'clear') => void} />`.

Layout (fills the right pane, column):
- **Transcript panel** (grows to fill available height): a `div` `overflow-y:auto`, `bg-[var(--sq-surface)]`, rounded, monospace-ish, `min-height` a few lines. Renders `transcript` as text; the **last character** is wrapped in `<CommitPop trigger={transcript.length}>` so a newly-appended letter gets the pop micro-animation (Phase 5's `CommitPop`). `useEffect([transcript])` → set `scrollTop = scrollHeight` (auto-scroll to newest). When `transcript === ''`: show a centered `<SquidMascot mood="idle" size={96} />` + "Sign a letter to start your transcript." instead of the empty box.
- **Controls row:** `[␣ Space]` and `[⌫ Delete]` — plain `<button>`s calling `onAction('space')` / `onAction('delete')` on click. Then `<HoldButton onHoldComplete={() => onAction('clear')} durationMs={1000} disabled={transcript === ''}>Clear (hold)</HoldButton>`. Then `[Save]` and `[Download]`.
- **Save:** pushes `{ id: crypto.randomUUID?.() ?? String(Date.now()), text: transcript, savedAt: Date.now() }` onto a `useState<Saved[]>` list; mirror the list to `localStorage["squidspell-train-history"]` (JSON, every read/write try/caught; hydrate the list from it on mount via a lazy `useState` initializer). Disabled when `transcript === ''`.
- **Download:** build `new Blob([transcript], { type: 'text/plain' })`, `URL.createObjectURL`, create a transient `<a download="squidspell-transcript.txt">`, `.click()`, `URL.revokeObjectURL`. Disabled when `transcript === ''`.
- **History list:** below the controls, small, scrollable, each row = a relative timestamp + the first ~40 chars + a `✕` that removes that entry (updates state + `localStorage`). Hidden when the list is empty.

All colours via `--sq-*`. `useReducedMotion` is already handled inside `CommitPop`/`HoldButton`.

**`AppShell.tsx` changes:** replace `import { TrainPanePlaceholder } ...` with `import { TrainPane } from '../modes/TrainPane'`; in the `PanelSwap` train branch render `<TrainPane transcript={prediction.transcript} onAction={prediction.sendAction} />`. `RacePanePlaceholder` stays (Phase 7).

- [ ] **Step 1: failing tests** `TrainPane.test.tsx`:
  - render `transcript=""` → the "Sign a letter to start" text + a `role="img"` (mascot) present; Space/Delete/Clear/Save/Download buttons present; Save & Download & Clear are `disabled`.
  - render `transcript="HELLO"` → `HELLO` shown; click `Space` → `onAction` called with `'space'`; click `Delete` → `'delete'`.
  - render `transcript="HI"`, drive the `HoldButton` to completion (rAF stub, as in Task 4) → `onAction` called with `'clear'`.
  - render `transcript="HI"`, click `Save` → a history row containing `HI` appears; `localStorage["squidspell-train-history"]` parses to a 1-element array. Click that row's `✕` → row gone, storage array empty.
  - `Download`: click with `transcript="HI"` → assert `URL.createObjectURL` (spy via `vi.spyOn`) was called with a `Blob`. (Stub `URL.createObjectURL`/`revokeObjectURL` and `HTMLAnchorElement.prototype.click`.)
  `AppShell.test.tsx`: the train-branch text assertion changes from `/Train mode/` to something `TrainPane` renders (e.g. the "Sign a letter to start" empty-state text, since the mocked `usePrediction` returns `transcript: ''`). Keep the Race-tab-swap assertion (`RacePanePlaceholder` text unchanged). Add `transcript: ''`, `sendAction: vi.fn()`, `setMode: vi.fn()` to the `usePrediction` mock object.

- [ ] **Step 2: implement** `TrainPane.tsx` + the `AppShell` swap; `git rm frontend/src/modes/TrainPanePlaceholder.tsx`.
- [ ] **Step 3: gate** `cd frontend && npm run lint && npm test && npm run build` — green (grep the build output: `TrainPanePlaceholder` no longer referenced).
- [ ] **Step 4: commit**
```
git add frontend/src/modes/TrainPane.tsx frontend/src/modes/TrainPane.test.tsx frontend/src/components/AppShell.tsx frontend/src/components/AppShell.test.tsx
git rm frontend/src/modes/TrainPanePlaceholder.tsx
git commit -m "Phase 6: TrainPane — auto-scroll transcript, Space/Delete, hold-to-Clear, save/download, local history"
```

---

## Task 6: Docs

**Files:** Modify `DECISIONS.md`, `HANDOFF.md`, `frontend/README.md`.

- [ ] **Step 1: `DECISIONS.md` `[Phase 6]` entries** (match the `Decided:`/`Why:`/`Affects:` format):
  1. **Server-authoritative transcript, mode-parameterized `/ws/predict`.** Client sends `{"mode":"train"|"race"|null}`; a `train`-mode connection keeps a per-connection `TranscriptBuilder`; committed letters + inbound `{"action"}` messages mutate it; every outbound frame carries `transcript: str | null`. Chosen over a client-side transcript so the same pattern serves Phase 7's server-side Race scorer and matches "one FastAPI app, internal modules (prediction / transcript / race)". Affects: Phase 7 adds a `race` branch to the same mode switch; Phase 8's history persistence reads `usePrediction().transcript`.
  2. **No time-window dedupe.** `TranscriptBuilder.commit_letter` appends unconditionally (guarding only an exact duplicate frame). The inference layer already commits once per stable run. A time window would eat deliberate double letters. Affects: none downstream; a known limitation is that two identical letters signed faster than the smoother can re-stabilise (~500 ms) merge into one — acceptable for v1.
  3. **`GESTURE_ACTIONS = {}` — control-gesture poses deferred.** Delete/Space/Clear are driven only by on-screen buttons this phase; the pose→action map in `transcript.py` is empty until Phase 1/2 data collection selects poses visually distinct from the 26 letters. Wiring a chosen pose is a one-line change plus a client detector. Affects: the README controls section; a future data-collection pass.
  4. **Hold-to-Clear is client-side timing only.** `HoldButton` delays the `{"action":"clear"}` send by `durationMs` (1000) with a fill indicator; the server just applies `clear`. The on-screen Clear button IS a hold button (no separate instant path) — there is no gesture yet, so the button is the clear mechanism and inherits the destructive-action-needs-intent rule. Affects: README.
  5. **Train history is client-only.** `useState` + `localStorage["squidspell-train-history"]`; no REST endpoint (Phase 8 replaces it with direct Supabase). Affects: Phase 8.

- [ ] **Step 2: `HANDOFF.md`** — update `**Last updated:**` + status: Phase 6 complete — `/ws/predict` is mode-aware; `backend/app/transcript.py` builds the Train transcript server-side; `frontend` `TrainPane` renders it with auto-scroll, Space/Delete, hold-to-Clear, Save/Download, local history. `cd backend && python -m pytest tests/ -q` and `cd frontend && npm run lint && npm test && npm run build` both green. Set **Phase 7 (Mode B: Race)** as next; note Race adds a `race` branch to the same `/ws/predict` mode switch + a `backend/app/race.py`. Preserve the push-policy note and the per-phase human-needed list; the three open human gates (Phase 3 live pass, Phase 5 visual pass, Phase 3 motion-buffer follow-up) are unchanged — and add a Phase 6 note that a human should sign a word end-to-end to confirm the transcript.

- [ ] **Step 3: `frontend/README.md`** — add a "Train mode controls" section: Space / Delete buttons fire immediately; Clear is press-and-hold (~1s) with a fill; Save keeps transcripts in the browser only (`localStorage`), Download writes a `.txt`. Note control gestures are not wired yet (poses TBD — see `DECISIONS.md [Phase 6]`).

- [ ] **Step 4:** `git diff --check` clean; both suites green. Commit `git add DECISIONS.md HANDOFF.md frontend/README.md && git commit -m "Phase 6: docs — DECISIONS [Phase 6], handoff, README controls"`

---

## Final whole-branch review

After all 6 tasks, run one whole-branch review of `git diff <phase-6-base>..HEAD` on the most capable model. Focus: (a) the `/ws/predict` message-type dispatch — a frame with `mode`/`action` must not also be treated as a landmarks frame, and the malformed-transport guards from Phase 4's fix wave still hold; (b) per-connection isolation of the new `TranscriptBuilder` (two train-mode clients don't share text); (c) `setMode` resend-on-reconnect actually re-arms train mode after a socket drop; (d) `HoldButton` can't double-fire `onHoldComplete` or fire after unmount; (e) `TrainPane` auto-scroll + `CommitPop` keying doesn't thrash on every frame (only on `transcript` change); (f) the `localStorage` history survives a JSON-parse failure; (g) `TrainPanePlaceholder` is fully removed with no dangling import. One fix wave + scoped re-review.

---

## Self-Review (plan author)

**Spec coverage:** transcript builder w/ dedupe + insert + sentence state → Task 1. Gesture commands as a config dict, generic, not hardcoded → Task 1 (`GESTURE_ACTIONS`) + DECISIONS. Low-stakes actions fire immediately → Task 5 (Space/Delete buttons, no confirm). Clear needs ~1s hold + visual fill + always an on-screen button → Task 4 (`HoldButton`) + Task 5. Auto-scrolling chat-log panel, not a fixed box → Task 5. Controls for clear/delete/save/download → Task 5. Local-state-only history, no REST → Task 5 + Global Constraints. Log the gesture→action mapping in DECISIONS → Task 6 (documented as empty/TBD, which IS the current mapping). Acceptance "sign a word → correct auto-scrolling transcript; delete/space instant; clear needs 1s hold; on-screen Clear always works" → Tasks 2+5; the true end-to-end (a human signing) is a human note in Task 6 / HANDOFF, consistent with the spec's own framing.

**No placeholders:** Task 2's tests carry a `...` shape for the "committing" integration cases with an explicit written fallback (exercise the action path directly + assert `transcript` is a string once train mode is on); everything else is concrete code or a precise interface + behaviour spec, matching how Phase 5's Tasks 6–8 were specified and executed cleanly.

**Type/name consistency:** `transcript` field name identical across the backend outbound dict (Task 2), `PredictionEvent` (Task 3), `usePrediction` return (Task 3), `TrainPane` prop (Task 5). `VALID_ACTIONS`/`'delete'|'space'|'clear'` identical between `transcript.py`, `main.py`, `predictionClient.sendAction`, `usePrediction.sendAction`, `TrainPane.onAction`, `HoldButton` consumer. `setMode('train'|'race'|null)` identical between `predictionClient`, `usePrediction`, `AppShell`. `HoldButton`'s `onHoldComplete` used by `TrainPane` for `clear`.
