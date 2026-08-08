# Phase 0: Project Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the SquidSpell monorepo structure, tooling, and cross-session decision log — nothing functional yet, but every later phase can start coding immediately without setup work.

**Architecture:** A single git repo (`~/squidspell`, remote `rushil-singh24/squidspell`) with five top-level workspaces (`frontend/`, `backend/`, `ml/`, `database/`, `docker/`, `infra/`) sharing one Python virtualenv and one Node toolchain. No cross-service code exists yet — this phase only proves each toolchain boots cleanly.

**Tech Stack:** Python 3.11 (venv), Vite + React 18 + TypeScript + Tailwind CSS v4, npm.

## Global Constraints

- Repo root: `/Users/rushil.singh/squidspell`, GitHub remote: `rushil-singh24/squidspell` (public).
- Python: 3.11 via `/opt/homebrew/bin/python3.11` — see `DECISIONS.md` Phase 0 entry.
- One shared venv (`.venv` at repo root) for `ml/` and `backend/` — see `DECISIONS.md` Phase 0 entry.
- Node: v22.19.0 / npm 10.9.3 (already installed, verify not install).
- Every phase-scoped, cross-phase decision must be appended to `DECISIONS.md` in the exact format already established there before a task is considered done.
- Full phase detail lives in `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md` — this plan implements only that doc's "Phase 0" section.

---

### Task 1: Repo skeleton, `.gitignore`, `README.md`, `DECISIONS.md`

**Files:**
- Create: `frontend/.gitkeep`, `backend/.gitkeep`, `ml/.gitkeep`, `ml/data/.gitkeep`, `ml/models/.gitkeep`, `ml/results/.gitkeep`, `database/.gitkeep`, `docker/.gitkeep`, `infra/.gitkeep`
- Create: `.gitignore`
- Create: `README.md`
- Create: `DECISIONS.md`

**Interfaces:**
- Produces: the directory tree every later phase writes into. Task 2 writes into `ml/` and `backend/`. Task 3 writes into `frontend/`.

- [ ] **Step 1: Verify the tree doesn't exist yet**

```bash
cd ~/squidspell && find . -maxdepth 1 -type d
```
Expected: only `.git` and `docs` (created earlier this session for the spec docs).

- [ ] **Step 2: Create the directory tree**

```bash
cd ~/squidspell
mkdir -p frontend backend ml/data ml/models ml/results database docker infra
touch frontend/.gitkeep backend/.gitkeep ml/.gitkeep ml/data/.gitkeep ml/models/.gitkeep ml/results/.gitkeep database/.gitkeep docker/.gitkeep infra/.gitkeep
```

- [ ] **Step 3: Write `.gitignore`**

```gitignore
# Python
.venv/
__pycache__/
*.pyc
*.egg-info/

# Node
node_modules/
frontend/dist/

# Env secrets
.env
.env.*
!.env.example

# ML artifacts — regenerable, kept out of git; ml/models/.gitkeep and
# ml/data/.gitkeep hold the directories open instead
ml/models/*.pkl
ml/data/*.csv
ml/data/motion_sequences/

# OS
.DS_Store
```

- [ ] **Step 4: Write `README.md`**

```markdown
# SquidSpell

A real-time computer vision system that reads **ASL fingerspelling** — the
manual alphabet, not full ASL (which includes whole-word signs, grammar, and
facial/body non-manual markers) — from a webcam, and powers two experiences
off one shared prediction engine: **Train** (live, open-ended fingerspelling
to text, for practice and communication) and **Race** (a MonkeyType-style
timed fingerspelling speed/accuracy test).

![demo placeholder](docs/demo-placeholder.gif)

Full design spec: `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`
```

- [ ] **Step 5: Write `DECISIONS.md`**

```markdown
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
fighting cross-venv imports for no benefit at this scale.
Affects: Phase 2 (training scripts), Phase 4 (backend importing ml/ code),
Phase 9 (Docker — the backend image must install both requirements files).

## [Phase 0] Frontend toolchain
Decided: Vite + React 18 + TypeScript + Tailwind CSS v4 (via the
`@tailwindcss/vite` plugin, no separate PostCSS config file).
Why: Tailwind v4's Vite plugin removes the postcss.config/tailwind.config
boilerplate v3 required — fewer files, same capability, and it's the
current recommended setup for a new Vite project.
Affects: Phase 5 (theme config lives in `frontend/src/index.css` via `@theme`,
not `tailwind.config.js`), Phase 9 (frontend Docker build step is unchanged:
`npm run build`).

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
```

