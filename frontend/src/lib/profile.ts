import { supabase } from './supabase'

/**
 * Best-effort upsert of the signer's public `profiles` row. The Race-mode
 * leaderboard reads `profiles.display_name` so it can show names instead of
 * raw user UUIDs.
 *
 * Non-critical: any failure is warned and swallowed so it never blocks the
 * auth flow. No-op when Supabase is not configured.
 */
export async function upsertProfile(user: {
  id: string
  name: string | null
  email: string | null
}): Promise<void> {
  if (!supabase) return

  // Only a display name is stored -- the row is world-readable (leaderboard).
  // Fall back to the email's local-part (before the @) if there's no name, so
  // the full address is never persisted.
  const displayName =
    user.name ?? user.email?.split('@')[0] ?? 'Anonymous'

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.warn('[profile] upsert failed (non-critical)', error)
  }
}
