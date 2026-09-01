import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Best (highest) SPM per race duration in seconds. Same shape whether it came
 * from `localStorage` (anonymous) or the Supabase `race_results` table (signed
 * in — reduced client-side to the max SPM per `duration_s`).
 */
export type Bests = Record<number, number>

const BESTS_KEY = 'squidspell-race-bests'

type RaceResultRow = { duration_s: number; spm: number }

/** Anonymous read: the original `RacePane.loadBests()` logic, verbatim. */
function loadLocal(): Bests {
  try {
    const raw = localStorage.getItem(BESTS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (!entries.every(([, v]) => typeof v === 'number')) return {}
    const out: Bests = {}
    for (const [k, v] of entries) out[Number(k)] = v as number
    return out
  } catch {
    return {}
  }
}

/** Raise the local best for `durationS` to `spm` (if it beats the stored one), persist, return the map. */
function bumpLocal(durationS: number, spm: number): Bests {
  const current = loadLocal()
  const next =
    spm > (current[durationS] ?? 0) ? { ...current, [durationS]: spm } : current
  try {
    localStorage.setItem(BESTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

/** True when we should use the `localStorage` store instead of Supabase. */
function anon(userId: string | null): boolean {
  return userId === null || !isSupabaseConfigured || !supabase
}

export async function loadBests(userId: string | null): Promise<Bests> {
  if (anon(userId)) return loadLocal()

  const { data, error } = await supabase!
    .from('race_results')
    .select('duration_s,spm')
    .eq('user_id', userId)

  if (error) {
    console.warn('[raceStore] load failed; falling back to local store', error)
    return loadLocal()
  }

  const out: Bests = {}
  for (const row of (data ?? []) as RaceResultRow[]) {
    if (row.spm > (out[row.duration_s] ?? 0)) out[row.duration_s] = row.spm
  }
  return out
}

export async function recordRaceResult(
  userId: string | null,
  r: {
    duration_s: number
    spm: number
    accuracy: number | null
    consistency: number | null
  },
): Promise<Bests> {
  if (anon(userId)) return bumpLocal(r.duration_s, r.spm)

  const { error } = await supabase!.from('race_results').insert({
    user_id: userId,
    duration_s: r.duration_s,
    spm: r.spm,
    accuracy: r.accuracy,
    consistency: r.consistency,
  })

  if (error) {
    console.warn('[raceStore] record failed; falling back to local store', error)
    return bumpLocal(r.duration_s, r.spm)
  }

  return loadBests(userId)
}
