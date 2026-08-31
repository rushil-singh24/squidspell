import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RacePane } from './RacePane'
import type { RaceSnapshot } from '../types'

const mock = {
  race: null as RaceSnapshot | null,
  startRace: vi.fn(),
  stopRace: vi.fn(),
}

vi.mock('../hooks/usePrediction', () => ({
  usePrediction: () => mock,
}))

beforeEach(() => {
  mock.race = null
  mock.startRace = vi.fn()
  mock.stopRace = vi.fn()
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
  results: { spm: 41.2, accuracy: 0.9, consistency: 78 },
}

describe('RacePane', () => {
  it('pre-race: shows the duration control, a Start button, and the idle mascot', () => {
    render(<RacePane />)
    expect(screen.getByRole('button', { name: '15s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '60s' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('starts a race with the selected duration', async () => {
    const user = userEvent.setup()
    render(<RacePane />)
    await user.click(screen.getByRole('button', { name: '15s' }))
    await user.click(screen.getByRole('button', { name: /start/i }))
    expect(mock.startRace).toHaveBeenCalledWith(15)
  })

  it('running: renders the word stream + HUD and a Stop control', async () => {
    const user = userEvent.setup()
    mock.race = running
    render(<RacePane />)
    expect(screen.getByText('c')).toBeInTheDocument()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('t')).toBeInTheDocument()
    expect(screen.getByText('12s left')).toBeInTheDocument()
    expect(screen.getByText('SPM 24')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stop/i }))
    expect(mock.stopRace).toHaveBeenCalled()
  })

  it('finished: shows the results card and records a personal best', () => {
    mock.race = finished
    render(<RacePane />)
    expect(screen.getByText('41.2')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('78')).toBeInTheDocument()
    const tryAgain = screen.getByRole('button', { name: /try again/i })
    expect(tryAgain).toBeEnabled()
    expect(
      JSON.parse(localStorage.getItem('squidspell-race-bests') as string)['30'],
    ).toBe(41.2)
  })

  it('tolerates a corrupt bests payload and shows no Best line', () => {
    localStorage.setItem('squidspell-race-bests', '[1,2]')
    expect(() => render(<RacePane />)).not.toThrow()
    expect(screen.queryByText(/Best:/)).toBeNull()
  })
})
