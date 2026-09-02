import { supabase, isSupabaseConfigured } from './supabase'

/** One leaderboard entry, already resolved to a display name. */
export type LeaderRow = {
  name: string
  spm: number
  duration_s: number
  createdAt: number
}

/** The three valid race buckets, in display order. */
export const LEADERBOARD_BUCKETS = [30, 60, 90] as const

type ResultRow = {
  user_id: string
  spm: number
  duration_s: number
  created_at: string
}

type ProfileRow = { id: string; display_name: string | null }

function emptyShape(): Record<number, LeaderRow[]> {
  return { 30: [], 60: [], 90: [] }
}

/**
 * Public leaderboard: top-10 SPM per race duration (30 / 60 / 90 s), keyed by
 * `duration_s`. Readable signed-out — `race_results` / `profiles` are
 * public-read by RLS policy (see `database/schema.sql`).
 *
 * Any failure (or an unconfigured Supabase) resolves to the empty shape so the
 * panel can always render.
 */
export async function loadLeaderboard(): Promise<Record<number, LeaderRow[]>> {
  if (!supabase || !isSupabaseConfigured) return emptyShape()

  try {
    const { data: rows, error } = await supabase
      .from('race_results')
      .select('user_id, spm, duration_s, created_at')
      .order('spm', { ascending: false })
      .limit(200)

    if (error) throw error

    const results = (rows ?? []) as ResultRow[]
    const ids = [...new Set(results.map((r) => r.user_id))]

    const nameMap: Record<string, string> = {}
    if (ids.length > 0) {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ids)

      if (pErr) throw pErr

      for (const p of (profiles ?? []) as ProfileRow[]) {
        if (p.display_name) nameMap[p.id] = p.display_name
      }
    }

    const out = emptyShape()
    for (const r of results) {
      if (r.duration_s !== 30 && r.duration_s !== 60 && r.duration_s !== 90) {
        continue // ignore legacy 15s rows
      }
      out[r.duration_s].push({
        name: nameMap[r.user_id] ?? 'Anonymous',
        spm: r.spm,
        duration_s: r.duration_s,
        createdAt: Date.parse(r.created_at) || Date.now(),
      })
    }
    // Query 1 is already sorted desc by spm, so each bucket is too — just cap.
    for (const b of LEADERBOARD_BUCKETS) out[b] = out[b].slice(0, 10)
    return out
  } catch (err) {
    console.warn('[leaderboard] load failed', err)
    return emptyShape()
  }
}
