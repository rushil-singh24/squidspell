# SquidSpell — Handoff

**Last updated:** Phase 5 code + documentation complete and committed (2026-08-30). `frontend/`
is now the SquidSpell shared shell: a live webcam pane with in-browser MediaPipe
(`@mediapipe/tasks-vision` `HandLandmarker`, VIDEO mode) skeleton overlay, a `/ws/predict`-fed
corner readout (fps, connection dot, prediction / confidence / MOTION), a Train/Race nav toggle
with `PanelSwap` pane transitions, the underwater theme + `useTheme` dark/light toggle, a small
set of `useReducedMotion`-gated Framer Motion primitives (`PageTransition` / `PanelSwap` /
`CommitPop`), the hand-built squid mascot, and a drifting-bubble background. Gate all green:
`cd frontend && npm run lint && npm test && npm run build` — **45 tests**. Train/Race panes are
exported placeholders (`frontend/src/modes/TrainPanePlaceholder.tsx` /
`RacePanePlaceholder.tsx`) for Phases 6/7 to replace via the `AppShell` import. Run:
`cd frontend && npm run dev` → http://localhost:5173 (needs the Phase 4 backend on `:8000` for
live predictions; the shell still renders without it). See `frontend/README.md` and the
`[Phase 5]` entries in `DECISIONS.md`.
**Two human passes are owed:** (1) the Phase 3 `python ml/live_demo.py` webcam verification —
still pending, confirm all 26 letters incl. J/Z before Phase 3 formally closes; and (2) a new
Phase 5 visual / animation / allow-camera look (the shell has never been rendered in a real
browser with a real webcam).

**Resume from cold (fresh clone or new machine):**
```bash
cd ~/squidspell
/opt/homebrew/bin/python3.11 -m venv .venv   # or: nvm use (see .nvmrc)
source .venv/bin/activate
pip install -r ml/requirements.txt -r backend/requirements.txt
cd frontend && npm install && npm run dev    # http://localhost:5173
```
(`node_modules/` and `.venv/` are gitignored — a fresh clone has neither.)

**Where things stand:** Repo skeleton, `.gitignore`, `README.md`,
`DECISIONS.md` exist. Python venv (`.venv/`, Python 3.11) has `ml/` and
`backend/` dependencies installed. Frontend is a Vite 8 + React 19 + TS 6 +
Tailwind v4 scaffold serving a blank dark page — no real UI yet. Node is
pinned via `.nvmrc` (22.19.0) and `frontend/package.json`'s `engines` field.
Repo is public at `github.com/rushil-singh24/squidspell`, pushed and in
sync with `origin/main`.

**Where things stand (Phase 1 code):** `ml/collect_static.py`, `ml/collect_motion.py`, and
`ml/validate_data.py` exist and are covered by a 35-test suite (`cd ml && python -m pytest
tests/ -v`) — all hardware-free logic (resampling, confidence gating, take indexing, manifest
writing, validation) is unit-tested; only the live-webcam `_run_interactive()` wiring in each
collect_*.py is untested (expected, hardware-only code).

**Status as of 2026-08-19 (Phase 1): data collection is done — `python ml/validate_data.py`
reports overall PASS.** All 24 static letters have 200 samples each (S has 400, harmless
duplicate run) against the 150 floor, and all 3 motion classes clear the 40-take floor: J=46,
Z=48, negative=43. `ml/data/` (gitignored, kept locally only — same "regenerable artifact"
reasoning as `ml/models/*.pkl`, see `DECISIONS.md`) now holds the real dataset.

