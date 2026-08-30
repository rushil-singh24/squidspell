# SquidSpell Phase 5 — Frontend Shared Shell, Theme & Animation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The shared UI scaffold both modes plug into — a live webcam pane with in-browser MediaPipe hand tracking + skeleton overlay, a `/ws/predict` client feeding a corner prediction/confidence/FPS readout, a Train/Race nav toggle with smooth pane transitions, the underwater/MonkeyType theme, and a small set of reusable Framer Motion primitives — built once here for Phases 6/7.

**Architecture:** Vite + React 19 + TS + Tailwind v4 SPA. Hand-landmark extraction runs client-side (`@mediapipe/tasks-vision`, `HandLandmarker` VIDEO mode) and streams `[[x,y,z]×21]` frames over a WebSocket to the Phase 4 backend, which returns one prediction event per frame. All non-visual logic (WS client, landmark-loop FPS/normalise helpers, theme hook, skeleton draw fn) is unit-tested with Vitest; the visual/animation/webcam-permission surface is a later human pass. Components stay small and single-purpose under `src/components/`, `src/motion/`, `src/hooks/`, `src/lib/`.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind v4 (`@tailwindcss/vite`), `framer-motion` 11, `@mediapipe/tasks-vision` 0.10.x, `oxlint`, Vitest 2 + `@testing-library/react` 16 + `jsdom`. Backend: Phase 4 FastAPI at `http://localhost:8000`.

**Spec:** `docs/superpowers/specs/2026-08-08-squidspell-full-phases.md` → "Phase 5"; direction from `docs/superpowers/specs/2026-08-08-squidspell-design.md`; the `/ws/predict` message schema in `DECISIONS.md [Phase 4]`.

## Global Constraints

- **Work in `frontend/`.** `cd frontend`. `node_modules/` is already installed; Node pinned via `.nvmrc` (22.19.0) + `engines`.
- **Gate for every task:** `cd frontend && npm run lint && npm test && npm run build` all pass. `npm test` = `vitest run` (added in Task 1). `npm run build` = `tsc -b && vite build` — a type error or a failed build fails the task.
- **TDD with Vitest.** Each task writes the failing test first, runs it red, implements, runs it green, then the full gate. Presentational-only components (pure JSX, no branching logic) may be covered by a render smoke test rather than behavioural TDD — the task says which.
- **Toolchain already chosen (`[Phase 0]` DECISIONS):** Tailwind v4 via `@tailwindcss/vite` (theme lives in `src/index.css` `@theme`, NOT a `tailwind.config.js`); `oxlint` not ESLint (`npm run lint`). Do not add a PostCSS config, do not switch linters.
- **Landmark shape is the contract with Phase 4:** a frame is `number[][]` — exactly 21 entries of exactly `[x, y, z]`, in MediaPipe's 21-landmark index order, each coord image-normalised 0..1 (x,y) / relative (z), exactly as `HandLandmarker` returns them. `null` = no hand this frame. The backend rejects anything else.
- **Outbound WS frame:** `{ "landmarks": number[][] | null, "t": <Date.now()> }`. **Inbound event** (one per frame), consumed as-is: `{ prediction: string|null, confidence: number, source: "static"|"motion"|null, static_label: string|null, static_confidence: number, motion_active: boolean, fps: number, timestamp: number, client_timestamp: number|null }`. A message with an `error` key is a validation reply — surface it, keep the socket open.
- **Config via Vite env:** `VITE_WS_URL` (default `ws://localhost:8000/ws/predict`), `VITE_API_URL` (default `http://localhost:8000`). Read through one `src/lib/config.ts`, never `import.meta.env` scattered. Backend CORS already allows `http://localhost:5173`, so no Vite dev proxy.
- **MediaPipe assets are served locally, not from a CDN.** `scripts/copy-mediapipe.mjs` (dependency-free Node) copies `node_modules/@mediapipe/tasks-vision/wasm/*` → `public/mediapipe/` and `../ml/models/hand_landmarker.task` → `public/models/hand_landmarker.task`. It runs via `predev` / `prebuild` / `pretest` npm hooks. `public/mediapipe/` and `public/models/` are gitignored (regenerable).
- **Accessibility / motion:** every animation checks `useReducedMotion()` (framer-motion) and degrades to an instant state; the bubble background is removed entirely under `prefers-reduced-motion`.
- **Dark-first.** Theme defaults to dark; the toggle flips to a minimal light palette. Persist choice in `localStorage["squidspell-theme"]`; reflect as `data-theme` on `<html>`.
- **No backend calls block first paint.** The shell renders (webcam prompt, theme, nav) even if `:8000` is down; the WS client retries with backoff and the readout shows a connection state.
- **Commit per task**, message `Phase 5: <what>`. Auto-push to `origin/main` after each reviewed task is pre-approved for `rushil-singh24/squidspell`.
- **Sweep Phase 0 leftovers** (Task 1): delete `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`, the default `frontend/README.md`; fix `index.html` `<title>` to `SquidSpell` and `package.json` `"name"` to `squidspell-frontend`.

## Theme tokens (Task 2 — exact values, `src/index.css`)

