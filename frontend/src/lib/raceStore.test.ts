import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadBests, recordRaceResult } from './raceStore'

const BESTS_KEY = 'squidspell-race-bests'

const mocks = vi.hoisted(() => ({
  configured: { value: false },
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({
  get isSupabaseConfigured() {
    return mocks.configured.value
  },
  get supabase() {
    return mocks.configured.value ? { from: mocks.from } : null
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.configured.value = false
  localStorage.clear()
})

describe('raceStore — anonymous (localStorage) path', () => {
  it('records a personal best and round-trips it through localStorage', async () => {
    const afterFirst = await recordRaceResult(null, {
      duration_s: 30,
      spm: 40,
      accuracy: 0.9,
      consistency: 70,
    })
    expect(afterFirst).toEqual({ 30: 40 })
    expect(JSON.parse(localStorage.getItem(BESTS_KEY) as string)).toEqual({
      30: 40,
    })

    expect(await loadBests(null)).toEqual({ 30: 40 })
  })

  it('only raises a best when the new spm beats the stored one', async () => {
    await recordRaceResult(null, {
      duration_s: 30,
      spm: 40,
      accuracy: null,
      consistency: null,
    })
    const lower = await recordRaceResult(null, {
      duration_s: 30,
      spm: 25,
      accuracy: null,
      consistency: null,
    })
    expect(lower).toEqual({ 30: 40 })
    const higher = await recordRaceResult(null, {
      duration_s: 30,
      spm: 55,
      accuracy: null,
      consistency: null,
    })
    expect(higher).toEqual({ 30: 55 })
  })

  it('keeps per-duration bests independent', async () => {
    await recordRaceResult(null, {
      duration_s: 15,
      spm: 20,
      accuracy: null,
      consistency: null,
    })
    const both = await recordRaceResult(null, {
      duration_s: 60,
      spm: 80,
      accuracy: null,
      consistency: null,
    })
    expect(both).toEqual({ 15: 20, 60: 80 })
  })

  it('degrades to an empty map when stored JSON is malformed', async () => {
    for (const bad of ['{"30":"fast"}', '[1,2,3]', 'not json']) {
      localStorage.setItem(BESTS_KEY, bad)
      expect(await loadBests(null)).toEqual({})
    }
  })

  it('uses the local path when a userId is set but Supabase is not configured', async () => {
    mocks.configured.value = false
    const out = await recordRaceResult('user-1', {
      duration_s: 30,
      spm: 33,
      accuracy: null,
      consistency: null,
    })
    expect(out).toEqual({ 30: 33 })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

describe('raceStore — signed-in (Supabase) path', () => {
  function stubSelect(result: { data: unknown; error: unknown }) {
    const eq = vi.fn().mockResolvedValue(result)
    const select = vi.fn(() => ({ eq }))
    return { select, eq }
  }

  beforeEach(() => {
    mocks.configured.value = true
  })

  it('reduces race_results rows to a max-spm-per-duration map', async () => {
    const rows = [
      { duration_s: 30, spm: 40 },
      { duration_s: 30, spm: 52 },
      { duration_s: 15, spm: 22 },
      { duration_s: 30, spm: 12 },
    ]
    const { select, eq } = stubSelect({ data: rows, error: null })
    mocks.from.mockReturnValue({ select })

    const bests = await loadBests('user-1')

    expect(mocks.from).toHaveBeenCalledWith('race_results')
    expect(select).toHaveBeenCalledWith('duration_s,spm')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(bests).toEqual({ 15: 22, 30: 52 })
  })

  it('inserts a race_results row then re-loads the bests map', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const { select } = stubSelect({
      data: [{ duration_s: 30, spm: 44 }],
      error: null,
    })
    mocks.from.mockReturnValue({ select, insert })

    const bests = await recordRaceResult('user-1', {
      duration_s: 30,
      spm: 44,
      accuracy: 0.8,
      consistency: 65,
    })

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      duration_s: 30,
      spm: 44,
      accuracy: 0.8,
      consistency: 65,
    })
    expect(bests).toEqual({ 30: 44 })
  })

  it('loadBests warns and falls back to the local map on a Supabase error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(BESTS_KEY, JSON.stringify({ 30: 99 }))
    const { select } = stubSelect({ data: null, error: { message: 'boom' } })
    mocks.from.mockReturnValue({ select })

    const bests = await loadBests('user-1')

    expect(warn).toHaveBeenCalled()
    expect(bests).toEqual({ 30: 99 })
    warn.mockRestore()
  })

  it('recordRaceResult warns and writes the local map when the insert errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const insert = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    mocks.from.mockReturnValue({ insert })

    const bests = await recordRaceResult('user-1', {
      duration_s: 15,
      spm: 30,
      accuracy: null,
      consistency: null,
    })

    expect(warn).toHaveBeenCalled()
    expect(bests).toEqual({ 15: 30 })
    expect(JSON.parse(localStorage.getItem(BESTS_KEY) as string)).toEqual({
      15: 30,
    })
    warn.mockRestore()
  })
})