**Status as of 2026-08-19 (Phase 2): feature engineering and model training are done.**
`ml/features_static.py` (40-float engineered static-hand features) and `ml/features_motion.py`
(49-float engineered motion-trajectory features) are covered by unit tests against synthetic
fixtures. `ml/train_static.py` and `ml/train_motion.py` were then run for real against the
Phase 1 dataset (not just tests) — see `DECISIONS.md`'s `[Phase 2]` entry for the full
comparison tables. **Static: random forest + engineered features won** (see `DECISIONS.md`'s
`[Phase 2]` entry for the tuned hyperparameters and test accuracy)
(`ml/models/static_model.pkl`, bundle = `{"model", "feature_set", "classes"}`).
**Motion: random forest won** — see `DECISIONS.md` for test accuracy and per-class
precision/recall/F1, including negative-class (anti-false-trigger) recall
(`ml/models/motion_model.pkl`, bundle = `{"model", "classes"}`). Both `.pkl` files are
gitignored (regenerable — rerun the two training scripts to reproduce); `ml/results/
comparison.md` and `ml/results/motion_comparison.md` are committed (each now also includes a
Markdown confusion-matrix table for the winning model). The full test suite (Phase 1's 35 +
Phase 2's 20+) passes. **If Phase 3 live testing shows J/Z false-triggering on ordinary hand
movement, the correct response is collecting more negative takes and retraining — not tuning
thresholds in the inference loop.** **Phase 3 (Standalone Real-Time Inference Loop) is next**
— see `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 3" section.

Both training scripts also write a machine-readable JSON metrics artifact —
`ml/results/metrics.json` (static) and `ml/results/motion_metrics.json` (motion) — for Phase 4's
`GET /metrics` endpoint to serve directly. Both are gitignored (`ml/results/*.json`), so **Phase
4 must run `python ml/train_static.py` and `python ml/train_motion.py` once locally to
materialize these JSON files** — they will not exist from a fresh clone.

`ml/features_motion.py`'s trajectory features (`path_length`, `curvature`,
`direction_reversals`) are frame-count/timebase-sensitive (trained on exactly-20-frame resampled
takes) and are not camera-distance invariant (unlike the reused static-handshape sub-block,
which is scale-normalized) — see `DECISIONS.md`'s `[Phase 2]` entry for the exact remedies Phase
3/4 need if either issue surfaces in live testing.

**Status as of 2026-08-28 (Phase 3): Standalone inference loop is code-complete and unit-tested.**
`ml/model_loader.py` (model loading + `feature_set` dispatch + 20-frame motion resample),
`ml/inference.py` (pure, hardware-free pipeline components), and `ml/live_demo.py` (webcam
integration) are all committed; the full test suite runs and passes (91 tests). **Live webcam
verification is the final gate for Phase 3** — the human must run `python ml/live_demo.py` and
confirm all 26 letters including J/Z perform stably and correctly before Phase 3 formally closes.
This is the only remaining Phase 3 task; no code changes anticipated from the live pass.

**Status as of 2026-08-28 (Phase 4): FastAPI backend + WebSocket are code-complete, documented, and tested.**
`backend/app/_ml_bridge.py` (sys.path seam to `ml/`), `backend/app/prediction.py` (`PredictionService`),
and `backend/app/main.py` (`create_app`, REST endpoints, `/ws/predict`) all committed and fully
unit-tested (19 tests). Reuses `ml/model_loader.py` + `InferenceEngine` logic unchanged; only the
frame source (WebSocket vs. webcam) and output format differ. See `DECISIONS.md`'s `[Phase 4]`
entries for the payload schema, sys.path bridge rationale, per-connection engine isolation, and
metrics degradation.

**Status as of 2026-08-30 (Phase 5): the frontend shared shell is code-complete, tested, and committed.**
`frontend/src/` now holds: `lib/config.ts` (env → `WS_URL` / `API_URL`), `index.css` `@theme` +
`--sq-*` tokens, `hooks/useTheme.ts` + `components/ThemeToggle.tsx`, `motion/` (`spring` /
`quickSpring`, `fadeSlide` / `crossfade` / `commitPop` variants, `pressable`; `PageTransition` /
`PanelSwap` / `CommitPop`), `types.ts` + `lib/predictionClient.ts` + `hooks/usePrediction.ts`
(WS wrapper, backoff `[500,1000,2000,5000]` ms, one `{landmarks, t}` per frame), `lib/landmarks.ts`
+ `hooks/useHandLandmarker.ts` (dynamic `import('@mediapipe/tasks-vision')`, `HandLandmarker`
VIDEO mode, `getUserMedia`, rAF loop), `components/SkeletonOverlay.tsx` + `WebcamPane.tsx`,
`components/SquidMascot.tsx` (inline SVG, Lottie deferred to Phase 11) + `BubbleField.tsx`,
`components/ModeToggle.tsx` + `AppShell.tsx`, `modes/{Train,Race}PanePlaceholder.tsx`, and a
rewritten `App.tsx`. Build tooling from Task 1: `scripts/copy-mediapipe.mjs` (`predev` /
`prebuild` / `pretest` hooks) stages the WASM runtime + `hand_landmarker.task` into
`public/mediapipe/` + `public/models/` (both gitignored); Vitest (resolved to v4) +
`@testing-library/react` + `jsdom`. The Phase 0 Vite-scaffold sweep is done — the demo assets
and the default `frontend/README.md` are gone, `index.html` `<title>` and `package.json` `name`
are fixed. See `DECISIONS.md`'s six `[Phase 5]` entries for the client-side-MediaPipe / local
assets call, the test stack + gate, the single-`PredictionClient` rule, `useTheme`-not-a-context,
the deferred Lottie, and no-dev-proxy.

**Phase 6 (Mode A: Train) is next.** It replaces `frontend/src/modes/TrainPanePlaceholder.tsx`
via the `AppShell` import, reads `lastEvent` / `status` from the existing `usePrediction` hook
(no second socket), and reuses the `src/motion/` primitives (`CommitPop` for letter commits).
The Phase 4 backend and the Phase 5 shell are both ready.

**Known minor follow-ups (non-blocking, deferred from Phase 0's reviews):**
- ~~Unused Vite-scaffold demo assets and the default `frontend/README.md`~~ —
  swept in Phase 5 Task 1; `frontend/README.md` was recreated in Task 9.
- ~~`index.html` `<title>` / `frontend/package.json` `name` said "frontend"~~ —
  fixed in Phase 5 Task 1 (`SquidSpell` / `squidspell-frontend`).
- `frontend/.gitignore` duplicates a couple of rules already in the root
  `.gitignore` (harmless — the nested file wins).

**Push policy for this repo (confirmed with project owner 2026-08-08):**
auto-push to `origin/main` after each reviewed task/phase is fine here —
solo portfolio repo, no collaborators, Phase 10's CI/CD design assumes
continuous push activity. This does not apply to other repos.

## Where the human (not an agent) is needed, by phase

An agent can't see through a webcam or physically sign ASL, and can't click
through third-party OAuth/account-creation flows. Flagging both categories
per phase so neither is a surprise mid-build.

- **Phase 1 — Data Collection:** almost entirely human. An agent can write
  `collect_static.py`/`collect_motion.py`, but *running* them — sitting at
  the webcam and holding/performing all 26 letters 150-300+ times each — is
  something only the project owner can do. This is the single biggest
  hands-on phase in the whole project.
- **Phase 2 — Training:** fully automatable once Phase 1's data exists (no
  human needed beyond reviewing the results tables).
- **Phase 3 — Standalone inference loop:** code is complete (unit-tested, committed). Needs the human at the webcam
  to run `python ml/live_demo.py` and verify predictions are correct in real time across all 26 letters
  including J/Z (an agent can write the loop but can't judge "did it read my E correctly").
- **Phase 4 — Backend/WebSocket:** done — backend is script-testable with deterministic
  fake-landmark frames; no human needed. All endpoints tested and serving.
- **Phase 5 — Frontend shell/theme:** code done (shell + theme + motion +
  MediaPipe pipeline, 45 tests green). One visual + camera-permission pass
  owed — a human must open `npm run dev` in a real browser, allow the webcam
  once per profile, and eyeball the animation/theme/skeleton overlay.
- **Phase 6 — Train mode:** needs the human signing at the webcam to verify
  the transcript, gesture commands, etc. actually work end-to-end.
- **Phase 7 — Race mode:** same — needs a human actually racing to verify
  scoring.
- **Phase 8 — Auth & Persistence:** explicit human setup required *before*
  any agent work can start on this phase — create a Supabase account/project
  (get the Project URL + anon key), and separately set up a Google Cloud
  OAuth consent screen + client ID (get the client ID/secret into Supabase's
  Google provider settings). See the Phase 8 section of the full-phases doc
  for exact steps. No card required for either.
- **Phase 9 — Containerization:** explicit human setup required first —
  install Docker Desktop (or Engine + Compose) locally; one-time install,
  nothing an agent can do on this machine.
- **Phase 10 — CI/CD & Deployment:** human needed to create/connect Render
  and Vercel accounts (typically GitHub-OAuth signup + "import this repo"
  clicks) and to add any resulting deploy tokens as GitHub Actions secrets.
- **Phase 11 — Polish:** human needed to record the actual demo GIF/video
  (signing on camera, including a J or Z) — an agent can't generate a real
  demo of a human signing.

**Phase 2 is complete as of 2026-08-19** — static and motion classifiers are trained and
exported. **Phase 3 code is complete as of 2026-08-28** — awaits human live-webcam verification.
**Phase 4 is complete as of 2026-08-28** — backend serves all endpoints and WebSocket schema.
**Phase 5 is complete as of 2026-08-30** — `frontend/` shell renders the webcam pane, in-browser
MediaPipe skeleton overlay, `/ws/predict` readout, Train/Race nav, theme, and motion primitives
(45 tests green); one visual + camera-permission pass owed. **Phase 6 (Mode A: Train) is
unblocked** and can proceed immediately — it swaps `frontend/src/modes/TrainPanePlaceholder.tsx`
and reads from the existing `usePrediction` hook.