Dark (`:root`): `--sq-bg-deep:#04141f; --sq-bg:#072634; --sq-surface:#0c2c3d; --sq-surface-raised:#123c50; --sq-border:#1c4e64; --sq-text:#e8f6f3; --sq-text-muted:#86adb6; --sq-accent:#35e0c7; --sq-accent-dim:#1f9d8c; --sq-error:#ff6b6b; --sq-error-dim:#c94f4f;`
Light (`:root[data-theme="light"]`): `--sq-bg-deep:#dceb ed... ` see Task 2 for the full light block. Page background is a top-to-bottom gradient `--sq-bg-deep` → `--sq-bg`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `frontend/package.json` | Modify | Add deps (`framer-motion`, `@mediapipe/tasks-vision`) + devDeps (`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`); `test` / `predev` / `prebuild` / `pretest` scripts; `name`. |
| `frontend/vitest.config.ts` | Create | jsdom env, setup file, `globals: true`. |
| `frontend/vitest.setup.ts` | Create | `@testing-library/jest-dom`; stub `matchMedia`, `ResizeObserver`. |
| `frontend/scripts/copy-mediapipe.mjs` | Create | Copy WASM + `.task` into `public/` (dependency-free). |
| `frontend/.env.example` | Create | `VITE_WS_URL`, `VITE_API_URL`. |
| `frontend/.gitignore` | Modify | add `public/mediapipe/`, `public/models/`. |
| `frontend/src/lib/config.ts` | Create | `WS_URL`, `API_URL` resolved from env with defaults. |
| `frontend/src/index.css` | Modify | `@theme` tokens + base/gradient/reduced-motion styles. |
| `frontend/src/hooks/useTheme.ts` | Create | dark-first theme state, localStorage, `data-theme`. |
| `frontend/src/components/ThemeToggle.tsx` | Create | small corner button. |
| `frontend/src/motion/index.ts` | Create | `spring`, `fadeSlide`, `crossfade`, `commitPop`, `pressable` variant/transition objects. |
| `frontend/src/motion/PageTransition.tsx` | Create | wraps children in the page fade/slide, reduced-motion aware. |
| `frontend/src/motion/PanelSwap.tsx` | Create | `AnimatePresence` crossfade keyed by a prop. |
| `frontend/src/motion/CommitPop.tsx` | Create | ~180ms spring pop on `key` change. |
| `frontend/src/lib/predictionClient.ts` | Create | `PredictionClient` class: connect/backoff-reconnect, `send(landmarks)`, `onFrame` / `onStatus` / `onError` callbacks, `close()`. |
| `frontend/src/hooks/usePrediction.ts` | Create | React wrapper: returns `{ status, lastEvent, lastError, sendLandmarks }`. |
| `frontend/src/lib/landmarks.ts` | Create | pure helpers: `computeFps(times)`, `HAND_CONNECTIONS`, `drawSkeleton(ctx, landmarks, w, h, color)`. |
| `frontend/src/hooks/useHandLandmarker.ts` | Create | getUserMedia + `HandLandmarker.detectForVideo` rAF loop; `{ videoRef, landmarks, fps, status, error }`. |
| `frontend/src/components/SkeletonOverlay.tsx` | Create | `<canvas>` that draws `drawSkeleton` on each `landmarks` change. |
| `frontend/src/components/WebcamPane.tsx` | Create | `<video>` + `SkeletonOverlay` + corner readouts (FPS, prediction+confidence, connection dot). |
| `frontend/src/components/SquidMascot.tsx` | Create | hand-built SVG, `mood: "idle"|"celebrate"|"sleeping"`, idle bob. |
| `frontend/src/components/BubbleField.tsx` | Create | CSS-animated drifting bubbles, `pointer-events-none`, hidden under reduced-motion. |
| `frontend/src/components/ModeToggle.tsx` | Create | Train / Race segmented control. |
| `frontend/src/components/AppShell.tsx` | Create | two-pane layout, nav, `PanelSwap` right pane, page-load animation, wires `useHandLandmarker` + `usePrediction`. |
| `frontend/src/modes/TrainPanePlaceholder.tsx` | Create | placeholder consumed/replaced in Phase 6. |
| `frontend/src/modes/RacePanePlaceholder.tsx` | Create | placeholder consumed/replaced in Phase 7. |
| `frontend/src/App.tsx` | Modify | render `<PageTransition><AppShell/></PageTransition>` + `<BubbleField/>`. |
| `frontend/src/types.ts` | Create | `PredictionEvent`, `ConnectionStatus`, `Mode` types — shared. |
| `DECISIONS.md` | Modify | `[Phase 5]` entries. |
| `HANDOFF.md` | Modify | status → Phase 5 done, Phase 6 next. |
| `frontend/README.md` | Create (replace default) | run/build/test, env, MediaPipe assets, what's stubbed for Phase 6/7. |

---

## Task 1: Tooling — test runner, deps, MediaPipe asset copy, scaffold sweep

**Files:** Modify `frontend/package.json`, `frontend/.gitignore`, `frontend/index.html`. Create `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`, `frontend/scripts/copy-mediapipe.mjs`, `frontend/.env.example`, `frontend/src/lib/config.ts`, `frontend/src/lib/config.test.ts`. Delete `frontend/src/assets/hero.png`, `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg`, `frontend/public/icons.svg`, `frontend/README.md` (recreated in Task 9).

**Interfaces produced:** `npm test` (vitest), `npm run build` still green; `src/lib/config.ts` exports `WS_URL: string`, `API_URL: string`.

- [ ] **Step 1: deps + scripts.** In `frontend/package.json`: set `"name": "squidspell-frontend"`. Add to `dependencies`: `"framer-motion": "^11.11.17"`, `"@mediapipe/tasks-vision": "^0.10.22"`. Add to `devDependencies`: `"vitest": "^2.1.8"`, `"@testing-library/react": "^16.1.0"`, `"@testing-library/jest-dom": "^6.6.3"`, `"@testing-library/user-event": "^14.5.2"`, `"jsdom": "^25.0.1"`. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"copy-mediapipe": "node scripts/copy-mediapipe.mjs"`, `"predev": "npm run copy-mediapipe"`, `"prebuild": "npm run copy-mediapipe"`, `"pretest": "npm run copy-mediapipe"`. Run `cd frontend && npm install`.

- [ ] **Step 2: `scripts/copy-mediapipe.mjs`** (dependency-free):
```js
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = resolve(root, 'public/mediapipe')
const taskSrc = resolve(root, '../ml/models/hand_landmarker.task')
const taskDest = resolve(root, 'public/models/hand_landmarker.task')

mkdirSync(wasmDest, { recursive: true })
cpSync(wasmSrc, wasmDest, { recursive: true })
console.log(`copied MediaPipe wasm -> ${wasmDest}`)

if (existsSync(taskSrc)) {
  mkdirSync(dirname(taskDest), { recursive: true })
  cpSync(taskSrc, taskDest)
  console.log(`copied hand_landmarker.task -> ${taskDest}`)
} else {
  console.warn(`WARN: ${taskSrc} not found — run "python ml/train_static.py" / see ml/README; hand tracking will 404 until it exists`)
}
```

- [ ] **Step 3: `vitest.config.ts`**:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'] },
})
```
`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
}
```
Add `"vitest.setup.ts"`, `"vitest.config.ts"`, `"scripts"` to `tsconfig.node.json`'s `include` if TS complains during `tsc -b`; otherwise leave. `.env.example`:
```
VITE_WS_URL=ws://localhost:8000/ws/predict
VITE_API_URL=http://localhost:8000
```
Append to `frontend/.gitignore`: `public/mediapipe/` and `public/models/`.

- [ ] **Step 4: failing test** `src/lib/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { WS_URL, API_URL } from './config'

describe('config', () => {
  it('falls back to localhost defaults when env is unset', () => {
    expect(WS_URL).toBe('ws://localhost:8000/ws/predict')
    expect(API_URL).toBe('http://localhost:8000')
  })
})
```
Run `cd frontend && npm test` → FAIL (`Cannot find module './config'`).

- [ ] **Step 5: `src/lib/config.ts`**:
```ts
const env = import.meta.env as Record<string, string | undefined>
export const WS_URL = env.VITE_WS_URL ?? 'ws://localhost:8000/ws/predict'
export const API_URL = env.VITE_API_URL ?? 'http://localhost:8000'
```

- [ ] **Step 6: sweep.** Delete the five leftover files listed above. Set `index.html` `<title>SquidSpell</title>`. `src/App.tsx` currently imports nothing from the deleted assets — confirm `grep -rn "hero.png\|react.svg\|vite.svg\|icons.svg" src index.html` is empty after.

