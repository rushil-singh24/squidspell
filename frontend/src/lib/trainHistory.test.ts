import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadTrainHistory,
  saveTrainSentence,
  deleteTrainSentence,
} from './trainHistory'

const HISTORY_KEY = 'squidspell-train-history'

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

describe('trainHistory — anonymous (localStorage) path', () => {
  it('round-trips save → load → delete through localStorage', async () => {
    const afterSave = await saveTrainSentence(null, 'HELLO')
    expect(afterSave).toHaveLength(1)
    expect(afterSave[0]).toMatchObject({ text: 'HELLO' })
    expect(typeof afterSave[0].id).toBe('string')
    expect(typeof afterSave[0].savedAt).toBe('number')

    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].text).toBe('HELLO')

    const loaded = await loadTrainHistory(null)
    expect(loaded).toEqual(afterSave)

    const afterDelete = await deleteTrainSentence(null, afterSave[0].id)
    expect(afterDelete).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toHaveLength(0)
  })

  it('prepends new entries (newest first)', async () => {
    await saveTrainSentence(null, 'FIRST')
    const list = await saveTrainSentence(null, 'SECOND')
    expect(list.map((e) => e.text)).toEqual(['SECOND', 'FIRST'])
  })

  it('degrades to an empty list when stored JSON has the wrong shape', async () => {
    for (const bad of ['{"a":1}', '[1,2,3]', 'not json']) {
      localStorage.setItem(HISTORY_KEY, bad)
      expect(await loadTrainHistory(null)).toEqual([])
    }
  })

  it('uses the local path when a userId is set but Supabase is not configured', async () => {
    mocks.configured.value = false
    const list = await saveTrainSentence('user-1', 'ANON-FALLBACK')
    expect(list).toHaveLength(1)
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
    expect(list.map((e) => e.text)).toEqual(['NEWER', 'OLDER'])
  })

  it('deletes by row id then re-loads the list', async () => {
    const eqDel = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn(() => ({ eq: eqDel }))
    const { select } = stubSelect({ data: rows, error: null })
    mocks.from.mockReturnValue({ select, delete: del })

    const list = await deleteTrainSentence('user-1', 'r1')

    expect(del).toHaveBeenCalledTimes(1)
    expect(eqDel).toHaveBeenCalledWith('id', 'r1')
    expect(list.map((e) => e.id)).toEqual(['r2', 'r1'])
  })

  it('warns and falls back to the local store on a Supabase error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ id: 'local-1', text: 'LOCAL', savedAt: 123 }]),
    )
    const { select } = stubSelect({ data: null, error: { message: 'boom' } })
    mocks.from.mockReturnValue({ select })

    const list = await loadTrainHistory('user-1')

    expect(warn).toHaveBeenCalled()
    expect(list).toEqual([{ id: 'local-1', text: 'LOCAL', savedAt: 123 }])
    warn.mockRestore()
  })

  it('warns and falls back to a local write when insert errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const insert = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    mocks.from.mockReturnValue({ insert })

    const list = await saveTrainSentence('user-1', 'FALLBACK')

    expect(warn).toHaveBeenCalled()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ text: 'FALLBACK' })
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toHaveLength(1)
    warn.mockRestore()
  })
})
