# SquidSpell — Handoff

**Last updated:** Phase 0 complete and merged (commit `076b616`).

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

**Next up:** Phase 1 — Data Collection Pipeline (`ml/collect_static.py`,
`ml/collect_motion.py`). See
`docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 1"
section, for full task/acceptance-criteria detail.

**Before starting Phase 1, read:**
- `DECISIONS.md` in full (five entries so far — repo/account setup, Python
  env, frontend toolchain, gitignored ML artifacts).
- The Phase 1 section of the full-phases spec doc linked above.
- The design spec at `docs/superpowers/specs/2026-08-08-squidspell-design.md`
  for the overall product framing (not required for Phase 1's CV/ML work,
  but relevant once Phase 5's theme/UI work starts).

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

**Nothing blocking Phase 1.**