- [ ] **Step 7: gate.** `cd frontend && npm run lint && npm test && npm run build` — all pass. `npm run build` triggers `prebuild` → the copy script → `public/mediapipe/` populated, `public/models/hand_landmarker.task` present (the `.task` exists locally at `ml/models/`).

- [ ] **Step 8: commit**
```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/vitest.setup.ts frontend/scripts frontend/.env.example frontend/.gitignore frontend/index.html frontend/src/lib
git rm frontend/src/assets/hero.png frontend/src/assets/react.svg frontend/src/assets/vite.svg frontend/public/icons.svg frontend/README.md
git commit -m "Phase 5: frontend test runner, deps, MediaPipe asset copy, scaffold sweep"
```

---

## Task 2: Theme — tokens, `useTheme`, `ThemeToggle`

**Files:** Modify `frontend/src/index.css`. Create `frontend/src/hooks/useTheme.ts`, `frontend/src/hooks/useTheme.test.ts`, `frontend/src/components/ThemeToggle.tsx`, `frontend/src/components/ThemeToggle.test.tsx`.

**Interfaces produced:** `useTheme() -> { theme: "dark"|"light", toggle: () => void, setTheme: (t) => void }`. CSS custom properties `--sq-*` on `:root` (dark) and `:root[data-theme="light"]`.

- [ ] **Step 1: `src/index.css`** — keep `@import "tailwindcss";` first, then:
```css
@theme {
  --color-bg-deep: #04141f;
  --color-bg: #072634;
  --color-surface: #0c2c3d;
  --color-surface-raised: #123c50;
  --color-border: #1c4e64;
  --color-fg: #e8f6f3;
  --color-fg-muted: #86adb6;
  --color-accent: #35e0c7;
  --color-accent-dim: #1f9d8c;
  --color-error: #ff6b6b;
  --color-error-dim: #c94f4f;
}

:root {
  --sq-bg-deep: #04141f; --sq-bg: #072634; --sq-surface: #0c2c3d;
  --sq-surface-raised: #123c50; --sq-border: #1c4e64;
  --sq-fg: #e8f6f3; --sq-fg-muted: #86adb6;
  --sq-accent: #35e0c7; --sq-accent-dim: #1f9d8c;
  --sq-error: #ff6b6b; --sq-error-dim: #c94f4f;
  color-scheme: dark;
}
:root[data-theme="light"] {
  --sq-bg-deep: #e7f1f2; --sq-bg: #f4fafb; --sq-surface: #ffffff;
  --sq-surface-raised: #eef6f7; --sq-border: #cfe1e4;
  --sq-fg: #0b2733; --sq-fg-muted: #55757e;
  --sq-accent: #0fa392; --sq-accent-dim: #0c7a6e;
  --sq-error: #d64545; --sq-error-dim: #a83535;
  color-scheme: light;
}

html, body, #root { height: 100%; }
body {
  margin: 0;
  background: linear-gradient(180deg, var(--sq-bg-deep), var(--sq-bg));
  color: var(--sq-fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
```
Components use the `--sq-*` vars via inline `style` or arbitrary Tailwind values `bg-[var(--sq-surface)]`. (The `@theme` block also exposes `bg-bg`, `text-fg`, `border-border` etc. utility classes — either is fine; prefer the `--sq-*` vars for anything that must flip with `data-theme`.)

- [ ] **Step 2: failing test** `src/hooks/useTheme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme') })

describe('useTheme', () => {
  it('defaults to dark and sets data-theme', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
  it('toggle flips dark<->light and persists', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem('squidspell-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
  it('reads a persisted choice on init', () => {
    localStorage.setItem('squidspell-theme', 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })
})
```
Run → FAIL (no module).

- [ ] **Step 3: `src/hooks/useTheme.ts`**:
```ts
import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'squidspell-theme'

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* ignore */ }
  return 'dark' // dark-first regardless of prefers-color-scheme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle, setTheme }
}
```

- [ ] **Step 4: `ThemeToggle.tsx`** + render test (`renders a button; click calls toggle` — assert `aria-label` changes or text flips). Component: a small `<button>` with `aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}`, a sun/moon glyph, `onClick={toggle}`, styled with `--sq-*` vars, positioned by the parent (no fixed positioning inside).
```tsx
import { useTheme } from '../hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-full p-2 text-sm leading-none transition-colors"
      style={{ color: 'var(--sq-fg-muted)', background: 'var(--sq-surface)', border: '1px solid var(--sq-border)' }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
```
Note: `useTheme` keeps per-hook state; multiple `ThemeToggle`/consumers won't share a store here. For Phase 5 the toggle is mounted once in `AppShell`; `data-theme` on `<html>` is the shared source of truth for CSS. If Phase 6/7 need multiple live consumers, lift to context then — out of scope now. Document this in the DECISIONS entry.

- [ ] **Step 5: gate + commit** `Phase 5: theme tokens, dark-first useTheme, ThemeToggle`.

---

## Task 3: Motion primitives (`src/motion/`)

**Files:** Create `frontend/src/motion/index.ts`, `frontend/src/motion/index.test.ts`, `frontend/src/motion/PageTransition.tsx`, `frontend/src/motion/PanelSwap.tsx`, `frontend/src/motion/CommitPop.tsx`, and one render test per component.

**Interfaces produced:** `spring` (Transition), `fadeSlide` (Variants: `initial`/`animate`/`exit`), `crossfade` (Variants), `commitPop` (Variants), `pressable` (`whileTap`/`whileHover` props object). `<PageTransition>`, `<PanelSwap swapKey>`, `<CommitPop trigger>` components, all honouring `useReducedMotion()`.

- [ ] **Step 1: failing test** `src/motion/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { spring, fadeSlide, crossfade, commitPop, pressable } from './index'

describe('motion primitives', () => {
  it('spring is a spring transition', () => {
    expect(spring.type).toBe('spring')
    expect(typeof spring.stiffness).toBe('number')
  })
  it('variants expose initial/animate/exit', () => {
    for (const v of [fadeSlide, crossfade, commitPop]) {
      expect(v).toHaveProperty('initial')
      expect(v).toHaveProperty('animate')
      expect(v).toHaveProperty('exit')
    }
  })
  it('commitPop animate scale settles at 1', () => {
    const a = commitPop.animate as { scale: number | number[] }
    const s = Array.isArray(a.scale) ? a.scale[a.scale.length - 1] : a.scale
    expect(s).toBe(1)
  })
  it('pressable has whileTap', () => {
    expect(pressable).toHaveProperty('whileTap')
  })
})
```
Run → FAIL.

