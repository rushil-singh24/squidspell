import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadLeaderboard } from './leaderboard'

const mocks = vi.hoisted(() => ({
  configured: { value: true },
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
  mocks.configured.value = true
})

type Result = { data: unknown; error: unknown }

function wire(raceResult: Result, profileResult: Result) {
  const limit = vi.fn().mockResolvedValue(raceResult)
  const order = vi.fn(() => ({ limit }))
  const raceSelect = vi.fn(() => ({ order }))

  const inFn = vi.fn().mockResolvedValue(profileResult)
  const profileSelect = vi.fn(() => ({ in: inFn }))

  mocks.from.mockImplementation((table: string) => {
    if (table === 'race_results') return { select: raceSelect }
    if (table === 'profiles') return { select: profileSelect }
    throw new Error(`unexpected table ${table}`)
  })
  return { limit, order, raceSelect, inFn, profileSelect }
}

describe('loadLeaderboard', () => {
  it('returns the empty 30/60/90 shape when Supabase is not configured', async () => {
    mocks.configured.value = false
    expect(await loadLeaderboard()).toEqual({ 30: [], 60: [], 90: [] })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('buckets by duration, resolves names, and falls back to Anonymous', async () => {
    const w = wire(
      {
        data: [
          { user_id: 'a', spm: 50, duration_s: 30, created_at: '2026-01-02T00:00:00Z' },
          { user_id: 'b', spm: 40, duration_s: 30, created_at: '2026-01-01T00:00:00Z' },
          { user_id: 'a', spm: 70, duration_s: 60, created_at: '2026-01-03T00:00:00Z' },
          { user_id: 'c', spm: 33, duration_s: 90, created_at: '2026-01-04T00:00:00Z' },
          { user_id: 'a', spm: 99, duration_s: 15, created_at: '2026-01-05T00:00:00Z' },
        ],
        error: null,
      },
      {
        data: [
          { id: 'a', display_name: 'Ada' },
          { id: 'b', display_name: null },
        ],
        error: null,
      },
    )

    const board = await loadLeaderboard()

    expect(w.raceSelect).toHaveBeenCalledWith('user_id, spm, duration_s, created_at')
    expect(w.order).toHaveBeenCalledWith('spm', { ascending: false })
    expect(w.limit).toHaveBeenCalledWith(200)
    expect(w.inFn).toHaveBeenCalledWith('id', expect.arrayContaining(['a', 'b', 'c']))

    expect(board[30].map((r) => [r.name, r.spm])).toEqual([
      ['Ada', 50],
      ['Anonymous', 40], // profile row exists but display_name is null
    ])
    expect(board[60]).toEqual([
      {
        name: 'Ada',
        spm: 70,
        duration_s: 60,
        createdAt: Date.parse('2026-01-03T00:00:00Z'),
      },
    ])
    expect(board[90][0].name).toBe('Anonymous') // 'c' has no profile row at all
    // the legacy 15s row is dropped entirely
    expect(Object.keys(board).sort()).toEqual(['30', '60', '90'])
  })

  it('caps each bucket at the top 10 by spm', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      user_id: 'a',
      spm: 100 - i,
      duration_s: 30,
      created_at: '2026-01-01T00:00:00Z',
    }))
    wire(
      { data: rows, error: null },
      { data: [{ id: 'a', display_name: 'Ada' }], error: null },
    )

    const board = await loadLeaderboard()

    expect(board[30]).toHaveLength(10)
    expect(board[30][0].spm).toBe(100)
    expect(board[30][9].spm).toBe(91)
  })

  it('returns the empty shape and warns on a query error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    wire({ data: null, error: { message: 'boom' } }, { data: [], error: null })

    expect(await loadLeaderboard()).toEqual({ 30: [], 60: [], 90: [] })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
