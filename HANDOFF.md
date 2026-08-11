# SquidSpell — Handoff

**Last updated:** Phase 1 complete, including the final whole-branch review fix-up wave
(raw-frame tracking in the manifest, `validate_data.py` file/header/consistency checks,
take-index collision fix, live camera preview during countdowns, and this doc) landed on
top of Phase 1's original completion commit `5840d2f`.

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

**Next up — status as of 2026-08-11: data collection has NOT started.** `ml/data/` is empty
(just `.gitkeep`s) — 0 of 24 static letters, 0 of 3 motion classes. Phase 1's code is done and
tested, but the actual dataset does not exist yet; that requires the project owner at a
webcam. **`ml/README.md`'s "Collecting data" section is the exact walkthrough** — camera
permission caveat, per-letter commands, the `for` loop trick for motion takes (~40-60 takes
each × J/Z/negative would be painful to type individually), and how to fix a bad take. Run
`cd ml && python validate_data.py` at any time to check progress against the acceptance
floors (150 samples/letter x24, 40 takes/class x3). Once `validate_data.py` reports overall
PASS, Phase 2 (Feature Engineering & Model Training) can start — see
`docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 2" section.

**Before starting Phase 2, read:**
- `DECISIONS.md` in full — the `[Phase 1]` entry documents the exact constants (confidence
  threshold, frame counts, resample length, per-take file format) Phase 2's training script
  needs to know about.
- `ml/README.md` for where the data actually lives.
- The Phase 2 section of the full-phases spec doc.

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

**Blocking Phase 2: the real dataset must exist and `python ml/validate_data.py` must report
overall PASS.** This is a human task (data collection), not an agent task.
