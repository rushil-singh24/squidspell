# SquidSpell — Real-Time ASL Fingerspelling Trainer — Design Spec

Date: 2026-08-08
Status: Approved pending user sign-off (see bottom)

## Naming honesty

Working name: SquidSpell (subject to change). This project recognizes the **full ASL manual alphabet (fingerspelling)** — not full ASL, which includes whole-word signs, grammar, and facial/body non-manual markers. Never describe it as a generic "ASL Translator."

## What this is

A real-time computer vision system that reads ASL fingerspelling from a webcam and powers two experiences off one shared prediction engine:

- **Train mode** — live, open-ended fingerspelling → running text transcript, for practice and actual communication use.
- **Race mode** — a MonkeyType-style timed test (15s/30s/60s, selectable): sign a stream of prompted words, get scored on Signs Per Minute and accuracy, track personal bests.

A third mode (guided drill/tutor) is deliberately deferred to stretch goals — it's genuinely different from Train only if built as prompt-one-letter-at-a-time-and-grade, and isn't needed for the core project.

## Why this is worth building

Fingerspelling speed/accuracy practice has a real audience (ASL learners, interpreters-in-training). One inference engine serving both a communication tool (Train) and a training tool (Race) is a legitimate software design story, not "webcam demo with two screens."

## Scope note: J and Z

24 of 26 letters are static single-frame poses. J and Z are motion letters — defined by movement, not pose — and require a second, lightweight motion classifier running alongside the static one. This is a real step up in technical depth (temporal/sequence recognition layered on static classification) and phases involving it are budgeted for that extra work.

## Shared architecture

```
Webcam → OpenCV frame capture → MediaPipe hand landmarks
    │
    ├─→ Static classifier (24 static letters, single-frame features)
    │       → per-frame prediction, smoothed via majority-vote window
    │
    └─→ Motion detector (rolling buffer of last ~20 frames)
            → triggers only when handshape gates to J or Z's starting pose
              AND hand centroid displacement exceeds a movement threshold
            → motion classifier scores buffered trajectory → J, Z, or reject
    │
    ▼
Unified stable letter stream (WebSocket) →  ┬─ Train: transcript builder
                                              └─ Race: prompt matcher + scorer
```

Both classifiers feed one merged output stream. Everything downstream of "stable letter stream" is the only place Train and Race diverge — neither mode reaches back into the prediction pipeline independently.

## Design direction

Minimalist, MonkeyType-inspired UI — generous negative space, sign/letters area is always the visual focus, never a dashboard. Underwater theme lives in palette and small details (deep blue/teal gradient, subtle bubble-particle drift), squid mascot appears sparingly (idle/empty states, loading, race results) — never persistent during active signing. Motion (page transitions, mode switches, letter-commit micro-animations) is spring-eased and continuous, not linear/robotic. If theme/mascot ever competes with letters/transcript for attention, pull it back.

## Full stack

| Layer | Tech |
|---|---|
| CV | OpenCV, MediaPipe Hands |
| ML | Scikit-Learn (RF, SVM, Gradient Boosting, Logistic Regression), Joblib |
| Backend | FastAPI, WebSockets |
| Auth/DB | Supabase (Postgres + Auth + Storage) |
| Frontend | React + TypeScript, TailwindCSS |
| Animation | Framer Motion, Lottie (hand-built/CC0 mascot assets only) |
| DevOps | Docker, Docker Compose, GitHub Actions |
| Deploy | Render or Fly.io (backend) + Vercel (frontend); AWS is a doc-only stretch goal |

## Budget: $0

Every tool is free-tier, no card required, except Fly.io (needs a card for its free allowance — use Render instead to avoid this) and the optional stretch-goal AWS deployment (real risk of unexpected billing — **do not deploy to AWS live**, write-up only). Known free-tier catches to design around, not just deploy around:

- Supabase free projects pause after ~1 week idle — acceptable for a portfolio piece, first request after pause just takes a few extra seconds.
- Render free web service spins down after 15 min idle — ~30-60s cold start; hit the URL a minute before an interview demo.
- GitHub Actions is free-unlimited only on **public** repos — this repo stays public.
- No custom domain — use free `*.vercel.app` / `*.onrender.com` subdomains.

## Build order

Phase 0 → 1 → 2 → 3 (validate ML/CV core standalone, no web) → 4 → 5 (backend + shared frontend shell) → 6 → 7 (Train + Race, built off the shared shell) → 8 (auth/persistence) → 9 → 10 (ship) → 11 (polish).