- [ ] **Step 2: `src/motion/index.ts`**:
```ts
import type { Transition, Variants } from 'framer-motion'

export const spring: Transition = { type: 'spring', stiffness: 320, damping: 30, mass: 0.9 }
export const quickSpring: Transition = { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 }

export const fadeSlide: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

export const crossfade: Variants = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0, transition: spring },
  exit: { opacity: 0, x: -10, transition: { duration: 0.14 } },
}

export const commitPop: Variants = {
  initial: { scale: 0.7, opacity: 0 },
  animate: { scale: [0.7, 1.12, 1], opacity: 1, transition: { ...quickSpring, duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

export const pressable = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.96 },
  transition: quickSpring,
} as const
```

- [ ] **Step 3: components.**
`PageTransition.tsx`:
```tsx
import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { fadeSlide } from './index'

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <div>{children}</div>
  return (
    <motion.div variants={fadeSlide} initial="initial" animate="animate" style={{ height: '100%' }}>
      {children}
    </motion.div>
  )
}
```
`PanelSwap.tsx`:
```tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { crossfade } from './index'

export function PanelSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <div key={swapKey} style={{ height: '100%' }}>{children}</div>
  return (
    <AnimatePresence mode="wait">
      <motion.div key={swapKey} variants={crossfade} initial="initial" animate="animate" exit="exit" style={{ height: '100%' }}>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```
`CommitPop.tsx`:
```tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { commitPop } from './index'

export function CommitPop({ trigger, children }: { trigger: string | number; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <span>{children}</span>
  return (
    <AnimatePresence mode="popLayout">
      <motion.span key={trigger} variants={commitPop} initial="initial" animate="animate" exit="exit" style={{ display: 'inline-block' }}>
        {children}
      </motion.span>
    </AnimatePresence>
  )
}
```
Each gets a render smoke test: mount with a child, assert the child text is in the document. (`useReducedMotion` returns `false` under jsdom+matchMedia stub, so the `motion.*` path renders — framer-motion works in jsdom.)

- [ ] **Step 4: gate + commit** `Phase 5: Framer Motion primitives (spring config, PageTransition, PanelSwap, CommitPop)`.

---

## Task 4: `PredictionClient` + `usePrediction`

**Files:** Create `frontend/src/types.ts`, `frontend/src/lib/predictionClient.ts`, `frontend/src/lib/predictionClient.test.ts`, `frontend/src/hooks/usePrediction.ts`, `frontend/src/hooks/usePrediction.test.ts`.

**Interfaces produced:**
```ts
// types.ts
export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'
export type Mode = 'train' | 'race'
export interface PredictionEvent {
  prediction: string | null
  confidence: number
  source: 'static' | 'motion' | null
  static_label: string | null
  static_confidence: number
  motion_active: boolean
  fps: number
  timestamp: number
  client_timestamp: number | null
}
```
- `class PredictionClient` — `new PredictionClient(url: string, opts?: { WebSocketCtor?; backoff?: number[] })`; `.connect()`; `.send(landmarks: number[][] | null): void` (no-op unless socket OPEN; wraps as `{landmarks, t: Date.now()}`); `.onFrame(cb: (e: PredictionEvent) => void)`; `.onError(cb: (msg: string) => void)` — fires on a `{error}` message; `.onStatus(cb: (s: ConnectionStatus) => void)`; `.close()` (stops reconnect). Reconnect: on unexpected close, wait `backoff[min(attempt, backoff.length-1)]` ms (default `[500, 1000, 2000, 5000]`) then `connect()` again; reset attempt count on a successful `open`. `.close()` sets an internal `stopped` flag so no further reconnect.
- `usePrediction(url = WS_URL)` → `{ status: ConnectionStatus, lastEvent: PredictionEvent | null, lastError: string | null, sendLandmarks: (l: number[][] | null) => void }`. Creates one `PredictionClient` per mount (`useRef`), connects on mount, `close()` on unmount.

- [ ] **Step 1: failing tests** `src/lib/predictionClient.test.ts` — use a fake WebSocket:
```ts
import { describe, it, expect, vi } from 'vitest'
import { PredictionClient } from './predictionClient'

class FakeWS {
  static OPEN = 1; static CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) { FakeWS.last = this }
  static last: FakeWS | null = null
  send(d: string) { this.sent.push(d) }
  close() { this.readyState = FakeWS.CLOSED; this.onclose?.({ code: 1000 }) }
  _open() { this.readyState = FakeWS.OPEN; this.onopen?.() }
  _msg(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

const evt = {
  prediction: 'A', confidence: 0.9, source: 'static', static_label: 'A',
  static_confidence: 0.9, motion_active: false, fps: 30, timestamp: 1, client_timestamp: null,
}

describe('PredictionClient', () => {
  it('reports status open then delivers frames', () => {
    const frames: unknown[] = []
    const statuses: string[] = []
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.onFrame((e) => frames.push(e)); c.onStatus((s) => statuses.push(s))
    c.connect()
    FakeWS.last!._open()
    FakeWS.last!._msg(evt)
    expect(statuses).toContain('connecting')
    expect(statuses).toContain('open')
    expect(frames).toEqual([evt])
  })
  it('send wraps landmarks with a timestamp only when open', () => {
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.connect()
    c.send([[0, 0, 0]]) // not open yet -> dropped
    FakeWS.last!._open()
    c.send([[1, 2, 3]])
    c.send(null)
    expect(FakeWS.last!.sent).toHaveLength(2)
    const first = JSON.parse(FakeWS.last!.sent[0])
    expect(first.landmarks).toEqual([[1, 2, 3]])
    expect(typeof first.t).toBe('number')
    expect(JSON.parse(FakeWS.last!.sent[1]).landmarks).toBeNull()
  })
  it('routes an {error} message to onError, not onFrame', () => {
    const errs: string[] = []; const frames: unknown[] = []
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.onError((m) => errs.push(m)); c.onFrame((e) => frames.push(e))
    c.connect(); FakeWS.last!._open()
    FakeWS.last!._msg({ error: 'invalid landmarks', timestamp: 2 })
    expect(errs).toEqual(['invalid landmarks'])
    expect(frames).toEqual([])
  })
  it('reconnects after an unexpected close, backing off', () => {
    vi.useFakeTimers()
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never, backoff: [100, 200] })
    c.connect()
    const first = FakeWS.last!
    first._open()
    first.readyState = FakeWS.CLOSED; first.onclose?.({ code: 1006 }) // unexpected
    vi.advanceTimersByTime(100)
    expect(FakeWS.last).not.toBe(first) // a new socket was created
    c.close()
    vi.useRealTimers()
  })
  it('close() stops further reconnects', () => {
    vi.useFakeTimers()
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never, backoff: [100] })
    c.connect(); FakeWS.last!._open()
    c.close()
    const afterClose = FakeWS.last
    afterClose!.onclose?.({ code: 1006 })
    vi.advanceTimersByTime(1000)
    expect(FakeWS.last).toBe(afterClose) // no new socket
    vi.useRealTimers()
  })
})
```
Run → FAIL.

