import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HoldButton } from './HoldButton'

let rafCbs: FrameRequestCallback[] = []
let nowMs = 0

beforeEach(() => {
  rafCbs = []
  nowMs = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCbs.push(cb)
    return rafCbs.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function flush(ms: number) {
  nowMs += ms
  const cbs = rafCbs
  rafCbs = []
  cbs.forEach((cb) => cb(nowMs))
}

describe('HoldButton', () => {
  it('takes its accessible name from children', () => {
    render(<HoldButton onHoldComplete={() => {}}>Clear (hold)</HoldButton>)
    expect(
      screen.getByRole('button', { name: 'Clear (hold)' }),
    ).toBeInTheDocument()
  })

  it('fires onHoldComplete exactly once after a full hold', () => {
    const onHoldComplete = vi.fn()
    render(<HoldButton onHoldComplete={onHoldComplete}>Clear (hold)</HoldButton>)
    fireEvent.pointerDown(screen.getByRole('button'))
    flush(1100)
    flush(1100)
    expect(onHoldComplete).toHaveBeenCalledTimes(1)
  })

  it('does not fire when released before completion', () => {
    const onHoldComplete = vi.fn()
    render(<HoldButton onHoldComplete={onHoldComplete}>Clear</HoldButton>)
    const btn = screen.getByRole('button')
    fireEvent.pointerDown(btn)
    flush(400)
    fireEvent.pointerUp(btn)
    flush(1000)
    flush(1000)
    expect(onHoldComplete).not.toHaveBeenCalled()
  })

  it('does not fire when the pointer leaves before completion', () => {
    const onHoldComplete = vi.fn()
    render(<HoldButton onHoldComplete={onHoldComplete}>Clear</HoldButton>)
    const btn = screen.getByRole('button')
    fireEvent.pointerDown(btn)
    flush(400)
    fireEvent.pointerLeave(btn)
    flush(2000)
    expect(onHoldComplete).not.toHaveBeenCalled()
  })

  it('is a no-op when disabled and has the disabled attribute', () => {
    const onHoldComplete = vi.fn()
    render(
      <HoldButton onHoldComplete={onHoldComplete} disabled>
        Clear
      </HoldButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.pointerDown(btn)
    flush(2000)
    flush(2000)
    expect(onHoldComplete).not.toHaveBeenCalled()
  })

  it('is operable via the Space key', () => {
    const onHoldComplete = vi.fn()
    render(<HoldButton onHoldComplete={onHoldComplete}>Clear</HoldButton>)
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    flush(1100)
    expect(onHoldComplete).toHaveBeenCalledTimes(1)
  })

  it('cancels the keyboard hold on keyup before completion', () => {
    const onHoldComplete = vi.fn()
    render(<HoldButton onHoldComplete={onHoldComplete}>Clear</HoldButton>)
    const btn = screen.getByRole('button')
    fireEvent.keyDown(btn, { key: ' ' })
    flush(400)
    fireEvent.keyUp(btn, { key: ' ' })
    flush(1000)
    expect(onHoldComplete).not.toHaveBeenCalled()
  })

  it('does not restart or double-fire on key repeat', () => {
    const onHoldComplete = vi.fn()
    render(<HoldButton onHoldComplete={onHoldComplete}>Clear</HoldButton>)
    const btn = screen.getByRole('button')
    fireEvent.keyDown(btn, { key: ' ' })
    flush(400)
    fireEvent.keyDown(btn, { key: ' ' })
    flush(1100)
    expect(onHoldComplete).toHaveBeenCalledTimes(1)
  })

  it('never fires onHoldComplete after unmount', () => {
    const onHoldComplete = vi.fn()
    const { unmount } = render(
      <HoldButton onHoldComplete={onHoldComplete}>Clear</HoldButton>,
    )
    fireEvent.pointerDown(screen.getByRole('button'))
    flush(400)
    unmount()
    flush(1000)
    flush(1000)
    expect(onHoldComplete).not.toHaveBeenCalled()
  })
})
