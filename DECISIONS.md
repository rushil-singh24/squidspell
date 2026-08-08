# SquidSpell Decisions Log

Running log of choices made mid-build that later phases depend on. Every
phase that resolves an open question from the spec appends an entry here
before considering itself done. Format:

## [Phase N] <short decision title>
Decided: <the actual choice>
Why: <1-2 sentences>
Affects: <which later phases/files depend on this>

---

## [Phase 0] Repo location and GitHub account
Decided: Local repo at `~/squidspell` (sibling to other project directories,
independent git repo — the home directory is a separate pre-existing git
repo and never tracks this one). Remote: `rushil-singh24/squidspell`,
public. `gh` CLI active account switched to and left on `rushil-singh24`.
Why: Project owner wants this fully separate from work/other personal repos,
under a dedicated personal GitHub account, public so GitHub Actions minutes
are free and unlimited (Phase 10 needs this).
Affects: Phase 10 (CI/CD), all `git`/`gh` operations going forward.

## [Phase 0] Python version and venv layout
Decided: Python 3.11 (`/opt/homebrew/bin/python3.11`), one shared venv at
repo root (`.venv/`) for both `ml/` and `backend/`, with separate
`ml/requirements.txt` and `backend/requirements.txt` files both installed
into that one venv.
Why: `mediapipe` 1.0.0 ships a universal `py3-none` wheel so 3.11 or 3.12
both work; 3.11 chosen for widest current library compatibility. One venv
because `backend/` will import `ml/`'s feature-engineering and model-loading
code directly (Phase 4) — two venvs would require duplicating packages or
fighting cross-venv imports for no benefit at this scale. Note: a shared
venv makes third-party packages common to both, but does not by itself put
`ml/` on `sys.path` for `backend/` — there is no `ml/__init__.py` or
`pyproject.toml` yet. Phase 4 will need to add a root `pyproject.toml` and
an editable install (`pip install -e .`) — or an equivalent `sys.path`
fix — to actually make `ml` importable from `backend/`; the shared venv is
a prerequisite for that, not the whole solution.
Affects: Phase 2 (training scripts), Phase 4 (backend importing ml/ code),
Phase 9 (Docker — the backend image must install both requirements files).

## [Phase 0] Frontend toolchain
Decided: Vite 8 + React 19 + TypeScript 6 + Tailwind CSS v4 (via the
`@tailwindcss/vite` plugin, no separate PostCSS config file), with
`oxlint` (not ESLint) as the linter — run via `npm run lint`.
Why: Tailwind v4's Vite plugin removes the postcss.config/tailwind.config
boilerplate v3 required — fewer files, same capability, and it's the
current recommended setup for a new Vite project. (React 19 is what
`npm create vite@latest` scaffolds by default as of this build; no reason
to force a downgrade to 18.)
Affects: Phase 5 (theme config lives in `frontend/src/index.css` via `@theme`,
not `tailwind.config.js`), Phase 9 (frontend Docker build step is unchanged:
`npm run build`), Phase 10 (CI lint step must invoke `oxlint`, not `eslint`).
Node version is pinned via `.nvmrc` (22.19.0) and `frontend/package.json`'s
`engines` field, and Phase 9's Docker frontend image must match this Node
major version.

## [Phase 0] ML artifact and data files kept out of git
Decided: `ml/models/*.pkl`, `ml/data/*.csv`, and `ml/data/motion_sequences/`
are gitignored; the directories themselves are kept via `.gitkeep`.
Why: Trained model files and raw per-frame landmark data are regenerable
from the collection/training scripts and would otherwise bloat repo size
with binary/large CSV diffs on every retrain.
Affects: Phase 1 (data collection writes into gitignored paths — expected,
not a bug), Phase 2 (trained `.pkl` files are gitignored — Phase 9's Docker
volume mount is what makes them available to the backend at runtime instead
of a git-tracked file), Phase 11 (README must note that models aren't in git
and how to regenerate them).