- [ ] **Step 6: Verify the tree and files exist**

```bash
cd ~/squidspell
find . -maxdepth 3 -not -path './.git*' -not -path './docs*' | sort
test -f .gitignore && test -f README.md && test -f DECISIONS.md && echo "OK"
```
Expected: all six workspace directories with `.gitkeep` files, plus the three root files, and `OK` printed.

- [ ] **Step 7: Commit**

```bash
cd ~/squidspell
git add frontend/.gitkeep backend/.gitkeep ml/.gitkeep ml/data/.gitkeep ml/models/.gitkeep ml/results/.gitkeep database/.gitkeep docker/.gitkeep infra/.gitkeep .gitignore README.md DECISIONS.md
git commit -m "Phase 0: repo skeleton, gitignore, README, decisions log"
```

---

### Task 2: Python environment for `ml/` and `backend/`

**Files:**
- Create: `ml/requirements.txt`
- Create: `backend/requirements.txt`

**Interfaces:**
- Produces: `.venv/` at repo root with all Phase 1-4 dependencies pre-installed, so those phases start writing code immediately with no environment setup.

- [ ] **Step 1: Write `ml/requirements.txt`**

```
opencv-python==4.10.0.84
mediapipe==1.0.0
scikit-learn==1.5.2
joblib==1.4.2
numpy==1.26.4
pandas==2.2.3
```

- [ ] **Step 2: Write `backend/requirements.txt`**

```
-r ../ml/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.31.0
websockets==13.1
python-dotenv==1.0.1
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 3: Create the venv and verify it's empty of these packages**

```bash
cd ~/squidspell
/opt/homebrew/bin/python3.11 -m venv .venv
source .venv/bin/activate
python -c "import fastapi" 2>&1
```
Expected: `ModuleNotFoundError: No module named 'fastapi'` — confirms this is a fresh venv before install.

- [ ] **Step 4: Install both requirements files**

```bash
source .venv/bin/activate
pip install --upgrade pip
pip install -r ml/requirements.txt -r backend/requirements.txt
```
Expected: installs with no errors. `mediapipe` and `opencv-python` are the largest/slowest — let this run to completion.

- [ ] **Step 5: Verify the install**

```bash
source .venv/bin/activate
python -c "import cv2, mediapipe, sklearn, joblib, fastapi, uvicorn, websockets, pytest; print('OK')"
```
Expected: prints `OK` with no import errors.

- [ ] **Step 6: Commit**

```bash
cd ~/squidspell
git add ml/requirements.txt backend/requirements.txt
git commit -m "Phase 0: Python requirements for ml/ and backend/"
```

(`.venv/` itself is gitignored per Task 1 — not committed.)

---

### Task 3: Frontend scaffold (Vite + React + TypeScript + Tailwind v4)

**Files:**
- Create: `frontend/` (Vite-generated React+TS project, replacing the `.gitkeep` placeholder)
- Modify: `frontend/src/index.css` (Tailwind import)
- Modify: `frontend/src/App.tsx` (strip Vite's default demo content to a blank page)

**Interfaces:**
- Produces: a running `npm run dev` server at `http://localhost:5173` serving a blank page. Phase 5 builds the shared shell (webcam pane, mode nav, theme) inside `frontend/src/App.tsx` and new components under `frontend/src/components/`.

- [ ] **Step 1: Verify no frontend project exists yet**

```bash
cd ~/squidspell && ls frontend/
```
Expected: only `.gitkeep`.

- [ ] **Step 2: Scaffold Vite React+TS into `frontend/`**

