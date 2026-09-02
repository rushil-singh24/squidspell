import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadTrainHistory,
  saveTrainSentence,
  deleteTrainSentence,
} from './trainHistory'

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

describe('trainHistory — account-only guards', () => {
  it('loadTrainHistory returns [] (never null) when logged out', async () => {
    expect(await loadTrainHistory(null)).toEqual([])
  })

  it('returns [] when a userId is set but Supabase is not configured', async () => {
    mocks.configured.value = false
    expect(await loadTrainHistory('user-1')).toEqual([])
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('save / delete are no-ops (return null) with no account', async () => {
    expect(await saveTrainSentence(null, 'HELLO')).toBeNull()
    expect(await deleteTrainSentence(null, 'x')).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

describe('trainHistory — signed-in (Supabase) path', () => {
  const rows = [
    { id: 'r2', sentence: 'NEWER', created_at: '2026-02-01T00:00:00.000Z' },
    { id: 'r1', sentence: 'OLDER', created_at: '2026-01-01T00:00:00.000Z' },
  ]

  function stubSelect(result: { data: unknown; error: unknown }) {
    const order = vi.fn().mockResolvedValue(result)
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    return { select, eq, order }
  }

  beforeEach(() => {
    mocks.configured.value = true
  })

  it('maps rows → TrainEntry newest-first and queries by user_id', async () => {
    const { select, eq, order } = stubSelect({ data: rows, error: null })
    mocks.from.mockReturnValue({ select })

    const list = await loadTrainHistory('user-1')

    expect(mocks.from).toHaveBeenCalledWith('translations')
    expect(select).toHaveBeenCalledWith('id,sentence,created_at')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(list).toEqual([
      { id: 'r2', text: 'NEWER', savedAt: Date.parse('2026-02-01T00:00:00.000Z') },
      { id: 'r1', text: 'OLDER', savedAt: Date.parse('2026-01-01T00:00:00.000Z') },
    ])
  })

  it('inserts a new sentence then re-loads the list', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const { select } = stubSelect({ data: rows, error: null })
    mocks.from.mockReturnValue({ select, insert })

    const list = await saveTrainSentence('user-1', 'FRESH')

    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', sentence: 'FRESH' })
    expect(list?.map((e) => e.text)).toEqual(['NEWER', 'OLDER'])
  })

  it('deletes by row id scoped to the user, then re-loads the list', async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null })
    const eqId = vi.fn(() => ({ eq: eqUser }))
    const del = vi.fn(() => ({ eq: eqId }))
    const { select } = stubSelect({ data: rows, error: null })
    mocks.from.mockReturnValue({ select, delete: del })

    const list = await deleteTrainSentence('user-1', 'r1')

    expect(del).toHaveBeenCalledTimes(1)
    expect(eqId).toHaveBeenCalledWith('id', 'r1')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(list?.map((e) => e.id)).toEqual(['r2', 'r1'])
  })

  it('returns null on a Supabase load error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { select } = stubSelect({ data: null, error: { message: 'boom' } })
    mocks.from.mockReturnValue({ select })

    const list = await loadTrainHistory('user-1')

    expect(warn).toHaveBeenCalled()
    expect(list).toBeNull()
    warn.mockRestore()
  })

  it('throws when insert errors', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    mocks.from.mockReturnValue({ insert })

    await expect(saveTrainSentence('user-1', 'FALLBACK')).rejects.toThrow('nope')
  })

  it('throws when delete errors', async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const eqId = vi.fn(() => ({ eq: eqUser }))
    const del = vi.fn(() => ({ eq: eqId }))
    mocks.from.mockReturnValue({ delete: del })

    await expect(deleteTrainSentence('user-1', 'local-1')).rejects.toThrow('boom')
  })
})
