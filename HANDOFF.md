# SquidSpell — Handoff

**Last updated:** Phase 2 fully complete — static and motion classifiers trained on the real
Phase 1 dataset and exported (2026-08-19). Winning static model: **random forest on engineered
features**, test accuracy 0.994. Winning motion model: **random forest**, test accuracy 0.893,
negative-class (anti-false-trigger) recall 0.778. See `DECISIONS.md`'s "[Phase 2] Real training
run results and winning models" entry for the full comparison numbers and the exact
`static_model.pkl`/`motion_model.pkl` bundle shapes Phase 3/4 need to load.

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

**Before starting Phase 3, read:**
- `DECISIONS.md` in full — the `[Phase 1]` entry documents the data-collection constants, and
  the `[Phase 2]` entry documents the winning models and the exact bundle keys
  (`static_model.pkl`'s `feature_set` key in particular) Phase 3 must branch on before calling
  `.predict()`.
- `ml/README.md` for where the data actually lives.
- The Phase 3 section of the full-phases spec doc.

**Known minor follow-ups (non-blocking, deferred from Phase 0's reviews):**
- Unused Vite-scaffold demo assets (`frontend/src/assets/hero.png`,
  `react.svg`, `vite.svg`, `frontend/public/icons.svg`) and the default
  Vite `frontend/README.md` are still in the tree — sweep these when Phase 5
  brings in real theme assets.
- `index.html`'s page title and `frontend/package.json`'s `name` still say
  "frontend" — cosmetic, fix whenever Phase 5/11 touches those files.
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
- **Phase 3 — Standalone inference loop:** needs the human at the webcam
  again to verify predictions are correct in real time (an agent can write
  the loop but can't judge "did it read my E correctly").
- **Phase 4 — Backend/WebSocket:** automatable — a test script can simulate
  landmark frames without a live human.
- **Phase 5 — Frontend shell/theme:** mostly automatable; browser webcam
  permission prompts need a human click once per browser profile, and
  visual/animation polish benefits from a human actually looking at it.
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
exported (see the status section above for the winning models/accuracy). **Phase 3 is
unblocked** — it can proceed against `ml/models/static_model.pkl` and `ml/models/motion_model.pkl`
as soon as a human is available at the webcam to verify live predictions.
