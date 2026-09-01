# Phase 8 — Auth & Persistence (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Optional Google login via Supabase; signed-in users get Train history and Race results/bests persisted across sessions and devices. Anonymous use keeps working with the existing `localStorage` stores.

**Architecture:** Frontend talks to Supabase directly via `@supabase/supabase-js` for auth + CRUD. Row-Level Security (`auth.uid() = user_id`) enforces per-user isolation — the FastAPI backend is NOT involved and never proxies Supabase calls. A thin storage-adapter module per feature routes to Supabase when a user is signed in and to `localStorage` when not, so both `TrainPane` and `RacePane` have one call site each.

**Tech Stack:** React 19 + TS 6 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, strict, `noUnusedLocals/Parameters`), Vite 8, Vitest 4 + @testing-library/react 16 + jsdom, `@supabase/supabase-js` v2.

**Spec:** docs/superpowers/specs/2026-08-08-squidspell-full-phases.md  (Phase 8 section)

## Global Constraints

- TS: no parameter properties, no enums, no namespaces; type-only imports must be `import type`; `"vitest/globals"` stays in `tsconfig.app.json` `compilerOptions.types`.
- `usePrediction` is a plain hook, not a context — `AppShell` owns the single instance and prop-drills. `useAuth` follows the SAME pattern: one instance in `AppShell`, `user` prop-drilled into `TrainPane`/`RacePane`.
- App works fully anonymous — no forced auth, no route guards. A missing/!configured Supabase env must not crash the app; `isSupabaseConfigured` gates all Supabase code paths and the login button.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (already in `frontend/.env`; the value is a `sb_publishable_...` key, which `createClient` accepts in the anon-key position).
- New deps: `@supabase/supabase-js` only.
- `oxlint` (not eslint) + `npm run build` (tsc) + `npm test` must all be green before each task commits.
- Existing `localStorage` keys stay exactly as-is for the anon path: `squidspell-train-history`, `squidspell-race-bests`.

---

### Task 1: Supabase client module + database schema

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/lib/supabase.test.ts`
- Create: `database/schema.sql`
- Modify: `frontend/package.json` (add `@supabase/supabase-js` dependency via `npm install`)

**Interfaces:**
- Produces: `export const supabase: SupabaseClient | null` (null when env unset), `export const isSupabaseConfigured: boolean`.

- [ ] Step 1: `npm install @supabase/supabase-js` in `frontend/`.
- [ ] Step 2: Write `frontend/src/lib/supabase.ts`:
  - Read `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  - `isSupabaseConfigured` = both are non-empty strings.
  - `supabase` = `isSupabaseConfigured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null`.
- [ ] Step 3: Write `frontend/src/lib/supabase.test.ts` — with both env vars stubbed via `vi.stubEnv`, `isSupabaseConfigured` is true and `supabase` is non-null; document that a full unset test needs module re-import (acceptable to assert only the configured branch here, or use `vi.resetModules()` + dynamic `import()` for the unset branch).
- [ ] Step 4: Write `database/schema.sql` — a single idempotent script the human runs once in the Supabase SQL editor:
  - `create table if not exists public.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, start_time timestamptz not null default now(), end_time timestamptz)`
  - `create table if not exists public.translations (id uuid primary key default gen_random_uuid(), session_id uuid references public.sessions on delete cascade, user_id uuid not null references auth.users on delete cascade, sentence text not null, created_at timestamptz not null default now())`
  - `create table if not exists public.race_results (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, duration_s int not null, spm real not null, accuracy real, consistency real, created_at timestamptz not null default now())`
  - `create table if not exists public.models (id uuid primary key default gen_random_uuid(), version text not null, kind text not null, algorithm text not null, feature_set text, hyperparameters jsonb, accuracy real, precision real, recall real, f1 real, created_at timestamptz not null default now())`
  - `alter table ... enable row level security` on all four.
  - Policies: on `sessions`, `translations`, `race_results` — `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`. On `models` — `for select using (true)` (public read; no write policy = no client writes).
  - Seed `models` with the two Phase 2 winners (from `DECISIONS.md [Phase 2]` / `ml/results/`): static random_forest engineered (test_accuracy 0.994) and motion random_forest (test_accuracy 0.893, recall notes in a comment). Use `insert ... select ... where not exists` so re-running is safe.
- [ ] Step 5: `cd frontend && npm test && npm run build && npx oxlint src` — all green.
- [ ] Step 6: Commit: `feat(phase8): supabase client module + database schema`.

---

### Task 2: useAuth hook + AuthControl, wired into AppShell

