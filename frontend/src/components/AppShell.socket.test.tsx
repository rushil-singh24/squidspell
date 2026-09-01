import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RacePane } from '../modes/RacePane'

// Structural guard for the Phase 7 Critical fix: RacePane must be prop-driven
// and must NOT call usePrediction() itself. usePrediction opens its own
// WebSocket in an effect (it is a plain hook, not a context), so a second call
// = a second orphaned socket and a non-functional Race mode.
//
// No usePrediction mock is installed here on purpose. If RacePane still called
// the hook, its effect would run `new WebSocket(...)` — which this counter
// records (and which jsdom would otherwise throw on, since it has no WebSocket).
class CountingWS {
  static count = 0
  constructor() {
    CountingWS.count += 1
  }
  send() {}
  close() {}
}

const realWS = globalThis.WebSocket

beforeEach(() => {
  CountingWS.count = 0
  globalThis.WebSocket = CountingWS as never
})

afterEach(() => {
  globalThis.WebSocket = realWS
})

describe('RacePane socket independence', () => {
  it('renders the pre-race UI from props without opening a WebSocket', () => {
    render(
      <RacePane
        race={null}
        startRace={vi.fn()}
        stopRace={vi.fn()}
        userId={null}
      />,
    )
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(CountingWS.count).toBe(0)
  })
})
