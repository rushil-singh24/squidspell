import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RacePane } from './RacePane'
import type { RaceSnapshot } from '../types'
import { loadBests, recordRaceResult } from '../lib/raceStore'
import { loadLeaderboard } from '../lib/leaderboard'

vi.mock('../lib/raceStore', () => ({
  loadBests: vi.fn().mockResolvedValue({}),
  recordRaceResult: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/leaderboard', () => ({
  loadLeaderboard: vi
    .fn()
    .mockResolvedValue({ 30: [], 60: [], 90: [] }),
}))

const noop = () => {}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadBests).mockResolvedValue({})
  vi.mocked(recordRaceResult).mockResolvedValue(null)
  vi.mocked(loadLeaderboard).mockResolvedValue({ 30: [], 60: [], 90: [] })
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
    render(
      <RacePane race={null} userId={null} startRace={noop} stopRace={noop} />,
    )
    expect(screen.getByRole('button', { name: '30s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '60s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '90s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('starts a race with the selected duration', async () => {
    const user = userEvent.setup()
    const startRace = vi.fn()
    render(
      <RacePane
        race={null}
        userId={null}
        startRace={startRace}
        stopRace={noop}
      />,
    )
    await user.click(screen.getByRole('button', { name: '90s' }))
    await user.click(screen.getByRole('button', { name: /start/i }))
    expect(startRace).toHaveBeenCalledWith(90)
  })

  it('running: renders the word stream + HUD and a Stop control', async () => {
    const user = userEvent.setup()
    const stopRace = vi.fn()
    render(
      <RacePane
        race={running}
        userId={null}
        startRace={noop}
        stopRace={stopRace}
      />,
    )
    expect(screen.getByText('c')).toBeInTheDocument()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('t')).toBeInTheDocument()
    expect(screen.getByText('12s left')).toBeInTheDocument()
    expect(screen.getByText('SPM 24')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stop/i }))
    expect(stopRace).toHaveBeenCalled()
  })

  it('finished: shows the results card and records a personal best', async () => {
    vi.mocked(recordRaceResult).mockResolvedValue({ 30: 41.2 })
    render(
      <RacePane
        race={finished}
        userId="user-1"
        startRace={noop}
        stopRace={noop}
      />,
    )
    expect(screen.getByText('41.2')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('78')).toBeInTheDocument()
    const tryAgain = screen.getByRole('button', { name: /try again/i })
    expect(tryAgain).toBeEnabled()
    await waitFor(() =>
      expect(recordRaceResult).toHaveBeenCalledWith('user-1', {
        duration_s: 30,
        spm: 41.2,
        accuracy: 0.9,
        consistency: 78,
      }),
    )
  })

  it('finished: renders an em dash when consistency is null', () => {
    const noGaps: RaceSnapshot = {
      ...finished,
      results: { spm: 12, accuracy: 1, consistency: null, duration_s: 30 },
    }
    render(
      <RacePane race={noGaps} userId={null} startRace={noop} stopRace={noop} />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows no Best line when logged out', async () => {
    render(
      <RacePane race={null} userId={null} startRace={noop} stopRace={noop} />,
    )
    expect(screen.queryByText(/Best:/)).toBeNull()
    // logged out never hits the store
    await waitFor(() => expect(loadBests).toHaveBeenCalledWith(null))
  })

  it('shows the Best line from the store when signed in', async () => {
    vi.mocked(loadBests).mockResolvedValue({ 30: 55 })
    render(
      <RacePane race={null} userId="user-1" startRace={noop} stopRace={noop} />,
    )
    expect(await screen.findByText('Best: 55 SPM')).toBeInTheDocument()
  })

  it('opens the leaderboard, shows a section per duration, and ✕ returns to the picker', async () => {
    const user = userEvent.setup()
    vi.mocked(loadLeaderboard).mockResolvedValue({
      30: [{ name: 'Ada', spm: 50, duration_s: 30, createdAt: 1 }],
      60: [],
      90: [],
    })
    render(
      <RacePane race={null} userId={null} startRace={noop} stopRace={noop} />,
    )

    await user.click(screen.getByRole('button', { name: /leaderboard/i }))
    expect(loadLeaderboard).toHaveBeenCalled()

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('30s')).toBeInTheDocument()
    expect(screen.getByText('60s')).toBeInTheDocument()
    expect(screen.getByText('90s')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close leaderboard/i }))
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30s' })).toBeInTheDocument()
  })

  it('shows a dropped-connection banner when a running race vanishes without a local Stop', () => {
    const { rerender } = render(
      <RacePane race={running} userId={null} startRace={noop} stopRace={noop} />,
    )
    rerender(
      <RacePane race={null} userId={null} startRace={noop} stopRace={noop} />,
    )
    expect(
      screen.getByText('Connection dropped — race cancelled.'),
    ).toBeInTheDocument()

    rerender(
      <RacePane race={running} userId={null} startRace={noop} stopRace={noop} />,
    )
    expect(
      screen.queryByText('Connection dropped — race cancelled.'),
    ).toBeNull()
  })

  it('does NOT show the dropped banner after a deliberate Stop', async () => {
    const user = userEvent.setup()
    const stopRace = vi.fn()
    const { rerender } = render(
      <RacePane
        race={running}
        userId={null}
        startRace={noop}
        stopRace={stopRace}
      />,
    )
    await user.click(screen.getByRole('button', { name: /stop/i }))
    rerender(
      <RacePane
        race={null}
        userId={null}
        startRace={noop}
        stopRace={stopRace}
      />,
    )
    expect(
      screen.queryByText('Connection dropped — race cancelled.'),
    ).toBeNull()
  })
})