**Execution model:** one phase is planned and built per session (or a small cluster of sessions), not all at once. Each phase's acceptance criteria are the next phase's prerequisites. `DECISIONS.md` at the repo root is the running log of mid-build choices this spec deliberately leaves open (winning classifier/feature set, final gesture mapping, etc.) — every phase that resolves one of those must append an entry before considering itself done. A future session starting cold must read `DECISIONS.md` (and, once it exists, `HANDOFF.md`) before resuming work.

## Phases

*(Full phase-by-phase task lists and acceptance criteria — Phase 0 through Phase 11 — are as specified by the project owner; see the repo's phase docs, created one at a time via the writing-plans flow, for the authoritative task/acceptance-criteria breakdown per phase. Summary of each phase's goal:)*

- **Phase 0 — Project Scaffolding:** monorepo structure (`frontend/`, `backend/`, `ml/`, `database/`, `docker/`, `infra/`), git init, `.gitignore`, Python env, Vite+React+TS+Tailwind scaffold, root `README.md`, `DECISIONS.md`.
- **Phase 1 — Data Collection Pipeline:** `ml/collect_static.py` (24 static letters, labeled landmark CSV) and `ml/collect_motion.py` (J/Z motion sequences + negative examples, resampled to fixed length).
- **Phase 2 — Feature Engineering & Model Training:** engineered vs. raw feature comparison across 4 classifiers for static letters; trajectory-feature 3-class (J/Z/reject) motion classifier; both exported via Joblib; results logged to `ml/results/`.
- **Phase 3 — Standalone Real-Time Inference Loop:** OpenCV window proving the full static+motion merged pipeline works live, before any web layer.
- **Phase 4 — Backend: FastAPI + WebSocket Prediction Service:** `/ws/predict` serving Phase 3's logic per-connection; `GET /health`, `/models`, `/metrics`.
- **Phase 5 — Frontend Shared Shell, Theme & Animation Foundation:** webcam capture + skeleton overlay, Train/Race nav, underwater/MonkeyType theme, Framer Motion + Lottie primitives — built once, reused by Phases 6/7.
- **Phase 6 — Mode A: Train:** live transcript builder, gesture-driven delete/space/clear (config-driven mapping, TBD gestures decided during data collection, clear requires a ~1s hold, on-screen Clear button always available).
- **Phase 7 — Mode B: Race:** duration-selectable timed test, MonkeyType-style word stream, SPM/accuracy/consistency scoring, personal bests, using the same engine as Train.
- **Phase 8 — Auth & Persistence (Supabase):** Google OAuth via Supabase Auth, frontend talks to Supabase directly (RLS enforces per-user access, FastAPI never proxies CRUD), replaces Phase 6/7's local-state stubs.
- **Phase 9 — Containerization:** `docker-compose up` runs backend + frontend locally, no DB container needed (Supabase is hosted).
- **Phase 10 — CI/CD & Deployment:** GitHub Actions build/test/deploy on merge to main; Render (backend) + Vercel (frontend); AWS documented only, never deployed.
- **Phase 11 — Polish & Documentation:** README with honest framing, architecture diagram, model comparison tables, demo GIFs, Design Decisions section synthesized from `DECISIONS.md`, Future Work section.

## Explicitly out of scope

Separate microservices per backend concern; custom-rolled password auth; Nginx reverse proxy for local dev; a public third-party API.

## Legitimate stretch goals (post-Phase 11 only)

Drill mode (third, genuinely distinct mode); MLflow experiment tracking; PyTorch comparison branch; two-handed signs; ONNX export; real AWS deployment (opt-in, billing alerts required).

## Logistics decisions (this session)

- **Repo:** `rushil-singh24/squidspell` on GitHub, public (required for free unlimited Actions minutes and because it's a portfolio piece).
- **Local path:** `~/squidspell` — a sibling directory to the user's other project repos, its own independent git repo (the user's home directory is a separate pre-existing git repo; `~/squidspell` is untracked by it and never `git add`ed there).
- **GitHub CLI active account:** switched from `rushilsingh-LF` to `rushil-singh24` and left active (this is now the default account for `gh` on this machine going forward).
- **Python version:** 3.11 (Homebrew install at `/opt/homebrew/bin/python3.11`) for `ml/` and `backend/` — `mediapipe` 1.0.0 ships a universal `py3-none` wheel so 3.11 or 3.12 both work; 3.11 chosen for the widest current library compatibility. One shared venv for `ml/` + `backend/` (they share the model-loading and landmark code); documented in `DECISIONS.md`.
- **Cross-session continuity:** in addition to `DECISIONS.md` (architecture/technical choices), maintain a `HANDOFF.md` at the repo root — current phase, what's done, what's next, anything a cold-start session needs to not re-derive. Updated at the end of each work session.

## Approval

This spec restates the project owner's own detailed description (supplied in full) plus the logistics decisions above. Pending explicit user approval before proceeding to the Phase 0 implementation plan.