**Files:**
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/hooks/useAuth.test.tsx`
- Create: `frontend/src/components/AuthControl.tsx`
- Create: `frontend/src/components/AuthControl.test.tsx`
- Modify: `frontend/src/components/AppShell.tsx` (add `const auth = useAuth()`, render `<AuthControl {...auth} />` in the header)

**Interfaces:**
- Consumes: `supabase`, `isSupabaseConfigured` from Task 1.
- Produces: `useAuth(): { user: { id: string; email: string | null; name: string | null; avatarUrl: string | null } | null; loading: boolean; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void> }`. Export the `AuthUser` type.

- [ ] Step 1: Write `useAuth.test.tsx` first (mock `../lib/supabase`): (a) when `isSupabaseConfigured` false, `user` is null, `loading` false, `signInWithGoogle` is a no-op that doesn't throw; (b) with a mocked client returning a session from `getSession`, `user` is populated after effect; (c) `onAuthStateChange` callback updates `user` on SIGNED_IN / SIGNED_OUT; (d) unmount calls the subscription's `unsubscribe`.
- [ ] Step 2: Implement `useAuth.ts`:
  - If `!isSupabaseConfigured`: return the inert shape (null user, loading false, async no-op fns).
  - Else: `useState` for user + loading; `useEffect` calls `supabase.auth.getSession()` then subscribes via `supabase.auth.onAuthStateChange`; map `session.user` → `AuthUser` (`user_metadata.full_name` / `.name` → name, `.avatar_url` → avatarUrl, `.email` → email); cleanup `subscription.unsubscribe()`.
  - `signInWithGoogle` = `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.
  - `signOut` = `supabase.auth.signOut()`.
- [ ] Step 3: Write `AuthControl.test.tsx`: renders nothing when `!isSupabaseConfigured` (import guard) OR — simpler — parent decides; instead assert: no user → a "Sign in with Google" button that calls `signInWithGoogle` on click; with user → shows name/email + "Sign out" button that calls `signOut`; `loading` → renders a neutral placeholder (no crash).
- [ ] Step 4: Implement `AuthControl.tsx` — presentational, props = the `useAuth()` return. Small button styled with the existing CSS-var palette (`var(--sq-fg)` etc., see `HoldButton.tsx`). Hide entirely when `isSupabaseConfigured` is false (import it).
- [ ] Step 5: Wire into `AppShell.tsx` — `const auth = useAuth()` alongside the existing `usePrediction()`; render `<AuthControl user={auth.user} loading={auth.loading} signInWithGoogle={auth.signInWithGoogle} signOut={auth.signOut} />` in the header area. Keep the single-instance rule.
- [ ] Step 6: `npm test && npm run build && npx oxlint src` green.
- [ ] Step 7: Commit: `feat(phase8): useAuth hook + AuthControl in header`.

---

### Task 3: Train history storage adapter + TrainPane integration

**Files:**
- Create: `frontend/src/lib/trainHistory.ts`
- Create: `frontend/src/lib/trainHistory.test.ts`
- Modify: `frontend/src/modes/TrainPane.tsx` (replace inline `loadHistory` / `persist` `localStorage` calls with adapter calls; accept `userId: string | null` prop)
- Modify: `frontend/src/components/AppShell.tsx` (pass `userId={auth.user?.id ?? null}` to `TrainPane`)

**Interfaces:**
- Consumes: `supabase` (Task 1), `AuthUser.id` (Task 2).
- Produces: `type TrainEntry = { id: string; text: string; savedAt: number }`; `loadTrainHistory(userId: string | null): Promise<TrainEntry[]>`; `saveTrainSentence(userId: string | null, text: string): Promise<TrainEntry[]>` (returns the new full list); `deleteTrainSentence(userId: string | null, id: string): Promise<TrainEntry[]>`.

