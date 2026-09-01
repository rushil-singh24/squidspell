import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = import.meta.env as Record<string, string | undefined>

const url = env.VITE_SUPABASE_URL ?? ''
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? ''

const hasEnv = url.length > 0 && anonKey.length > 0

let client: SupabaseClient | null = null

if (hasEnv) {
  try {
    // `createClient` runs `new URL(url)` eagerly — a malformed
    // `VITE_SUPABASE_URL` would otherwise throw at import and crash the app.
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  } catch (err) {
    console.warn(
      '[supabase] createClient failed; running without Supabase. Check VITE_SUPABASE_URL.',
      err,
    )
    client = null
  }
}

/**
 * True only when both Supabase env vars are non-empty strings *and* the client
 * was constructed successfully. Every Supabase code path must gate on this /
 * a non-null `supabase` so the app runs fully anonymous otherwise.
 */
export const isSupabaseConfigured: boolean = client !== null

/**
 * The shared Supabase client, or `null` when the env is unset/incomplete or
 * the client failed to construct.
 *
 * `VITE_SUPABASE_ANON_KEY` may hold a new-style `sb_publishable_...` key;
 * `createClient` accepts it in the anon-key position.
 */
export const supabase: SupabaseClient | null = client
