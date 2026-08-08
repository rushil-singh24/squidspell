# SquidSpell — Full Phase-by-Phase Source Doc

This is the verbatim project description supplied by the project owner, preserved in full so no phase detail is lost to summarization. `2026-08-08-squidspell-design.md` in this same directory is the top-level design spec and links here for phase detail. Each phase, when actually planned (via the writing-plans flow), should re-read its section here directly rather than relying on any summary.

---

## SquidSpell — Real-Time ASL Fingerspelling Trainer

Working name: SquidSpell (subject to change). Whatever it ends up being called, keep the naming honest: this project recognizes the full ASL manual alphabet (fingerspelling), not full ASL (which includes whole-word signs, grammar, and facial/body non-manual markers). Avoid describing it as a generic "ASL Translator" — that overclaims, and a technical interviewer who knows ASL will notice.

### Overview (read this before starting any phase)

**What this is:** A real-time computer vision system that reads ASL fingerspelling from a webcam and powers two experiences off one shared prediction engine:

- Train mode — live, open-ended fingerspelling → running text transcript at the bottom of the screen, for practice and actual communication use.
- Race mode — a MonkeyType-style timed test (15s / 30s / 60s, selectable): sign a stream of prompted words, get scored on speed (Signs Per Minute) and accuracy, track personal bests.

**Why two modes, not three:** A guided-drill mode (app prompts one letter at a time, grades you, no time pressure) is a genuinely different interaction from Train — but only if it's actually built that way; a third mode that's just Train relabeled again would be padding, not scope. Ship Train + Race for the core project; a dedicated drill/tutor mode is listed as a clean, cheap-to-add stretch goal later (see bottom) since it reuses the same engine.

**Why this is worth building (the honest pitch):** Fingerspelling speed and accuracy is something real ASL learners and interpreters-in-training practice and drill. A tool that both assists communication and gamifies practice has a genuine audience — this isn't "webcam demo with two screens," it's one inference engine serving a communication tool and a training tool, which is a legitimately good software design story for an interview.

**A note on scope:** the full manual alphabet includes two motion letters, J and Z, which can't be read from a single frame the way the other 24 letters can — they're defined by a movement, not a pose. This plan includes them via a second, lightweight motion classifier running alongside the static one (see Phases 1–4). That's a legitimate step up in technical depth for a portfolio project (temporal/sequence recognition on top of static classification), but it does mean those phases are doing more than "one classifier, done." Budget extra time there.

**Shared architecture both modes sit on top of:**

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

Both classifiers feed into one merged output stream. Downstream (transcript, Race) never needs to know whether a letter came from the static or motion path. Everything downstream of "stable letter stream" is the only place the two modes diverge. Keep it that way — don't let Race or Train reach back into the prediction pipeline independently.

**Design direction:** Minimalist, MonkeyType-inspired UI — generous negative space, no chrome/clutter, the sign-and-letters area is the visual focus at all times, not a dashboard. Underwater theme lives in the palette and small details, not in ornamentation: deep blue/teal gradient background, subtle bubble-particle drift, a cartoonish squid mascot used sparingly at specific moments (idle/empty states, loading, race results/celebration) rather than persistently on screen. If the mascot or theme ever competes with the letters/transcript for attention, that's a sign to pull it back — MonkeyType's whole visual language works because it gets out of the way, and that's the thing to preserve even as a squid theme gets layered in. Motion (page transitions, mode-switch transitions, letter-commit micro-animations, mascot idle animation) should feel continuous and physics-based (spring easing, not linear/robotic), matching the "smooth" feel MonkeyType and similar polished sites have.

**Full stack:**

| Layer | Tech |
|---|---|
| CV | OpenCV, MediaPipe Hands |
| ML | Scikit-Learn (RF, SVM, Gradient Boosting, Logistic Regression), Joblib |
| Backend | FastAPI, WebSockets |
| Auth/DB | Supabase (Postgres + Auth + Storage) |
| Frontend | React + TypeScript, TailwindCSS |
| Animation | Framer Motion (page/component transitions, micro-interactions), Lottie (mascot animations — free to hand-build in a vector tool, no paid asset packs needed) |
| DevOps | Docker, Docker Compose, GitHub Actions |
| Deploy | Render/Fly.io (backend) + Vercel (frontend) — AWS is a documented stretch goal, not the default target |