- [ ] Step 1: Write `trainHistory.test.ts` first: with `userId === null`, all three functions round-trip through `localStorage['squidspell-train-history']` and preserve the existing shape-validation behaviour (malformed JSON → `[]`). With a `userId` and a mocked `supabase` (`from('translations').select/insert/delete` chains), the functions hit Supabase and map rows (`{ id, sentence, created_at }` → `{ id, text, savedAt: Date.parse(created_at) }`), newest-first.
- [ ] Step 2: Implement `trainHistory.ts`. Anon branch = the current `TrainPane` logic moved verbatim (keep the `filter` type-guard). Signed-in branch: `select('id,sentence,created_at').eq('user_id', userId).order('created_at', { ascending: false })`; insert `{ user_id, sentence: text }`; delete `.eq('id', id)`. On any Supabase error, `console.warn` and fall back to returning the anon-store contents so the UI never hard-fails.
- [ ] Step 3: Refactor `TrainPane.tsx`: add `userId: string | null` to its props type; replace `useState<Saved[]>(loadHistory)` with `useState<TrainEntry[]>([])` + a `useEffect([userId])` that calls `loadTrainHistory(userId)`; `onSave` / delete call the async adapter then set state from the resolved list. Remove the local `Saved` type + `loadHistory` + `HISTORY_KEY` (now in the adapter). Keep all rendering/scroll/`CommitPop` behaviour identical.
- [ ] Step 4: Update `AppShell.tsx` to pass `userId`.
- [ ] Step 5: Update `TrainPane.test.tsx` for the new async prop-driven shape (mock the adapter module).
- [ ] Step 6: `npm test && npm run build && npx oxlint src` green.
- [ ] Step 7: Commit: `feat(phase8): persist Train history to Supabase when signed in`.

---

### Task 4: Race results storage adapter + RacePane integration

**Files:**
- Create: `frontend/src/lib/raceStore.ts`
- Create: `frontend/src/lib/raceStore.test.ts`
- Modify: `frontend/src/modes/RacePane.tsx` (replace inline `loadBests` / `localStorage.setItem` with adapter; accept `userId: string | null` prop)
- Modify: `frontend/src/components/AppShell.tsx` (pass `userId` to `RacePane`)

**Interfaces:**
- Consumes: `supabase` (Task 1), `AuthUser.id` (Task 2), `RaceResults` from `../types`.
- Produces: `type Bests = Record<number, number>`; `loadBests(userId: string | null): Promise<Bests>`; `recordRaceResult(userId: string | null, r: { duration_s: number; spm: number; accuracy: number | null; consistency: number | null }): Promise<Bests>` (inserts a `race_results` row when signed in; always updates + returns the bests map, persisting the anon map to `localStorage` when `userId` is null).

- [ ] Step 1: Write `raceStore.test.ts` first: anon path round-trips `squidspell-race-bests` and keeps the existing numeric-value validation. Signed-in path: `recordRaceResult` calls `supabase.from('race_results').insert({ user_id, duration_s, spm, accuracy, consistency })`; `loadBests` runs `select('duration_s,spm').eq('user_id', userId)` and reduces to a max-spm-per-duration map. Supabase error → `console.warn` + fall back to the anon map.
- [ ] Step 2: Implement `raceStore.ts` (anon logic moved verbatim from `RacePane`, including the `loadBests` validation).
- [ ] Step 3: Refactor `RacePane.tsx`: add `userId: string | null` prop; `useState<Bests>({})` + `useEffect([userId])` → `loadBests`; in the existing `race.phase === 'finished'` effect, call `recordRaceResult(userId, { duration_s: selectedDuration, spm: r.spm, accuracy: r.accuracy, consistency: r.consistency })` and set `bests` from its result (drop the direct `localStorage.setItem`). Remove local `Bests` type + `loadBests` + `BESTS_KEY`. Keep celebrate/dismiss/dropped-race behaviour identical.
- [ ] Step 4: Update `AppShell.tsx` to pass `userId`; update `RacePane.test.tsx` + `AppShell.socket.test.tsx` if the added prop breaks render (provide `userId={null}`).
- [ ] Step 5: `npm test && npm run build && npx oxlint src` green.
- [ ] Step 6: Commit: `feat(phase8): persist Race results + bests to Supabase when signed in`.

---

### Task 5: Docs + HANDOFF update

**Files:**
- Modify: `DECISIONS.md` (append `[Phase 8]` entry)
- Modify: `HANDOFF.md` (mark Phase 8 code complete; note remaining human steps: run `database/schema.sql`, finish Google OAuth client, then the login→persist→logout→login acceptance test)
- Modify: `README.md` if it has a phase checklist

- [ ] Step 1: `DECISIONS.md` `[Phase 8]` — record: frontend-direct-to-Supabase (backend uncoupled), RLS as the isolation mechanism, storage-adapter pattern with `localStorage` anon fallback, env var names + publishable-key note, `models` table seeded from Phase 2.
- [ ] Step 2: `HANDOFF.md` — Phase 8 code done; human TODO: (a) run `database/schema.sql` in Supabase SQL editor, (b) complete Google Cloud OAuth Web client + enable Google provider, (c) acceptance test.
- [ ] Step 3: Commit: `docs(phase8): record decisions + handoff status`.
