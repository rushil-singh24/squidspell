import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Best (highest) SPM per race duration in seconds, read from the Supabase
 * `race_results` table (reduced client-side to the max SPM per `duration_s`).
 * Persistence is account-only — logged out means no bests are stored or shown.
 */
export type Bests = Record<number, number>

type RaceResultRow = { duration_s: number; spm: number }

/** True when there is no signed-in account to persist against. */
function anon(userId: string | null): boolean {
  return userId === null || !isSupabaseConfigured || !supabase
}

export async function loadBests(userId: string | null): Promise<Bests | null> {
  if (anon(userId)) return {}

  const { data, error } = await supabase!
    .from('race_results')
    .select('duration_s,spm')
    .eq('user_id', userId)

  if (error) {
    // Return null so the caller keeps whatever bests it already has.
    console.warn('[raceStore] load failed; keeping current state', error)
    return null
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
): Promise<Bests | null> {
  // No account → nothing to persist.
  if (anon(userId)) return null

  const { error } = await supabase!.from('race_results').insert({
    user_id: userId,
    duration_s: r.duration_s,
    spm: r.spm,
    accuracy: r.accuracy,
    consistency: r.consistency,
  })

  if (error) {
    throw new Error(error.message || error.details || JSON.stringify(error))
  }

  return loadBests(userId)
}