```bash
cd ~/squidspell
rm frontend/.gitkeep
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 3: Add Tailwind v4**

```bash
cd ~/squidspell/frontend
npm install tailwindcss @tailwindcss/vite
```

Edit `frontend/vite.config.ts` to add the Tailwind plugin:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

Edit `frontend/src/index.css` — replace its contents entirely with:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Strip the Vite demo content to a blank page**

Replace `frontend/src/App.tsx` entirely with:

```tsx
function App() {
  return <div className="h-screen w-screen bg-slate-950" />
}

export default App
```

Delete the now-unused demo asset:

```bash
rm -f ~/squidspell/frontend/src/App.css
```

- [ ] **Step 5: Run the dev server and verify it serves a blank page**

```bash
cd ~/squidspell/frontend
npm run dev &
sleep 2
curl -s http://localhost:5173/ | grep -o '<div id="root">.*</div>' || curl -s http://localhost:5173/
kill %1
```
Expected: the dev server responds on port 5173 with the Vite HTML shell (containing `<div id="root">`). The rendered page (if opened in a browser) is a blank dark screen — no Vite starter content, no console errors.

- [ ] **Step 6: Verify the production build also succeeds**

```bash
cd ~/squidspell/frontend
npm run build
```
Expected: builds without errors, producing `frontend/dist/` (gitignored per Task 1).

- [ ] **Step 7: Commit**

```bash
cd ~/squidspell
git add frontend/
git commit -m "Phase 0: Vite + React + TypeScript + Tailwind v4 frontend scaffold"
```

---

### Task 4: Final Phase 0 acceptance check

**Files:** none created — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: confirmation that Phase 0's acceptance criteria (from the spec) are met, unblocking Phase 1.

- [ ] **Step 1: Re-check every acceptance criterion from the spec**

```bash
cd ~/squidspell
echo "--- directory tree ---"
find . -maxdepth 2 -not -path './.git*' -not -path './.venv*' -not -path './frontend/node_modules*' | sort
echo "--- python env ---"
source .venv/bin/activate && python -c "import cv2, mediapipe, sklearn, fastapi; print('python env OK')"
echo "--- decisions log ---"
test -s DECISIONS.md && echo "DECISIONS.md OK"
echo "--- git status ---"
git status --short
```
Expected: all six workspace dirs present, `python env OK`, `DECISIONS.md OK`, and `git status --short` shows a clean tree (everything from Tasks 1-3 already committed).

- [ ] **Step 2: Push to GitHub**

```bash
cd ~/squidspell
git push origin main
```
Expected: pushes cleanly, no conflicts (this is the first push since the initial spec-docs commit).

- [ ] **Step 3: Write `HANDOFF.md` for cross-session continuity**

```markdown
# SquidSpell — Handoff

**Last updated:** Phase 0 complete.

**Where things stand:** Repo skeleton, `.gitignore`, `README.md`,
`DECISIONS.md` exist. Python venv (`.venv/`, Python 3.11) has `ml/` and
`backend/` dependencies installed. Frontend is a bare Vite+React+TS+Tailwind
v4 scaffold serving a blank dark page — no real UI yet.

**Next up:** Phase 1 — Data Collection Pipeline (`ml/collect_static.py`,
`ml/collect_motion.py`). See
`docs/superpowers/specs/2026-08-08-squidspell-full-phases.md`, "Phase 1"
section, for full task/acceptance-criteria detail.

**Before starting Phase 1, read:**
- `DECISIONS.md` in full (short right now, will grow).
- The Phase 1 section of the full-phases spec doc linked above.

**Nothing blocking. No open questions carried over from Phase 0.**
```

- [ ] **Step 4: Commit and push the handoff doc**

```bash
cd ~/squidspell
git add HANDOFF.md
git commit -m "Phase 0: handoff doc for cross-session continuity"
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** Every Phase 0 task from the spec (monorepo structure, git init + `.gitignore`, Python env, Vite+React+TS+Tailwind scaffold, root `README.md`, `DECISIONS.md`) maps to Tasks 1-3 above. Git init itself already happened earlier this session (before this plan existed) — not repeated here.
- **No placeholders:** all file contents above are complete, copy-pasteable content, not descriptions.
- **Acceptance criteria match spec exactly:** "Folders exist, frontend dev server runs and shows a blank page, Python env installs without error, DECISIONS.md exists" — each is a discrete verification step in Task 4.
