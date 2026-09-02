import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { upsertProfile } from '../lib/profile'

/**
 * Normalised view of the signed-in Supabase user. `name` / `avatarUrl` come
 * from the OAuth provider's `user_metadata` and may be absent.
 */
export type AuthUser = {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export type AuthState = {
  user: AuthUser | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const INERT: AuthState = {
  user: null,
  loading: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
}

function toAuthUser(session: Session | null): AuthUser | null {
  const u = session?.user
  if (!u) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const name = (meta.full_name ?? meta.name ?? null) as string | null
  const avatarUrl = (meta.avatar_url ?? null) as string | null
  return { id: u.id, email: u.email ?? null, name, avatarUrl }
}

/**
 * Plain hook (not a context): `AppShell` owns the single instance and
 * prop-drills the result. When Supabase is not configured it returns an inert
 * shape so the app runs fully anonymous.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    let active = true

    supabase.auth.getSession().then(
      ({ data }) => {
        if (!active) return
        const u = toAuthUser(data.session)
        setUser(u)
        setLoading(false)
        // Fire-and-forget: keep the public `profiles` row current for the
        // leaderboard. Never block auth on it.
        if (u) void upsertProfile(u)
      },
      () => {
        if (active) setLoading(false)
      },
    )

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      const u = toAuthUser(session)
      setUser(u)
      setLoading(false)
      if (u) void upsertProfile(u)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  if (!isSupabaseConfigured) return INERT

  return { user, loading, signInWithGoogle, signOut }
}
