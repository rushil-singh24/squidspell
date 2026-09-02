# SquidSpell — portfolio / résumé copy

Reusable blurbs and bullets for a portfolio site, résumé, or GitHub profile.
Live: https://squidspell.vercel.app · Repo: https://github.com/rushil-singh24/squidspell

---

## One-liner (card / tagline)

Real-time ASL fingerspelling recognition — webcam → hand landmarks → classifier → live text,
with a MonkeyType-style timed mode and a public leaderboard.

## Short blurb (2–3 sentences, portfolio card)

SquidSpell reads the ASL manual alphabet from a webcam in real time. Hand tracking runs in the
browser (MediaPipe); 21 landmarks per frame stream over a WebSocket to a FastAPI service that
runs two scikit-learn classifiers — one for static letters, one for the motion letters J and Z
— behind a shared, server-authoritative inference engine. It ships two modes off that one
engine: open-ended practice, and a timed speed test with a Supabase-backed leaderboard.

## Longer paragraph (project page)

SquidSpell is a full-stack computer-vision app that recognises ASL fingerspelling from a live
webcam. The CV pipeline runs entirely in the browser via MediaPipe Tasks Vision — no video
leaves the client — and only the 21 hand landmarks per frame are sent to the backend. A
Python/FastAPI service turns those landmarks into engineered features (fingertip distances,
joint angles, finger extension, scale/position normalisation) and classifies them with a
RandomForest for the 24 static letters (99.4% test accuracy) plus a separate gated trajectory
classifier for the motion letters J and Z, including a `reject` class so ordinary hand
movement doesn't false-trigger. The transcript and race scoring are computed server-side so
they can't desync on a reconnect. The React 19 / TypeScript frontend has a practice mode and a
MonkeyType-style timed mode (30/60/90s, live SPM / accuracy / consistency), with an optional
Google sign-in via Supabase that persists history and race results across devices and powers a
public, Row-Level-Security-backed leaderboard. Deployed on Vercel + Render with GitHub Actions
CI; 203 automated tests.

## Résumé bullets

- Built a full-stack real-time computer-vision app that recognises ASL fingerspelling from a
  webcam: in-browser MediaPipe hand tracking streams 21 landmarks/frame over a WebSocket to a
  FastAPI inference service — no video leaves the client.
- Engineered a hand-geometry feature set (pairwise fingertip distances, joint angles,
  finger-extension, scale/position normalisation) and trained/GridSearch-tuned a RandomForest
  reaching **99.4% test accuracy** across 24 static letters, beating raw-landmark baselines on
  every model compared.
- Designed a gated trajectory classifier for the motion letters J and Z with an explicit
  `reject` class, so ordinary hand movement doesn't produce false letters.
- Made the transcript and race scoring **server-authoritative** over WebSockets so client
  refreshes and reconnects can't desync game state.
- Shipped Google OAuth, per-user history, and a public leaderboard on Supabase with
  **Row-Level Security** as the isolation boundary — the API server never proxies DB calls.
- Deployed frontend (Vercel) and backend (Render) with a GitHub Actions CI pipeline;
  **203 automated tests** (58 pytest, 145 Vitest).

## Tech tags

`Python` · `FastAPI` · `WebSockets` · `scikit-learn` · `MediaPipe` · `NumPy` · `Computer Vision`
· `React` · `TypeScript` · `Vite` · `Tailwind` · `Supabase` · `PostgreSQL` · `Row-Level Security`
· `OAuth` · `Vercel` · `Render` · `GitHub Actions`

## GitHub profile README snippet

```markdown
### 🦑 [SquidSpell](https://github.com/rushil-singh24/squidspell) · [live demo](https://squidspell.vercel.app)

Real-time ASL fingerspelling recognition. In-browser MediaPipe hand tracking →
WebSocket → FastAPI + scikit-learn (99.4% on 24 static letters, gated J/Z motion
classifier). Practice mode + a timed speed test with a Supabase RLS-backed
leaderboard. React 19 / TS, deployed on Vercel + Render, 203 tests.
```

## Talking points (interview)

- **Why the server owns the transcript:** an early version tracked it client-side; a dropped
  WebSocket then left the UI and the true state out of sync. Moving commit logic server-side
  made reconnects and refreshes safe by construction.
- **Why RandomForest, not a neural net:** the dataset is small and the features are
  tabular-ish after engineering; RF won every cross-validation comparison and needs no GPU to
  serve. The engineering effort went into the features, not the model.
- **The honest limitation:** the closed-fist letters (T/N/M/A/S) are genuinely hard to tell
  apart from landmarks alone — documented, with a self-contained data-collection + retrain
  runbook in the README.
