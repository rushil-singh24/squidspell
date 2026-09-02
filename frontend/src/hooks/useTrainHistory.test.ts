import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTrainHistory } from './useTrainHistory'
import type { TrainEntry } from '../lib/trainHistory'
import {
  loadTrainHistory,
  saveTrainSentence,
  deleteTrainSentence,
} from '../lib/trainHistory'

vi.mock('../lib/trainHistory', () => ({
  loadTrainHistory: vi.fn(),
  saveTrainSentence: vi.fn(),
  deleteTrainSentence: vi.fn(),
}))

const load = vi.mocked(loadTrainHistory)
const save = vi.mocked(saveTrainSentence)
const del = vi.mocked(deleteTrainSentence)

const entry = (over: Partial<TrainEntry> = {}): TrainEntry => ({
  id: 'r1',
  text: 'HELLO',
  savedAt: 1000,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  load.mockResolvedValue([])
  save.mockResolvedValue(null)
  del.mockResolvedValue(null)
})

describe('useTrainHistory', () => {
  it('starts empty and loads the account list on a userId', async () => {
    load.mockResolvedValue([entry()])
    const { result } = renderHook(({ id }) => useTrainHistory(id), {
      initialProps: { id: 'user-1' as string | null },
    })
    expect(result.current.entries).toEqual([])
    await waitFor(() => expect(result.current.entries).toEqual([entry()]))
    expect(load).toHaveBeenCalledWith('user-1')
  })

  it('clears entries when userId goes null', async () => {
    load.mockResolvedValue([entry()])
    const { result, rerender } = renderHook(
      ({ id }) => useTrainHistory(id),
      { initialProps: { id: 'user-1' as string | null } },
    )
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    rerender({ id: null })
    await waitFor(() => expect(result.current.entries).toEqual([]))
  })

  it('save is optimistic and reconciles with the server list', async () => {
    load.mockResolvedValue([])
    save.mockResolvedValue([entry({ id: 'r9', text: 'HI' })])
    const { result } = renderHook(() => useTrainHistory('user-1'))
    await waitFor(() => expect(load).toHaveBeenCalled())

    act(() => result.current.save('hi'))
    expect(result.current.entries[0]).toMatchObject({ text: 'HI' })
    expect(result.current.entries[0].id).toMatch(/^tmp-/)

    await waitFor(() =>
      expect(result.current.entries).toEqual([entry({ id: 'r9', text: 'HI' })]),
    )
    expect(save).toHaveBeenCalledWith('user-1', 'hi')
  })

  it('keeps the optimistic entry when save returns null', async () => {
    save.mockResolvedValue(null)
    const { result } = renderHook(() => useTrainHistory('user-1'))
    await waitFor(() => expect(load).toHaveBeenCalled())

    act(() => result.current.save('keep me'))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(result.current.entries[0]).toMatchObject({ text: 'KEEP ME' })
  })

  it('surfaces a rejected save as `error` and keeps the optimistic entry', async () => {
    save.mockRejectedValue(new Error('write failed'))
    const { result } = renderHook(() => useTrainHistory('user-1'))
    await waitFor(() => expect(load).toHaveBeenCalled())

    act(() => result.current.save('keep me'))
    expect(result.current.entries[0]).toMatchObject({ text: 'KEEP ME' })

    await waitFor(() => expect(result.current.error).toBe('write failed'))
    expect(result.current.entries[0]).toMatchObject({ text: 'KEEP ME' })

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('remove is optimistic', async () => {
    load.mockResolvedValue([entry({ id: 'a' }), entry({ id: 'b' })])
    del.mockResolvedValue(null)
    const { result } = renderHook(() => useTrainHistory('user-1'))
    await waitFor(() => expect(result.current.entries).toHaveLength(2))

    act(() => result.current.remove('a'))
    expect(result.current.entries.map((e) => e.id)).toEqual(['b'])
    expect(del).toHaveBeenCalledWith('user-1', 'a')
  })
})
