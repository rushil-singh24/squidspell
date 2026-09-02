# SquidSpell

**Real-time ASL fingerspelling recognition from a webcam**, built as two experiences on one
shared prediction engine: **Train** (open-ended fingerspelling → text) and **Race** (a
MonkeyType-style timed speed/accuracy test with a public leaderboard).

> **Live demo:** https://squidspell.vercel.app
> _First load can take ~50s while the free-tier backend wakes up._

> **Scope, honestly:** this reads **fingerspelling** — the 26-letter manual alphabet — not full
> ASL. Full ASL has whole-word signs, grammar, and facial/body non-manual markers that a
> hand-landmark classifier does not attempt.

<!-- demo GIF goes here -->

---

## How it works

```
 browser                                   server (FastAPI)
 ┌───────────────────────────┐             ┌──────────────────────────────────┐
 │ webcam frame              │             │                                  │
 │   → MediaPipe HandLandmarker            │  feature engineering             │
 │     (21 (x,y,z) landmarks) │  WebSocket  │   → static RF  (24 letters)       │
 │   → send landmarks ───────┼────────────▶│   → motion RF  (J / Z / reject)   │
 │                           │             │   → InferenceEngine merge         │
 │ transcript / race state ◀─┼─────────────┼── server-authoritative result     │
 └───────────────────────────┘             └──────────────────────────────────┘
                                              Supabase: Google auth · RLS ·
                                              history · race results · leaderboard
```

- **Hand tracking runs in the browser** (MediaPipe Tasks Vision, `HandLandmarker` VIDEO mode).
  Only the 21 landmarks per frame cross the wire — no video ever leaves the client.
- **The server owns the truth.** The transcript (Train) and the score (Race) are built
  server-side from committed letters, so a refresh or a reconnect can't desync them.
- **Static letters** (A–I, K–Y) are classified per frame, then a majority-vote smoother
  commits a letter only once it's held stable for ~0.5s.
- **Motion letters** (J, Z) are gated: the classifier only fires when the starting handshape
  matches *and* the hand has actually moved, and a dedicated `reject` class suppresses
  ordinary hand motion. Committed once, at the end of the gesture.

## Features

- 24-letter static recognition with temporal smoothing and confidence gating
- Motion-letter (J / Z) recognition via a gated trajectory classifier
- **Train mode** — server-authoritative transcript, keyboard + on-screen editing,
  save / reopen / download, optional cross-device history
- **Race mode** — 30 / 60 / 90s sprints, live SPM / accuracy / consistency, personal bests
- **Public leaderboard** — top SPM per duration, RLS-backed, viewable signed-out
- **Optional Google sign-in** (Supabase) for persistence — the app is fully usable anonymously
- Camera on/off toggle, light/dark theme, reduced-motion support

## Model performance

| Model | Algorithm | Task | Test accuracy |
|---|---|---|---|
| Static | RandomForest on engineered hand features | 24 letters | **99.4%** |
| Motion | RandomForest on trajectory features | J / Z / reject | **89.3%** |

Engineered features (pairwise fingertip distances, joint angles, finger-extension, wrist
vectors, position/scale normalisation) beat raw landmark coordinates across every model tried.
Full comparison: [`ml/results/comparison.md`](ml/results/comparison.md) ·
[`ml/results/motion_comparison.md`](ml/results/motion_comparison.md).

## Tech stack

| Layer | |
|---|---|
| **CV / ML** | MediaPipe Tasks Vision, scikit-learn (RandomForest, GridSearchCV), NumPy, joblib |
| **Backend** | Python 3.11, FastAPI, WebSockets, pure-Python inference core |
| **Frontend** | React 19, TypeScript, Vite, Tailwind v4, framer-motion |
| **Data / auth** | Supabase — Postgres, Row-Level Security, Google OAuth |
| **Infra** | Vercel (frontend), Render (backend), GitHub Actions CI |
| **Tests** | pytest (58) · Vitest + Testing Library (145) |

## Architecture notes

- **Frontend talks to Supabase directly** for auth and CRUD; Row-Level Security
  (`auth.uid() = user_id`) is the isolation boundary. The FastAPI backend is scoped to the
  ML/WebSocket engine and never proxies database calls.
- **The inference core is hardware-free and pure** (`ml/inference.py`) — the same logic runs
  in the standalone OpenCV demo and behind the WebSocket, with only the frame source
  differing. That's what makes it unit-testable without a camera.
- Every non-obvious decision made mid-build is logged in [`DECISIONS.md`](DECISIONS.md).

## Running locally

```bash
git clone https://github.com/rushil-singh24/squidspell && cd squidspell

# Python (shared venv for ml/ + backend/)
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt        # runtime
pip install -r ml/requirements.txt             # only for training / the OpenCV demo

# Backend
cd backend && uvicorn app.main:create_app --factory --reload --port 8000

# Frontend (new terminal)
cd frontend && npm install && npm run dev       # http://localhost:5173
```

The frontend reads `frontend/.env` (see `frontend/.env.example`): `VITE_WS_URL`,
`VITE_API_URL`, and — for sign-in / persistence — `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY`. Without the Supabase vars the app runs fully anonymous.

Standalone CV demo (no web stack):

```bash
cd ml && python live_demo.py     # webcam → OpenCV window, prints committed letters
```

## Improving letter accuracy

The static model is weakest on the closed-fist family (**T, N, M, A, S**) — from hand
landmarks alone these shapes are genuinely close. The fix is more targeted data, then a
retrain. It's self-contained — no database or deployment changes:

```bash
cd ml && source ../.venv/bin/activate

# 1. Record more samples for the weak letters (repeat 3–5x each,
#    varying hand angle / distance / rotation between takes)
python collect_static.py --letter T
python collect_static.py --letter N
# ...

# 2. Retrain (compares 4 models × 2 feature sets, GridSearch-tunes the winner)
python train_static.py

# 3. Check ml/results/comparison.md for the new per-class recall, then ship
git add ml/models/ ml/results/*.json
git commit -m "retrain: more T/N/M samples" && git push   # Render auto-redeploys
```

## Repo layout

```
ml/          data collection, feature engineering, training, the pure inference core, OpenCV demo
backend/     FastAPI app — REST health/metrics + the /ws/predict WebSocket
frontend/    React app — webcam pane, Train/Race modes, Supabase client
database/    schema.sql — tables + RLS policies (run once in the Supabase SQL editor)
docs/        the phase-by-phase build spec
DECISIONS.md running log of architecture decisions
```

## Future work

- **Letter accuracy** — the T/N/M/A/S confusion above; targeted data + retrain (runbook included).
- **J / Z reliability** — the motion model is trained on a small set; more takes, especially
  of the `reject` class, would cut both misses and false triggers.
- **Model registry** — the `models` table is seeded from training metrics; wiring training to
  write it automatically would make experiment tracking real.
- **Custom domain** — would also clean up the Google consent screen (currently shows the
  Supabase project domain, standard for hosted-auth setups without one).
