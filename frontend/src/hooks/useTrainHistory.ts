import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrainEntry } from '../lib/trainHistory'
import {
  loadTrainHistory,
  saveTrainSentence,
  deleteTrainSentence,
} from '../lib/trainHistory'

/**
 * Account-only Train history, owned by `AppShell` (plain hook, prop-drilled —
 * same pattern as `usePrediction` / `useAuth`). Lifting it here keeps it alive
 * across `TrainPane` remounts (mode switch, camera-toggle re-render storm).
 *
 * Logged out (`userId == null`) or Supabase unconfigured: `entries` stays `[]`
 * and `save` / `remove` are no-ops. A Supabase write failure rejects in the lib
 * and is surfaced here via `error` (the optimistic entry is left in place so the
 * user's text is never lost).
 */
export function useTrainHistory(userId: string | null): {
  entries: TrainEntry[]
  save: (text: string) => void
  remove: (id: string) => void
  error: string | null
  clearError: () => void
} {
  const [entries, setEntries] = useState<TrainEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const load = useCallback(() => {
    const uid = userId
    if (uid === null) {
      setEntries([])
      return () => {}
    }
    let active = true
    void loadTrainHistory(uid).then((list) => {
      // null = a signed-in Supabase read failed; keep current entries.
      if (active && list && uid === userIdRef.current) setEntries(list)
    })
    return () => {
      active = false
    }
  }, [userId])

  // The concise arrow body is load-bearing: it forwards `load()`'s cleanup
  // disposer to `useEffect`. A block body (`{ load() }`) returns undefined and
  // would silently drop the cleanup.
  useEffect(() => load(), [load])

  const clearError = useCallback(() => setError(null), [])

  const save = useCallback(
    (text: string) => {
      const uid = userId
      if (uid === null) return
      setError(null)
      const temp: TrainEntry = {
        id: `tmp-${crypto.randomUUID?.() ?? Date.now()}`,
        text: text.toUpperCase(),
        savedAt: Date.now(),
      }
      setEntries((e) => [temp, ...e])
      void saveTrainSentence(uid, text).then(
        (list) => {
          // null = nothing persisted (anon no-op): leave the optimistic entry.
          if (list && uid === userIdRef.current) setEntries(list)
        },
        (err) => {
          // Write failed: surface it, but leave the optimistic temp entry in
          // place so the text isn't lost.
          if (uid === userIdRef.current)
            setError(err instanceof Error ? err.message : String(err))
        },
      )
    },
    [userId],
  )

  const remove = useCallback(
    (id: string) => {
      const uid = userId
      if (uid === null) return
      setError(null)
      setEntries((e) => e.filter((x) => x.id !== id))
      void deleteTrainSentence(uid, id).then(
        (list) => {
          if (list && uid === userIdRef.current) setEntries(list)
        },
        (err) => {
          // Delete failed: surface it and reload from the server so the
          // wrongly-removed row reappears.
          if (uid === userIdRef.current) {
            setError(err instanceof Error ? err.message : String(err))
            load()
          }
        },
      )
    },
    [userId, load],
  )

  return { entries, save, remove, error, clearError }
}