**Cost: $0.** Every tool below is on a free tier with no card required to start, except where noted. Read the constraints table below before Phase 8 and Phase 10 — free tiers have real limits (spin-down, pausing, minute caps) that change how you build, not just where you deploy.

| Service | Free tier | The catch | What it means for you |
|---|---|---|---|
| Supabase | Free project: 500MB DB, 1GB storage, 50k monthly active users | Free projects pause after ~1 week of no API activity. | Fine for a portfolio piece people occasionally check out; if it's paused, first visitor's request just takes a few extra seconds to wake it — not a real problem, just don't be surprised by it in a live demo. |
| Google OAuth | Free, no cap for normal use | Needs "verification" only past 100 test users on a restricted-scope app | Irrelevant at portfolio scale — leave it in testing/unverified mode. |
| Render (backend) | Free web service tier | Spins down after 15 min idle; ~30–60s cold start on next request. | Fine for a resume link people click occasionally. If you're demoing live in an interview, hit the URL a minute before you need it. |
| Fly.io (alt to Render) | Free allowance (small VM hours/month) | Requires a card on file even for free tier | If you don't want to give a card at all, use Render instead. |
| Vercel (frontend) | Free Hobby plan | Non-commercial use only, generous bandwidth cap | No issue for a portfolio project. |
| GitHub Actions | Free unlimited minutes on public repos | Private repos get a limited free minute allowance/month | Keep the repo public (which you want anyway for a portfolio piece) and CI is fully free. |
| OpenCV / MediaPipe / Scikit-Learn / FastAPI / React | Open source, always free | — | No catch. |
| Framer Motion / Lottie | Open source, always free | Lottie files from paid marketplaces cost money | Build your own simple squid mascot animation (even a basic vector loop) or use explicitly free/CC0 Lottie assets — don't buy one. |
| Custom domain | Not required | Costs $10–15/yr if you want one | Skip it — use the free *.vercel.app and *.onrender.com/*.fly.dev subdomains. Link them from your resume/GitHub README instead. |
| AWS (stretch goal only) | "Free tier" is 12 months, then billed; several services (RDS, ALB) are barely free-tier-eligible at all | Real risk of an unexpected bill, especially RDS and an idle EC2 left running | Do not deploy this live. Keep it as an architecture write-up/diagram only, as the plan already says — treat this as non-negotiable given the $0 budget. |

**Build order at a glance:** Phase 0 → 1 → 2 → 3 (validate the ML/CV core works standalone, no web yet) → 4 → 5 (backend + shared frontend shell) → 6 → 7 (the two modes, built in parallel off the shared shell) → 8 (auth/persistence) → 9 → 10 (ship it) → 11 (polish).

**How to use this doc with an agent:** Each phase below is self-contained — goal, prerequisites, concrete tasks, and acceptance criteria. Feed one phase at a time. Don't let an agent start a phase whose prerequisites aren't met; the acceptance criteria of phase N are the prerequisites of phase N+1.

### Phase 0 — Project Scaffolding

**Goal:** Repo structure and tooling exist; nothing functional yet.

Tasks:
- Create monorepo structure:
  ```
  squidspell/
    frontend/          # React + TS + Tailwind
    backend/            # FastAPI
    ml/                 # data collection, training, evaluation, saved models
    database/           # Supabase migrations/schema SQL
    docker/
    infra/               # GitHub Actions, deploy configs
    README.md
    DECISIONS.md
  ```
- Initialize git, .gitignore (venv, node_modules, .env, model artifacts over a size threshold).
- Python env for ml/ and backend/ (one shared venv or two — agent's choice, document it).
- frontend/: Vite + React + TypeScript + TailwindCSS scaffold.
- Root README.md with one paragraph: what the project is, the honest fingerspelling-not-full-ASL framing, and a placeholder for a demo GIF.
- Create DECISIONS.md at the repo root — a running log of choices made mid-build that later phases depend on. This plan deliberately leaves several things open-ended (which classifier/feature set wins, which control gestures get used, etc.) for a later phase to decide empirically. Every phase below that makes one of those calls must append an entry here before considering itself done, in this format:
  ```
  ## [Phase N] <short decision title>
  Decided: <the actual choice>
  Why: <1-2 sentences>
  Affects: <which later phases/files depend on this>
  ```
- If you're feeding phases to an agent one at a time (possibly across separate sessions), read DECISIONS.md at the start of every phase and pass its current contents into context — later phases (5, 6, 7 especially) reference earlier decisions by name, and an agent starting cold in a new session has no way to know them otherwise.

**Acceptance criteria:** Folders exist, frontend dev server runs and shows a blank page, Python env installs without error, DECISIONS.md exists (even if empty except for the format above).

### Phase 1 — Data Collection Pipeline

**Goal:** A standalone script/tool that captures labeled training data via webcam — static poses for 24 letters, and motion sequences for J and Z.

Tasks:
- `ml/collect_static.py`: OpenCV webcam loop + MediaPipe Hands.
  - CLI/prompt: user specifies target letter (A–I, K–Y — i.e. all 24 static letters).
  - On capture trigger (keypress), auto-record N frames (e.g., 200) of landmarks for that letter with a short countdown so the user can hold the pose.
  - Each captured frame → one labeled row in `ml/data/static_landmarks.csv`: label, x0,y0,z0, ..., x20,y20,z20.
  - Skip frames where MediaPipe confidence is below a threshold or no hand is detected.
- `ml/collect_motion.py`: separate capture mode for J and Z.
  - CLI/prompt: user specifies target letter (J or Z), then performs the full motion on a countdown/record cue (~1–1.5s window).
  - Record the full sequence of landmark frames for that window (not just one frame) — expect a variable number of frames per take.
  - Resample every take to a fixed length (e.g., 20 frames) via simple interpolation so sequences are comparable length regardless of how fast someone signs.
  - Also capture a handful of negative examples: sequences where the hand is moving but not signing J or Z (e.g., repositioning, other letters, idle drift) — the motion classifier needs to learn to reject these, not just distinguish J from Z.
  - Save each take as a row (or small file) in `ml/data/motion_sequences/` — label, resampled frame sequence, source (J / Z / negative).

**Acceptance criteria:** `static_landmarks.csv` has correctly labeled rows for all 24 static letters (150–300 samples/letter minimum) with no malformed/missing-hand entries. The motion dataset has multiple takes each of J, Z, and negative examples (aim for 40–60 takes per class minimum — small dataset is fine here since the motion classifier is simple, but it must include real negatives).

### Phase 2 — Feature Engineering & Model Training

**Goal:** Two trained, evaluated, exported classifiers — static-letter and motion-letter — plus a documented comparison of raw vs. engineered features for the static model.

Tasks — static classifier (24 letters):
- `ml/features_static.py`: given 21 raw landmarks, compute engineered features:
  - pairwise fingertip distances
  - joint angles
  - finger extension values (bent vs. straight)
  - wrist-to-fingertip vectors
  - position-normalize (translate/scale so hand position/size in frame doesn't matter)
- `ml/train_static.py`:
  - Load static_landmarks.csv, generate both a raw-coordinate feature set and an engineered feature set.
  - Train 4 classifiers on each feature set: Random Forest, SVM, Gradient Boosting, Logistic Regression.
  - Evaluate: accuracy, precision, recall, F1, confusion matrix, k-fold cross-validation.
  - Hyperparameter tune the top 1–2 performers with GridSearchCV.
  - Produce a results table: model × feature-set × metrics.
  - Export the best model with Joblib to `ml/models/static_model.pkl`.

Tasks — motion classifier (J / Z / reject):
- `ml/features_motion.py`: given a resampled fixed-length landmark sequence, compute trajectory-level features (this stays classical ML, not deep learning — summary statistics over the sequence, not raw frame-by-frame input):
  - net displacement vector (start point → end point) of the fingertip/hand centroid
  - path length and curvature (how much the path bends — separates J's hook shape from Z's straight zigzag)
  - number of direction reversals along the path
  - bounding box shape of the motion (aspect ratio of the movement's extent)
  - starting handshape features (reuse the static feature engineering on the sequence's first frame) — this is what lets the classifier tell "about to sign J" from "about to sign D," which share a similar base handshape
- `ml/train_motion.py`:
  - Train a classifier (Random Forest or SVM — pick whichever cross-validates better, no need to sweep all 4 here) on 3 classes: J, Z, reject.
  - Evaluate the same way: accuracy, precision/recall per class (pay particular attention to reject-class recall — false-triggering into J/Z from ordinary hand movement is the main failure mode to guard against).
  - Export with Joblib to `ml/models/motion_model.pkl`.

**Acceptance criteria:** `ml/results/comparison.md` shows the raw-vs-engineered feature comparison and 4-model comparison for the static classifier. A separate results file shows the motion classifier's 3-class performance, with reject-class recall called out explicitly. Both .pkl files exist and load without error. Log the winning static model + feature set, and the winning motion model, as entries in DECISIONS.md — Phases 3/4 load these models by name/path and need to know which won and why.

### Phase 3 — Standalone Real-Time Inference Loop (No Web Yet)

**Goal:** Prove the full CV→ML pipeline works live, in a plain OpenCV window, before adding any backend/frontend complexity — including the static/motion merge.

Tasks:
- `ml/live_demo.py`: webcam → MediaPipe → maintain a rolling buffer of the last ~20 frames of landmarks every frame.
- Static path: every frame, run static feature engineering + static_model.pkl → per-frame prediction. Apply temporal smoothing: sliding window of last N predictions, majority vote, only "commit" a letter once stable for ~500ms.
- Motion path: every frame, check the gate condition — does the current handshape resemble J or Z's starting pose, AND has hand centroid displacement over the buffer exceeded a movement threshold? If both, treat this as a motion segment: once the hand's velocity drops back below threshold (motion has stopped) or the buffer window completes, run motion feature engineering + motion_model.pkl on the buffered trajectory. If it scores J or Z, commit that letter and clear the buffer. If it scores reject, discard and continue.
- Draw the current prediction (from whichever path fired) and confidence on the OpenCV window. Print committed letters to console.
- Precedence rule: while a motion gate is active (hand mid-motion, handshape matched the trigger pose), suppress static per-frame commits so a J or Z in progress doesn't also spam static letter guesses mid-motion.

**Acceptance criteria:** You can sign any of the 26 letters, including J and Z, at your webcam and watch stable, correct predictions appear in the console in real time — static letters smoothed as before, J/Z committed once as a single event at the end of the motion, with jitter and false-triggering (ordinary hand movement misread as J/Z) visibly under control. Do not proceed to Phase 4 until this works well — everything after this just relocates this same logic into a server.

### Phase 4 — Backend: FastAPI + WebSocket Prediction Service

**Goal:** The Phase 3 logic, served over a WebSocket instead of a local OpenCV window.

Tasks:
- `backend/app/main.py`: FastAPI app.
- `backend/app/prediction.py`: module wrapping both model loads (static + motion) and the full buffering/gating/smoothing logic from Phase 3 (reuse, don't rewrite — this module owns the rolling landmark buffer per connected client).
- WebSocket endpoint `/ws/predict`: frontend sends frames (or landmarks, if landmark extraction moves client-side — decide and document which), backend returns:
  ```json
  {"prediction": "A", "confidence": 0.97, "source": "static", "fps": 28, "timestamp": 1723452345}
  ```
  Include `"source": "static" | "motion"` so the frontend can optionally show a different indicator while a motion letter is mid-gesture vs. committed.
- REST endpoints for non-realtime concerns:
  - `GET /health`
  - `GET /models` — currently loaded model info (both static and motion model versions/metrics)
  - `GET /metrics` — the Phase 2 evaluation results for both classifiers, served as JSON
- Keep this as one FastAPI app with clean internal modules (prediction.py, later transcript.py, race.py) — not separate microservices/containers.

**Acceptance criteria:** A WebSocket client (even a simple test script) connecting to `/ws/predict` and streaming webcam frames receives correct, smoothed prediction events for all 26 letters, matching Phase 3's behavior — each client's rolling buffer stays isolated from other connections. Log the frames-vs-landmarks WebSocket payload decision in DECISIONS.md — Phase 5's webcam capture component needs to match whichever side this landed on.

### Phase 5 — Frontend Shared Shell, Theme & Animation Foundation

**Goal:** The common UI scaffold both modes plug into — and the visual identity (underwater/squid theme, MonkeyType-style minimalism, animation system) established once here so Phases 6/7 just consume it, rather than each mode reinventing its own look.

Tasks — layout & core UI:
- Webcam capture component (browser getUserMedia) streaming frames to the backend WebSocket.
- Hand-landmark skeleton overlay rendered on the video feed.
- Shared layout: left pane = webcam + skeleton overlay, right pane = mode-specific content (this is where Train vs. Race will differ).
- Top-level nav/toggle between "Train" and "Race" modes.
- Global UI: FPS display, current prediction + confidence, dark mode toggle. Keep these small/unobtrusive (corner readouts, not a dashboard header) — MonkeyType's stat bar is minimal by design, match that.

Tasks — theme:
- Tailwind theme config: deep blue/teal gradient palette for the background (dark by default, matching MonkeyType's dark-first aesthetic), a small accent color for correct/active states, and a distinct error color for misreads — keep the palette to a handful of colors, not a full "ocean" illustration.
- Subtle background treatment: a slow, low-opacity bubble-particle drift or gentle gradient shift behind the content — should read as "atmosphere," not be something the eye tracks while signing.
- Squid mascot: design/commission (or hand-build) a simple, cartoonish squid character used at specific moments only — landing/loading screen, empty states (e.g. "no history yet"), and Race results/celebration. Not present as a persistent on-screen element during active Train or Race sessions, where focus needs to stay on the letters.

Tasks — animation system:
- Install Framer Motion; establish a small set of reusable transition primitives (page/route transition, panel enter/exit, button press feedback) with consistent spring easing, used everywhere rather than one-off animations per component.
- Page load: brief, smooth entrance animation (fade/slide combo, not a splash screen that delays usability).
- Mode switch (Train ↔ Race): the right pane transitions smoothly rather than hard-cutting — content crossfades/slides while the left pane (webcam) stays stable and uninterrupted.
- Letter-commit micro-animation: when a letter lands in the transcript (Train) or advances a word (Race), a small, fast animation (e.g. a subtle pop/settle) gives feedback without being distracting at speed — this needs to stay snappy even during a fast Race run, so keep durations short (~150–200ms).
- Mascot idle animation via Lottie where the mascot appears, kept lightweight so it doesn't add webcam-loop latency.

**Acceptance criteria:** Live webcam feed renders with skeleton overlay and real-time prediction/confidence/FPS displayed, sourced from the Phase 4 WebSocket. Mode toggle exists and transitions smoothly even with both panes still placeholder content. The theme (palette, background treatment, mascot) and the animation primitives (page load, mode switch, letter-commit) are in place and reused by Phases 6/7 rather than rebuilt per mode.

### Phase 6 — Mode A: Train

**Goal:** Right pane becomes a live, editable transcript for open-ended practice/communication.

Tasks:
- `backend/app/transcript.py`: transcript builder consuming the committed-letter stream — dedupe repeats, insert characters, manage current sentence state.
- Gesture commands: the app needs three control gestures — delete last character, insert space, and clear entire transcript — but which specific hand poses map to which action is TBD, decided once you're in the data-collection phase and can see which poses are visually distinct enough from the 26 letter signs to avoid classifier confusion. Build the implementation generically so any gesture can be swapped in later without touching the logic:
  - Low-stakes actions (delete last char, insert space): whichever gesture is chosen, it fires immediately on detection, no confirmation needed — worst case a misfire costs one character or an extra space.
  - Clear entire transcript is destructive, so its trigger gesture must require a sustained hold (~1 second), not a single-frame detection, regardless of which pose is ultimately chosen. Show a brief visual fill/countdown indicator while the hold is in progress so the user can see it's about to trigger and bail out if it's a misfire.
  - Structure the gesture-to-action mapping as a simple config (e.g., a dict/enum in transcript.py) rather than hardcoding poses inline, so the final gesture choices from Phase 1/2 data collection are a one-line change, not a refactor.
  - Always show an on-screen "Clear" button too — never make the destructive action gesture-only. The button is the reliable fallback if the hold-gesture doesn't land or isn't trained yet.
- Transcript panel behavior: auto-scrolling text area (like a chat log), not a fixed box — letters keep appending and the view scrolls to keep the newest text visible, rather than the pane "filling up." Clearing is something the user chooses (button or the held clear-gesture), not something forced by running out of space.
- Frontend: chat-style scrolling transcript panel at the bottom of the right pane, controls for clear/delete/save/download transcript.
- History storage in this phase: local component state only (in-memory or a simple in-browser store), no backend REST endpoints needed here — Phase 8 replaces this with direct Supabase client calls from the frontend, not a backend proxy. Don't build /history REST endpoints on the FastAPI backend; that layer isn't part of this architecture (see Phase 8's note).

**Acceptance criteria:** Signing a full word/short sentence produces a correct running transcript in the UI that auto-scrolls as it grows. The delete and space gestures (whichever poses are ultimately chosen) work instantly; the clear-transcript gesture requires a visible ~1s hold before triggering; the on-screen Clear button always works regardless of gesture reliability or whether the clear-gesture's model has been trained yet. Log the final gesture-to-action mapping in DECISIONS.md — Phase 7's data collection (if it needs a start gesture later) and the README's controls section both depend on this.

### Phase 7 — Mode B: Race (the differentiator)

**Goal:** Right pane becomes a timed fingerspelling speed/accuracy test, modeled directly on MonkeyType's flow.

Tasks:
- Pre-race screen: duration selector — 15s / 30s / 60s (buttons, one selected at a time), plus a "start" button (a start gesture can be added later once control gestures are finalized in Phase 1/2 — don't gate this on gesture choices).
- `backend/app/race.py`:
  - Maintain a queue of target words (start with a static curated list of common short words — swap for a Supabase-backed list in Phase 8).
  - As the countdown runs, compare the live committed-letter stream against the current target word in real time; on a full correct match, advance to the next word in the queue.
  - Track per race: total correct letters signed, total attempted (including corrections), start/end timestamps of the race window.
  - On timer expiry, compute and return:
    - Signs Per Minute (SPM) = correct letters signed / elapsed minutes
    - accuracy = correct letters / total letters attempted
    - consistency = variance in per-letter latency across the race
- Frontend, during the race:
  - Word stream displayed MonkeyType-style: current word highlighted, upcoming words visible ahead, completed letters within the current word visually marked off as they're signed correctly.
  - Live countdown timer, live running SPM estimate.
  - No manual "clear" needed here — an incorrect letter just doesn't advance the word (this mode doesn't accumulate a transcript to clear; it's inherently self-resetting each race).
- Results screen at timer expiry: final SPM, accuracy, consistency, and a "try again" action that returns to the duration-selector screen. This is the mascot's other moment to appear (see Phase 5) — a brief squid celebration animation on a strong result is a nice, low-cost payoff, but keep it quick and skippable so it doesn't slow down someone trying to immediately re-race.
- Personal-best tracking per duration bucket (separate best for 15s/30s/60s, same as typing-test sites): store locally (localStorage-equivalent state, or stubbed) until Phase 8 wires it to a real account.

**Acceptance criteria:** Selecting a duration and starting a race shows the MonkeyType-style word stream, counts down accurately, advances words only on correct completion, and produces a results screen with correct SPM/accuracy/consistency numbers at time expiry — using the same prediction engine as Train mode, with no duplicated CV/ML code.

### Phase 8 — Auth & Persistence (Supabase)

**Goal:** Optional Google login; signed-in users get saved history and Race results across sessions.

**Architecture note:** the frontend talks to Supabase directly via its JS client library for auth, history, and leaderboard reads/writes — Row-Level Security (not the FastAPI backend) is what enforces "users only see their own data." The FastAPI backend stays scoped to the ML/WebSocket prediction engine and never proxies Supabase CRUD calls; that's a needless extra layer. This also means Phase 6's stubbed history endpoints get replaced here, not extended — see the note in Phase 6.

**Step 1 — Human setup (an agent cannot do this part; do it yourself before starting Step 2):**
- Go to supabase.com → sign up (GitHub login is fine, free tier, no card) → "New project" → pick a name, set a database password (save it somewhere), pick a region → wait ~2 min for provisioning.
- In the project dashboard: Settings → API → copy the Project URL and anon/public key. These go in `frontend/.env` (safe to expose client-side; RLS is what actually protects data, not key secrecy).
- For Google login specifically: go to console.cloud.google.com → create a project → OAuth consent screen (External, Testing mode is fine at portfolio scale, no verification needed) → Credentials → "Create OAuth client ID" (type: Web application) → add the redirect URI Supabase gives you (Authentication → Providers → Google in the Supabase dashboard shows the exact callback URL, formatted like `https://<project-ref>.supabase.co/auth/v1/callback`) → copy the resulting Client ID/Secret back into Supabase's Google provider settings and toggle it on.

**Step 2 — Agent-buildable tasks (once Step 1's keys exist in .env):**
- frontend: install `@supabase/supabase-js`, initialize a Supabase client from the env vars.
- Schema (`database/schema.sql` — write this as a SQL file the human runs once via the Supabase dashboard's SQL editor, or via the Supabase CLI if you set that up):
  - `sessions` (id, user_id, start_time, end_time)
  - `translations` (id, session_id, sentence, created_at)
  - `race_results` (id, user_id, word, spm, accuracy, created_at)
  - `models` / `experiments` (id, version, algorithm, hyperparameters, accuracy/precision/recall/f1, created_at) — this is where your Phase 2 comparison results get persisted for real, not just a markdown file. This table isn't user-specific — seed it once from Phase 2's results, doesn't need to happen at runtime.
  - Row-Level Security policies on every user-facing table: `auth.uid() = user_id` for reads/writes, plus an explicit public-read policy on `race_results` only if you're building the leaderboard.
- Frontend: Supabase Auth Google login button (`supabase.auth.signInWithOAuth({ provider: 'google' })`); app works fully anonymous if not logged in (no forced auth) — anonymous users just don't get history persistence.
- Replace Phase 6/7's stubbed local-state history/personal-best storage with direct Supabase client reads/writes, gated by whether a session exists.
- Optional: public Race leaderboard (top SPM scores, split by 15s/30s/60s duration buckets), which doubles as a demonstrable RLS + query skill.

**Acceptance criteria:** Logging in with Google persists a translation session and a Race result; logging out and back in retrieves them; anonymous use still functions without errors; confirm in the Supabase dashboard's table editor that RLS is actually enabled on every table (it's opt-in per table — easy to forget and accidentally leave a table fully public).

### Phase 9 — Containerization

**Goal:** `docker-compose up` runs the whole stack locally.

**Step 1 — Human setup:** Install Docker Desktop (or Docker Engine + Compose plugin on Linux) — this is a one-time local install, nothing an agent can do on your machine. Confirm `docker --version` and `docker compose version` both work before starting Step 2.

**Step 2 — Agent-buildable tasks:**
- `docker/Dockerfile.backend`: Python base image (match the version used in Phase 0's venv) → copy `backend/` and `ml/` (the backend needs to load the .pkl models Phase 2 produced) → `pip install -r requirements.txt` → expose the FastAPI port → run via uvicorn.
- `docker/Dockerfile.frontend`: Node base image → copy `frontend/` → `npm install` → `npm run build` → serve the built static output (a lightweight static server, or Vite's preview mode — pick one and document the choice in DECISIONS.md).
- `docker-compose.yml` at the repo root, referencing both Dockerfiles:
  - backend service: build from `docker/Dockerfile.backend`, expose its port, mount `ml/models/` as a volume so retrained models don't require an image rebuild, load env vars from `backend/.env` (Supabase keys aren't needed here per the Phase 8 architecture, but any backend-specific config goes here).
  - frontend service: build from `docker/Dockerfile.frontend`, expose its port, load env vars from `frontend/.env` (this does need the Supabase URL/anon key baked in at build time, since Vite env vars are build-time not runtime — document that in DECISIONS.md since it affects how rebuilds work).
- No database service needed — Supabase is fully hosted, nothing local to run for it.
- No Nginx container needed at this scale — Compose's internal networking (services reach each other by service name) is sufficient; only add a reverse proxy if you're deliberately practicing that skill, not because this setup needs it.
- `.env.example` files in both `frontend/` and `backend/` listing every required variable with placeholder values (not real keys) — this is what tells a human (or a future agent session) exactly what secrets need to exist before `docker-compose up` will actually work.

**Acceptance criteria:** Fresh clone + populating real .env files from .env.example + `docker-compose up` gets both frontend and backend running and able to talk to each other, no manual steps beyond that .env setup.

### Phase 10 — CI/CD & Deployment

**Goal:** A real, live, linkable URL — kept small and sustainable, not a heavyweight AWS stack.

Tasks:
- Keep the GitHub repo public so Actions minutes are unlimited/free.
- GitHub Actions: build/test on push, and on merge to main, deploy.
- Backend → Render free web service (containerized FastAPI app). Use Fly.io only if you're fine putting a card on file for its free allowance; otherwise Render, no card needed.
- Frontend → Vercel free Hobby plan.
- Supabase is already hosted on its free tier — nothing to deploy there, and no card required.
- No custom domain — use the free subdomains Render/Vercel provide.
- Document AWS architecture (EC2/ECR/S3/RDS/CloudWatch) as a written stretch-goal diagram in the README. Do not actually deploy to AWS — free tier expires/has gaps and risks real charges, which conflicts with the $0 budget for this project.

**Acceptance criteria:** A public URL exists on entirely free infrastructure (no payment method required anywhere except optionally Fly.io), works end-to-end (webcam permission → live prediction → both modes functional), and redeploys automatically on merge to main. Confirm no service in the final stack has a paid plan silently required at the traffic/storage levels this project will realistically hit. Log the final Render-vs-Fly.io choice and the live URL in DECISIONS.md — Phase 11's README links directly to it.

### Phase 11 — Polish & Documentation

**Goal:** The artifact that actually gets read in an interview process.

Tasks:
- README: project pitch (lead with the honest fingerspelling framing), architecture diagram, the raw-vs-engineered feature comparison table for the static model, the 4-model comparison table, the motion classifier's 3-class results (call out reject-class recall), setup instructions, demo GIF/video of both modes including a J or Z sign in action, and a demo GIF/clip showing the theme and animation in motion (screenshots alone undersell it).
- Animation/theme pass: check every transition established in Phase 5 (page load, mode switch, letter-commit, mascot moments) actually feels consistent and isn't jarring at Race-mode speed — this is easy to skip and it's the part that makes the project feel "done" rather than "functional."
- Short "Design Decisions" README section: synthesize DECISIONS.md into readable prose — why one shared engine, why a separate motion classifier for J/Z instead of forcing everything through one static model, why smoothing window of X ms, why these classifiers won, why the final gesture mapping, why Supabase over custom auth, why fingerspelling scope (not full ASL) — interviewers ask "why," and having it pre-written is worth more than the code itself in some conversations. DECISIONS.md itself can also just be linked/kept in the repo as supporting detail.
- "Future Work" section listing the stretch goals below, so scope discipline reads as intentional, not incomplete.

**Acceptance criteria:** A stranger can read the README top to bottom and understand what the project is, why it's structured this way, and how to run it, without opening any code.

### Legitimate Stretch Goals (only after Phase 11)

- Drill mode — a third, genuinely distinct mode: app prompts one letter at a time, waits for a correct sign, gives right/wrong feedback, no timer. Built for someone learning the alphabet from zero, unlike Train (open-ended) or Race (timed). Cheap to add since it reuses the existing prediction engine — just a new frontend view and a simple prompt/grade loop.
- MLflow experiment tracking — highest resume value for the ML-comparison work you already did in Phase 2.
- PyTorch comparison branch — classical ML vs. neural net on the same landmark data (could be a natural extension of the motion classifier specifically, since sequence models are where deep learning tends to actually outperform classical ML).
- Two-handed signs (e.g., letters/words requiring both hands) — a real extension beyond the single-hand scope this plan assumes throughout.
- ONNX export for inference speed.
- AWS deployment, built out for real, using the Phase 10 write-up as the spec — only if you're deliberately opting into possible cost and set up billing alerts; this is the one item on this whole plan that isn't guaranteed free, so treat it as genuinely optional.

### Explicitly Out of Scope (don't build these)

- Separate microservice containers per backend concern.
- Custom-rolled password auth.
- Nginx reverse proxy for local dev.
- A public API for third-party consumption — no audience for it, pure scope with no payoff.