- [ ] **Step 2: `src/lib/predictionClient.ts`**:
```ts
import type { ConnectionStatus, PredictionEvent } from '../types'

type WSCtor = { new (url: string): WebSocket }

export class PredictionClient {
  private ws: WebSocket | null = null
  private stopped = false
  private attempt = 0
  private readonly backoff: number[]
  private readonly WSCtor: WSCtor
  private frameCbs: ((e: PredictionEvent) => void)[] = []
  private errorCbs: ((msg: string) => void)[] = []
  private statusCbs: ((s: ConnectionStatus) => void)[] = []

  constructor(private url: string, opts: { WebSocketCtor?: WSCtor; backoff?: number[] } = {}) {
    this.WSCtor = opts.WebSocketCtor ?? (globalThis.WebSocket as unknown as WSCtor)
    this.backoff = opts.backoff ?? [500, 1000, 2000, 5000]
  }

  onFrame(cb: (e: PredictionEvent) => void) { this.frameCbs.push(cb) }
  onError(cb: (msg: string) => void) { this.errorCbs.push(cb) }
  onStatus(cb: (s: ConnectionStatus) => void) { this.statusCbs.push(cb) }
  private emitStatus(s: ConnectionStatus) { for (const cb of this.statusCbs) cb(s) }

  connect() {
    this.stopped = false
    this.emitStatus('connecting')
    const ws = new this.WSCtor(this.url)
    this.ws = ws
    ws.onopen = () => { this.attempt = 0; this.emitStatus('open') }
    ws.onmessage = (ev: MessageEvent) => {
      let data: unknown
      try { data = JSON.parse(String(ev.data)) } catch { return }
      if (data && typeof data === 'object' && 'error' in data) {
        const msg = String((data as { error: unknown }).error)
        for (const cb of this.errorCbs) cb(msg)
        return
      }
      for (const cb of this.frameCbs) cb(data as PredictionEvent)
    }
    ws.onerror = () => this.emitStatus('error')
    ws.onclose = () => {
      this.emitStatus('closed')
      if (this.stopped) return
      const wait = this.backoff[Math.min(this.attempt, this.backoff.length - 1)]
      this.attempt += 1
      setTimeout(() => { if (!this.stopped) this.connect() }, wait)
    }
  }

  send(landmarks: number[][] | null) {
    const ws = this.ws
    if (!ws || ws.readyState !== 1 /* OPEN */) return
    ws.send(JSON.stringify({ landmarks, t: Date.now() }))
  }

  close() {
    this.stopped = true
    this.ws?.close()
  }
}
```

- [ ] **Step 3: `src/hooks/usePrediction.ts`**:
```ts
import { useEffect, useRef, useState } from 'react'
import { PredictionClient } from '../lib/predictionClient'
import { WS_URL } from '../lib/config'
import type { ConnectionStatus, PredictionEvent } from '../types'

export function usePrediction(url: string = WS_URL) {
  const clientRef = useRef<PredictionClient | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [lastEvent, setLastEvent] = useState<PredictionEvent | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    const c = new PredictionClient(url)
    clientRef.current = c
    c.onStatus(setStatus)
    c.onFrame(setLastEvent)
    c.onError(setLastError)
    c.connect()
    return () => { c.close(); clientRef.current = null }
  }, [url])

  return {
    status,
    lastEvent,
    lastError,
    sendLandmarks: (l: number[][] | null) => clientRef.current?.send(l),
  }
}
```
`usePrediction.test.ts`: render the hook with a URL, monkeypatch `globalThis.WebSocket` to `FakeWS` before render, assert `status` transitions to `'open'` after `act(() => FakeWS.last._open())` and `lastEvent` updates after `_msg(evt)`.

- [ ] **Step 4: gate + commit** `Phase 5: PredictionClient WebSocket wrapper + usePrediction hook`.

---

## Task 5: Landmark helpers + `useHandLandmarker`

**Files:** Create `frontend/src/lib/landmarks.ts`, `frontend/src/lib/landmarks.test.ts`, `frontend/src/hooks/useHandLandmarker.ts`, `frontend/src/hooks/useHandLandmarker.test.ts`.

**Interfaces produced:**
```ts
// landmarks.ts
export const HAND_CONNECTIONS: [number, number][]  // MediaPipe's 21 canonical bone pairs
export function computeFps(frameTimesMs: number[], now: number, windowMs?: number): number
export function landmarksToArray(result: HandLandmarkerResult): number[][] | null  // first hand -> [[x,y,z]x21] or null
export function drawSkeleton(
  ctx: CanvasRenderingContext2D, landmarks: number[][] | null,
  width: number, height: number, color: string,
): void
```
- `computeFps`: keep only times within `windowMs` (default 1000) of `now`; return `0` if fewer than 2, else `round((count - 1) / ((now - oldest) / 1000))`.
- `useHandLandmarker()` → `{ videoRef: RefObject<HTMLVideoElement>, landmarks: number[][] | null, fps: number, status: 'idle'|'loading'|'ready'|'denied'|'error', error: string | null }`. On mount: dynamically `import('@mediapipe/tasks-vision')`, `FilesetResolver.forVisionTasks('/mediapipe')`, `HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/hand_landmarker.task' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.7, minTrackingConfidence: 0.5 })`; `navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })` → attach to `videoRef.current`; `requestAnimationFrame` loop calling `detectForVideo(video, performance.now())` → `landmarksToArray` → `setLandmarks` + push time to an fps ring. `getUserMedia` rejection with `NotAllowedError` → `status='denied'`. Cleanup: cancel rAF, stop tracks, `landmarker.close()`.

