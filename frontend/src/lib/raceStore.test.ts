import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadBests, recordRaceResult } from './raceStore'

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
})

describe('raceStore — account-only guards', () => {
  it('loadBests returns {} (never null) when logged out', async () => {
    expect(await loadBests(null)).toEqual({})
  })

  it('returns {} when a userId is set but Supabase is not configured', async () => {
    mocks.configured.value = false
    expect(await loadBests('user-1')).toEqual({})
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('recordRaceResult is a no-op (returns null) with no account', async () => {
    const out = await recordRaceResult(null, {
      duration_s: 30,
      spm: 33,
      accuracy: null,
      consistency: null,
    })
    expect(out).toBeNull()
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

  it('loadBests returns null on a Supabase error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { select } = stubSelect({ data: null, error: { message: 'boom' } })
    mocks.from.mockReturnValue({ select })

    const bests = await loadBests('user-1')

    expect(warn).toHaveBeenCalled()
    expect(bests).toBeNull()
    warn.mockRestore()
  })

  it('recordRaceResult throws when the insert errors', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    mocks.from.mockReturnValue({ insert })

    await expect(
      recordRaceResult('user-1', {
        duration_s: 15,
        spm: 30,
        accuracy: null,
        consistency: null,
      }),
    ).rejects.toThrow('nope')
  })
})
