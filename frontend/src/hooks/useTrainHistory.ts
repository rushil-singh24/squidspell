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
 * and `save` / `remove` are effectively no-ops via the lib guards.
 */
export function useTrainHistory(userId: string | null): {
  entries: TrainEntry[]
  save: (text: string) => void
  remove: (id: string) => void
  reload: () => void
} {
  const [entries, setEntries] = useState<TrainEntry[]>([])
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

  useEffect(() => load(), [load])

  const save = useCallback(
    (text: string) => {
      const uid = userId
      const temp: TrainEntry = {
        id: `tmp-${crypto.randomUUID?.() ?? Date.now()}`,
        text: text.toUpperCase(),
        savedAt: Date.now(),
      }
      setEntries((e) => [temp, ...e])
      void saveTrainSentence(uid, text).then((list) => {
        // null = nothing persisted (no account / write failed): leave the
        // optimistic entry in place.
        if (list && uid === userIdRef.current) setEntries(list)
      })
    },
    [userId],
  )

  const remove = useCallback(
    (id: string) => {
      const uid = userId
      setEntries((e) => e.filter((x) => x.id !== id))
      void deleteTrainSentence(uid, id).then((list) => {
        if (list && uid === userIdRef.current) setEntries(list)
      })
    },
    [userId],
  )

  const reload = useCallback(() => {
    load()
  }, [load])

  return { entries, save, remove, reload }
}