- [ ] **Step 1: failing tests** `src/lib/landmarks.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { HAND_CONNECTIONS, computeFps, landmarksToArray, drawSkeleton } from './landmarks'

describe('landmarks helpers', () => {
  it('HAND_CONNECTIONS is 21 bones covering all fingers', () => {
    expect(HAND_CONNECTIONS.length).toBeGreaterThanOrEqual(20)
    for (const [a, b] of HAND_CONNECTIONS) { expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(21) }
  })
  it('computeFps returns 0 for <2 samples and a rate otherwise', () => {
    expect(computeFps([], 1000)).toBe(0)
    expect(computeFps([1000], 1000)).toBe(0)
    expect(computeFps([0, 100, 200, 300, 400], 400)).toBe(10) // 4 gaps over 0.4s
  })
  it('computeFps drops samples outside the window', () => {
    expect(computeFps([0, 5000, 5100, 5200], 5200, 1000)).toBe(round => round) // placeholder; see impl note
  })
  it('landmarksToArray flattens the first hand or returns null', () => {
    expect(landmarksToArray({ landmarks: [] } as never)).toBeNull()
    const one = { landmarks: [Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: i / 21, z: 0 }))] }
    const out = landmarksToArray(one as never)!
    expect(out).toHaveLength(21)
    expect(out[5]).toEqual([5 / 21, 5 / 21, 0])
  })
  it('drawSkeleton is a no-op for null and draws for real landmarks', () => {
    const calls: string[] = []
    const ctx = new Proxy({}, { get: (_t, p) => (typeof p === 'string' && p.endsWith('Style')) ? '' : () => calls.push(String(p)) }) as unknown as CanvasRenderingContext2D
    drawSkeleton(ctx, null, 100, 100, '#fff')
    expect(calls).toEqual([])
    drawSkeleton(ctx, Array.from({ length: 21 }, () => [0.5, 0.5, 0]), 100, 100, '#fff')
    expect(calls).toContain('beginPath')
    expect(calls).toContain('stroke')
  })
})
```
(Fix the third test's placeholder to `expect(computeFps([0, 5000, 5100, 5200], 5200, 1000)).toBe(20)` — 3 samples in-window over 0.2s = 2 gaps / 0.1s? recompute in impl: in-window = `[5000,5100,5200]`, gaps=2, span=0.2s → `round(2/0.2)=10`. Assert `10`.)
Run → FAIL.

- [ ] **Step 2: `src/lib/landmarks.ts`** — implement per the interface. `HAND_CONNECTIONS` = the standard MediaPipe list: palm `[0,1],[0,5],[0,17],[5,9],[9,13],[13,17]`, thumb `[1,2],[2,3],[3,4]`, index `[5,6],[6,7],[7,8]`, middle `[9,10],[10,11],[11,12]`, ring `[13,14],[14,15],[15,16]`, pinky `[17,18],[18,19],[19,20]`. `drawSkeleton`: `ctx.clearRect(0,0,width,height)` first is the CALLER's job — here just: return immediately if `landmarks` is null; set `strokeStyle`/`fillStyle`=color, `lineWidth=2`; for each `[a,b]` in `HAND_CONNECTIONS` `beginPath/moveTo(la.x*width, la.y*height)/lineTo(lb...)/stroke`; then a small `arc` + `fill` per point.

- [ ] **Step 3: `src/hooks/useHandLandmarker.ts`** per the interface. Import `@mediapipe/tasks-vision` **dynamically inside the effect** so tests can mock it and so it doesn't bloat the initial bundle.

- [ ] **Step 4: `useHandLandmarker.test.ts`** — `vi.mock('@mediapipe/tasks-vision', ...)` returning a fake `FilesetResolver.forVisionTasks` and `HandLandmarker.createFromOptions` (whose `.detectForVideo` returns one synthetic hand); stub `navigator.mediaDevices.getUserMedia` to resolve a fake `MediaStream` (`{ getTracks: () => [{ stop: vi.fn() }] }`), and `HTMLVideoElement.prototype.play`. Assert `status` reaches `'ready'` and `landmarks` becomes a `21×3` array after a rAF tick (`vi.stubGlobal('requestAnimationFrame', cb => { cb(0); return 1 })` or advance timers). Also assert a `getUserMedia` reject with `{ name: 'NotAllowedError' }` → `status='denied'`.

- [ ] **Step 5: gate + commit** `Phase 5: landmark helpers (fps, HAND_CONNECTIONS, drawSkeleton) + useHandLandmarker`.

---

## Task 6: `SkeletonOverlay` + `WebcamPane`

**Files:** Create `frontend/src/components/SkeletonOverlay.tsx`, `frontend/src/components/SkeletonOverlay.test.tsx`, `frontend/src/components/WebcamPane.tsx`, `frontend/src/components/WebcamPane.test.tsx`.

**Interfaces produced:**
- `<SkeletonOverlay landmarks={number[][] | null} className? />` — a `<canvas>` sized to its container (via a `ResizeObserver` or 100%/100% + fixed intrinsic 640×480); on every `landmarks` prop change: `ctx.clearRect(...)` then `drawSkeleton(ctx, landmarks, canvas.width, canvas.height, accentColor)`. `accentColor` read from `getComputedStyle(document.documentElement).getPropertyValue('--sq-accent')` (fallback `#35e0c7`).
- `<WebcamPane videoRef={RefObject<HTMLVideoElement>} landmarks fps status event connection />` where `event: PredictionEvent | null`, `connection: ConnectionStatus`. Renders: the `<video>` (muted, playsInline, `object-cover`, mirrored `scaleX(-1)`), `<SkeletonOverlay>` on top (also mirrored), and three corner readouts — top-left FPS (`{fps} fps`), top-right connection dot + label, bottom-left current prediction: if `status !== 'ready'` show a hint ("Allow camera access" when `denied`), else `event?.static_label ?? '–'` with `event?.static_confidence` as a bar, and a `MOTION…` pill when `event?.motion_active`. Readouts are small, `absolute`, `bg-[var(--sq-surface)]/80`, rounded.

- [ ] **Step 1: failing tests.**
`SkeletonOverlay.test.tsx`: mock `../lib/landmarks` so `drawSkeleton` is a `vi.fn()`; render `<SkeletonOverlay landmarks={null} />` then rerender with a `21×3` array; assert `drawSkeleton` was called with the array. (jsdom `getContext('2d')` returns null — have the component guard `if (!ctx) return`; to make the assertion meaningful, mock `HTMLCanvasElement.prototype.getContext` to return a stub object in the test.)
`WebcamPane.test.tsx`: render with `status='denied'` → asserts "Allow camera access" text; render with `status='ready'`, `event={{...static_label:'B', static_confidence:0.8, motion_active:false,...}}`, `fps={27}`, `connection='open'` → asserts `27 fps` and `B` are shown; render with `event.motion_active=true` → asserts `MOTION` pill present.

- [ ] **Step 2: implement** both components per the interface.

- [ ] **Step 3: gate + commit** `Phase 5: SkeletonOverlay canvas + WebcamPane with corner readouts`.

---

## Task 7: `SquidMascot` + `BubbleField`

**Files:** Create `frontend/src/components/SquidMascot.tsx`, `frontend/src/components/SquidMascot.test.tsx`, `frontend/src/components/BubbleField.tsx`, `frontend/src/components/BubbleField.test.tsx`. Add a small `@keyframes sq-rise` + `.sq-bubble` rule to `src/index.css`.

**Interfaces produced:**
- `<SquidMascot mood={'idle'|'celebrate'|'sleeping'} size?={number} className? />` — a hand-built inline `<svg viewBox="0 0 120 120">`: a rounded mantle, two large eyes, ~6 tentacle paths, in `currentColor` / `--sq-accent` accents. `idle` = a slow vertical bob (framer `motion.svg` `animate={{ y: [0, -6, 0] }}` `transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}`); `celebrate` = a quick 2-bounce + slight rotate; `sleeping` = eyes become `M`-shaped closed lids, no bob, tiny "z" text. All animation gated on `!useReducedMotion()`. **Lottie is deferred** (a CC0 Lottie file can later drop in behind this same `mood` interface — logged in DECISIONS).
- `<BubbleField count?={number} />` — a `pointer-events-none absolute inset-0 overflow-hidden` layer of `count` (default 14) `<span className="sq-bubble">` each with randomised `left`, `width/height` (6–18px), `animationDelay`, `animationDuration` (12–26s) inline. Returns `null` when `useReducedMotion()` is true.

`src/index.css` additions:
```css
@keyframes sq-rise {
  0%   { transform: translateY(20vh) scale(0.6); opacity: 0; }
  10%  { opacity: 0.5; }
  90%  { opacity: 0.4; }
  100% { transform: translateY(-110vh) scale(1); opacity: 0; }
}
.sq-bubble {
  position: absolute; bottom: -5vh; border-radius: 9999px;
  background: radial-gradient(circle at 30% 30%, rgba(53,224,199,0.35), rgba(53,224,199,0.05));
  animation: sq-rise linear infinite;
}
```

- [ ] **Step 1: failing tests.**
`SquidMascot.test.tsx`: render `<SquidMascot mood="idle" />` → an `<svg>` is in the document with `role="img"` and an `aria-label` containing "squid"; render `mood="sleeping"` → `aria-label` mentions "sleeping"/"asleep".
`BubbleField.test.tsx`: render `<BubbleField count={5} />` → 5 elements with class `sq-bubble`. Then `vi.mock('framer-motion', ...)` (or stub `matchMedia` to `matches:true` for the reduced-motion query) and assert it renders `null`.

- [ ] **Step 2: implement.** Give `<svg>` `role="img"` and a mood-dependent `aria-label` (`"squid mascot, idle"` / `"...celebrating"` / `"squid mascot, asleep"`).

- [ ] **Step 3: gate + commit** `Phase 5: SquidMascot SVG (idle/celebrate/sleeping) + BubbleField background`.

---

## Task 8: `ModeToggle` + `AppShell` + placeholder panes + `App`

**Files:** Create `frontend/src/components/ModeToggle.tsx`, `frontend/src/components/ModeToggle.test.tsx`, `frontend/src/components/AppShell.tsx`, `frontend/src/components/AppShell.test.tsx`, `frontend/src/modes/TrainPanePlaceholder.tsx`, `frontend/src/modes/RacePanePlaceholder.tsx`. Modify `frontend/src/App.tsx`.

**Interfaces produced:**
- `<ModeToggle mode={Mode} onChange={(m: Mode) => void} />` — a two-button segmented control (`role="tablist"`, each `role="tab"` `aria-selected`), `pressable` motion, active pill uses `--sq-accent`.
- `<AppShell />` — owns `useState<Mode>('train')`, calls `useHandLandmarker()` and `usePrediction()`, and on every `landmarks` change calls `sendLandmarks(landmarks)` (via `useEffect([landmarks])`). Layout: full-height flex; **left** = `WebcamPane` (fed `videoRef`, `landmarks`, `fps`, `status` from the landmark hook and `event=lastEvent`, `connection=status` from the prediction hook); **right** = a column with `ModeToggle` at top and, below, `<PanelSwap swapKey={mode}>` rendering `TrainPanePlaceholder` or `RacePanePlaceholder`; `ThemeToggle` pinned top-right of the whole shell. On `lastError` show a dismissible toast (`role="alert"`).
- `TrainPanePlaceholder` / `RacePanePlaceholder` — centered `SquidMascot` (`idle`) + a one-line “Train mode — coming in Phase 6” / “Race mode — coming in Phase 7”. Exported so Phases 6/7 replace the import in `AppShell`, not the shell itself.
- `App.tsx`:
```tsx
import { PageTransition } from './motion/PageTransition'
import { AppShell } from './components/AppShell'
import { BubbleField } from './components/BubbleField'

export default function App() {
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <BubbleField />
      <PageTransition><AppShell /></PageTransition>
    </div>
  )
}
```

- [ ] **Step 1: failing tests.**
`ModeToggle.test.tsx`: render with `mode="train"`, click the Race tab → `onChange('race')` called; the Train tab has `aria-selected="true"` before the click.
`AppShell.test.tsx`: `vi.mock('../hooks/useHandLandmarker', ...)` → `{ videoRef: { current: null }, landmarks: null, fps: 0, status: 'loading', error: null }`; `vi.mock('../hooks/usePrediction', ...)` → `{ status: 'connecting', lastEvent: null, lastError: null, sendLandmarks: vi.fn() }`. Assert: both a Train and a Race tab render; the Train placeholder text is shown initially; clicking Race swaps to the Race placeholder text (`findByText`). Then set the `usePrediction` mock's `lastError` to `'boom'` and assert a `role="alert"` with "boom" appears.
A second `AppShell` test: give `useHandLandmarker` mock a non-null `landmarks` and assert the `usePrediction` mock's `sendLandmarks` was called with it (drive via `rerender` with a new landmarks value).

- [ ] **Step 2: implement** all six files.

- [ ] **Step 3: gate + commit** `Phase 5: ModeToggle + AppShell two-pane layout wiring landmark + prediction pipelines`.

---

## Task 9: Docs — `DECISIONS.md`, `HANDOFF.md`, `frontend/README.md`

**Files:** Modify `DECISIONS.md`, `HANDOFF.md`. Create `frontend/README.md`.

- [ ] **Step 1: `DECISIONS.md` `[Phase 5]` entries** (match the file's `## [Phase N] <title>` / `Decided:` / `Why:` / `Affects:` format):
  1. **Client-side MediaPipe, assets served locally.** `@mediapipe/tasks-vision` `HandLandmarker` VIDEO mode runs in-browser; WASM + `hand_landmarker.task` are copied into `frontend/public/` by `scripts/copy-mediapipe.mjs` (`predev`/`prebuild`/`pretest` hooks), not loaded from a CDN. Confidence params mirror the Python side (0.7 detect / 0.5 track). Affects: Phase 9 Docker frontend image must run the copy script during build; `public/mediapipe` + `public/models` are gitignored.
  2. **Frontend test stack = Vitest + Testing Library + jsdom**; the gate is `npm run lint && npm test && npm run build`. Visual / animation / real-webcam behaviour is a human pass, not automated. Affects: Phases 6/7 add their tests the same way.
  3. **`usePrediction` owns one `PredictionClient` per mount**, reconnect with backoff `[500,1000,2000,5000]` ms; one WS message sent per landmark frame as `{landmarks, t}`; the inbound event is consumed field-for-field. Affects: Phases 6/7 read `lastEvent` from the same hook — no second socket.
  4. **`useTheme` is per-hook state, not a context**; `data-theme` on `<html>` is the shared source of truth for CSS. `ThemeToggle` is mounted once in `AppShell`. If a later phase needs multiple live theme consumers, lift to context then.
  5. **Lottie deferred.** The squid mascot is a hand-built inline SVG with Framer-Motion idle/celebrate/sleeping animation behind a `mood` prop; a CC0 Lottie can replace the internals later without touching consumers. (The design spec lists Lottie; this defers it to Phase 11 polish to avoid a fragile hand-authored JSON now.)
  6. **No Vite dev proxy.** Backend CORS already allows `http://localhost:5173`; REST goes direct via `VITE_API_URL`, WS via `VITE_WS_URL` (both resolved once in `src/lib/config.ts`).

- [ ] **Step 2: `HANDOFF.md`** — update `**Last updated:**` and status: Phase 5 complete — `frontend/` shell renders the webcam pane with in-browser MediaPipe skeleton overlay, a `/ws/predict`-fed corner readout, Train/Race nav with `PanelSwap` transitions, the underwater theme + `useTheme` toggle, Framer Motion primitives, squid mascot, bubble background; `cd frontend && npm run lint && npm test && npm run build` all green; Train/Race panes are exported placeholders for Phases 6/7 to replace. Run: `cd frontend && npm run dev` (needs the Phase 4 backend on `:8000` for live predictions; the shell renders without it). **Two human passes still owed:** the Phase 3 `python ml/live_demo.py` webcam verification, and a Phase 5 visual/animation/allow-camera look. Set **Phase 6 (Mode A: Train)** as next. Preserve the push-policy note and the per-phase human-needed list; update the Phase 5 bullet to "code done; one visual + camera-permission pass owed".

- [ ] **Step 3: `frontend/README.md`** — replace the default Vite readme: what it is; prerequisites (`npm install`; the Phase 4 backend running on `:8000` for live predictions; `ml/models/hand_landmarker.task` present so the copy script can stage it); `npm run dev` / `npm run build` / `npm test` / `npm run lint`; the `VITE_WS_URL` / `VITE_API_URL` env vars (`.env.example`); a note that `public/mediapipe/` + `public/models/` are generated by `scripts/copy-mediapipe.mjs` and gitignored; what is stubbed (`src/modes/*Placeholder.tsx` → Phases 6/7); and that hand-landmark extraction is entirely client-side.

- [ ] **Step 4: gate + commit** `Phase 5: docs — DECISIONS [Phase 5], handoff, frontend README`.

---

## Final whole-branch review

After all nine tasks pass their individual reviews, run one whole-branch review of the full Phase 5 diff (`git diff <phase-5-base>..HEAD`) on the most capable available model. Focus: (a) the WS reconnect state machine — no leaked sockets or timers across `usePrediction` unmount, `close()` truly stops reconnect, no reconnect storm on a backend that's down; (b) the rAF landmark loop in `useHandLandmarker` — cancelled on unmount, tracks stopped, `landmarker.close()` called, no `setState`-after-unmount; (c) `sendLandmarks` wiring in `AppShell` fires exactly once per frame and doesn't re-subscribe every render; (d) the `@mediapipe/tasks-vision` dynamic import doesn't break `vite build` (tree-shaking / worker assets) — confirm `npm run build` output has no unresolved import warnings; (e) reduced-motion paths actually bypass every animation; (f) no `import.meta.env` outside `config.ts`; (g) type safety — `tsc -b` clean, no `as never`/`any` beyond the test doubles. Bundle findings into one fix wave + a scoped re-review.

---

## Self-Review (plan author)

**1. Spec coverage:**

| Phase 5 spec item | Task |
|---|---|
| Webcam capture component streaming frames to the backend WS | Task 5 (`useHandLandmarker`) + Task 4 (`PredictionClient`) + Task 8 (`AppShell` wires `sendLandmarks(landmarks)`) |
| Hand-landmark skeleton overlay on the feed | Task 5 (`drawSkeleton`) + Task 6 (`SkeletonOverlay`, `WebcamPane`) |
| Shared layout: left webcam pane, right mode-specific pane | Task 8 (`AppShell`) |
| Top-level Train/Race nav toggle | Task 8 (`ModeToggle`) |
| Global UI: FPS, current prediction + confidence, dark-mode toggle, small/corner | Task 6 (`WebcamPane` readouts) + Task 2 (`ThemeToggle`) |
| Tailwind theme: deep blue/teal gradient, dark-first, accent + error colours, small palette | Task 2 (`@theme` + `--sq-*` tokens, gradient body) |
| Subtle bubble-particle / gradient background | Task 7 (`BubbleField`) |
| Squid mascot for landing/loading/empty/results only, not during active signing | Task 7 (`SquidMascot`); Task 8 uses it only in the placeholder panes, never in `WebcamPane` |
| Framer Motion install + reusable primitives (page/panel/button) with consistent spring | Task 3 (`src/motion/`) |
| Page-load entrance animation | Task 3 (`PageTransition`) + Task 8 (`App` wraps `AppShell`) |
| Mode switch: right pane transitions, left pane stays stable | Task 8 (`PanelSwap` wraps only the right pane) |
| Letter-commit micro-animation, ~150–200ms, stays snappy | Task 3 (`CommitPop`, 180ms `quickSpring`) — consumed by Phases 6/7 |
| Mascot idle animation via Lottie, lightweight | Task 7 + DECISIONS entry 5 (Lottie deferred; SVG+Framer idle bob now, same interface) |
| Acceptance: live feed + skeleton + prediction/confidence/FPS from the Phase 4 WS; mode toggle transitions smoothly; theme + primitives reused by 6/7 | Tasks 5/6/8 (pipeline) + Task 3 (primitives) + Task 8 (toggle). True "live feed" verification is the human camera pass, noted in Task 9 / HANDOFF. |

No gaps. Two items are explicitly human-verified (live webcam feed, visual polish) — flagged in Task 9 and HANDOFF, consistent with the spec's own "visual/animation polish benefits from a human actually looking at it".

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases" in steps. One test in Task 5 Step 1 carries a deliberately-wrong `.toBe(round => round)` placeholder line with an inline correction directly under it (`assert 10`) — the implementer applies the corrected assertion. All component code either given in full or specified field-by-field with exact props, and every task's tests are concrete.

**3. Type/name consistency:** `PredictionEvent` field names match `DECISIONS.md [Phase 4]`'s outbound schema exactly (`static_label`, `static_confidence`, `motion_active`, `client_timestamp`, …). `PredictionClient` method names (`connect`/`send`/`onFrame`/`onError`/`onStatus`/`close`) are identical in Task 4's definition, its tests, and `usePrediction`. `usePrediction` return keys (`status`, `lastEvent`, `lastError`, `sendLandmarks`) match between Task 4 and Task 8's `AppShell`. `useHandLandmarker` return keys (`videoRef`, `landmarks`, `fps`, `status`, `error`) match between Task 5 and Task 6 (`WebcamPane` props) and Task 8. `Mode` (`'train'|'race'`) consistent across `types.ts`, `ModeToggle`, `AppShell`. `drawSkeleton` signature identical in Task 5 (`landmarks.ts`) and Task 6 (`SkeletonOverlay`). `--sq-*` token names identical between Task 2's CSS and every component's inline `style`.
