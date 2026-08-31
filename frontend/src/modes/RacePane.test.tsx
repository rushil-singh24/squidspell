import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RacePane } from './RacePane'
import type { RaceSnapshot } from '../types'

const noop = () => {}

beforeEach(() => {
  localStorage.clear()
})

const running: RaceSnapshot = {
  phase: 'running',
  target_word: 'cat',
  typed: 'c',
  upcoming: ['dog'],
  word_index: 0,
  correct_letters: 1,
  attempted_letters: 1,
  seconds_left: 12,
  spm: 24,
  results: null,
}

const finished: RaceSnapshot = {
  phase: 'finished',
  target_word: null,
  typed: '',
  upcoming: [],
  word_index: 0,
  correct_letters: 0,
  attempted_letters: 0,
  seconds_left: 0,
  spm: 0,
  results: { spm: 41.2, accuracy: 0.9, consistency: 78, duration_s: 30 },
}

describe('RacePane', () => {
  it('pre-race: shows the duration control, a Start button, and the idle mascot', () => {
    render(<RacePane race={null} startRace={noop} stopRace={noop} />)
    expect(screen.getByRole('button', { name: '15s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '60s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('starts a race with the selected duration', async () => {
    const user = userEvent.setup()
    const startRace = vi.fn()
    render(<RacePane race={null} startRace={startRace} stopRace={noop} />)
    await user.click(screen.getByRole('button', { name: '15s' }))
    await user.click(screen.getByRole('button', { name: /start/i }))
    expect(startRace).toHaveBeenCalledWith(15)
  })

  it('running: renders the word stream + HUD and a Stop control', async () => {
    const user = userEvent.setup()
    const stopRace = vi.fn()
    render(<RacePane race={running} startRace={noop} stopRace={stopRace} />)
    expect(screen.getByText('c')).toBeInTheDocument()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('t')).toBeInTheDocument()
    expect(screen.getByText('12s left')).toBeInTheDocument()
    expect(screen.getByText('SPM 24')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stop/i }))
    expect(stopRace).toHaveBeenCalled()
  })

  it('finished: shows the results card and records a personal best', () => {
    render(<RacePane race={finished} startRace={noop} stopRace={noop} />)
    expect(screen.getByText('41.2')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('78')).toBeInTheDocument()
    const tryAgain = screen.getByRole('button', { name: /try again/i })
    expect(tryAgain).toBeEnabled()
    expect(
      JSON.parse(localStorage.getItem('squidspell-race-bests') as string)['30'],
    ).toBe(41.2)
  })

  it('finished: renders an em dash when consistency is null', () => {
    const noGaps: RaceSnapshot = {
      ...finished,
      results: { spm: 12, accuracy: 1, consistency: null, duration_s: 15 },
    }
    render(<RacePane race={noGaps} startRace={noop} stopRace={noop} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('tolerates a corrupt bests payload and shows no Best line', () => {
    localStorage.setItem('squidspell-race-bests', '[1,2]')
    expect(() =>
      render(<RacePane race={null} startRace={noop} stopRace={noop} />),
    ).not.toThrow()
    expect(screen.queryByText(/Best:/)).toBeNull()
  })

  it('shows a dropped-connection banner when a running race vanishes without a local Stop', () => {
    const { rerender } = render(
      <RacePane race={running} startRace={noop} stopRace={noop} />,
    )
    rerender(<RacePane race={null} startRace={noop} stopRace={noop} />)
    expect(
      screen.getByText('Connection dropped — race cancelled.'),
    ).toBeInTheDocument()

    rerender(<RacePane race={running} startRace={noop} stopRace={noop} />)
    expect(
      screen.queryByText('Connection dropped — race cancelled.'),
    ).toBeNull()
  })

  it('does NOT show the dropped banner after a deliberate Stop', async () => {
    const user = userEvent.setup()
    const stopRace = vi.fn()
    const { rerender } = render(
      <RacePane race={running} startRace={noop} stopRace={stopRace} />,
    )
    await user.click(screen.getByRole('button', { name: /stop/i }))
    rerender(<RacePane race={null} startRace={noop} stopRace={stopRace} />)
    expect(
      screen.queryByText('Connection dropped — race cancelled.'),
    ).toBeNull()
  })
})
