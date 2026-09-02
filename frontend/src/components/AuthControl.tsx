import type { CSSProperties } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import type { AuthUser } from '../hooks/useAuth'

type Props = {
  user: AuthUser | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const boxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const buttonStyle: CSSProperties = {
  borderRadius: '0.5rem',
  padding: '0.4rem 0.7rem',
  fontSize: '0.8rem',
  lineHeight: 1.2,
  color: 'var(--sq-fg)',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
  cursor: 'pointer',
}

/**
 * Presentational auth widget for the header corner. Props are the `useAuth()`
 * return value, prop-drilled from `AppShell`. Renders nothing when Supabase is
 * not configured so the anonymous app has no dead login button.
 */
export function AuthControl({ user, loading, signInWithGoogle, signOut }: Props) {
  if (!isSupabaseConfigured) return null

  if (loading) {
    return (
      <div style={boxStyle}>
        <span
          aria-hidden="true"
          data-testid="auth-loading"
          style={{
            display: 'inline-block',
            width: 104,
            height: 30,
            borderRadius: '0.5rem',
            background: 'var(--sq-surface)',
            border: '1px solid var(--sq-border)',
            opacity: 0.5,
          }}
        />
      </div>
    )
  }

  if (!user) {
    return (
      <div style={boxStyle}>
        <button
          type="button"
          aria-label="Sign in with Google"
          style={buttonStyle}
          onClick={() => void signInWithGoogle()}
        >
          Sign in with Google to save your progress
        </button>
      </div>
    )
  }

  return (
    <div style={boxStyle}>
      {user.avatarUrl !== null && (
        <img
          src={user.avatarUrl}
          alt=""
          width={24}
          height={24}
          style={{ borderRadius: '50%', display: 'block' }}
        />
      )}
      <span
        style={{
          fontSize: '0.8rem',
          color: 'var(--sq-fg)',
          maxWidth: 160,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {user.name ?? user.email ?? 'Signed in'}
      </span>
      <button type="button" style={buttonStyle} onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}
