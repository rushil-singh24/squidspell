import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthControl } from './AuthControl'
import type { AuthUser } from '../hooks/useAuth'

const mocks = vi.hoisted(() => ({ configured: { value: true } }))

vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return mocks.configured.value
  },
  supabase: null,
}))

const user: AuthUser = {
  id: 'u1',
  email: 'ada@ex.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
}

beforeEach(() => {
  mocks.configured.value = true
})

describe('AuthControl', () => {
  it('renders nothing when Supabase is not configured', () => {
    mocks.configured.value = false
    const { container } = render(
      <AuthControl
        user={null}
        loading={false}
        signInWithGoogle={vi.fn()}
        signOut={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a "Sign in with Google" button when signed out and calls the handler', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined)
    render(
      <AuthControl
        user={null}
        loading={false}
        signInWithGoogle={signInWithGoogle}
        signOut={vi.fn()}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /sign in with google/i }),
    )
    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('shows the user name and a "Sign out" button when signed in and calls the handler', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    render(
      <AuthControl
        user={user}
        loading={false}
        signInWithGoogle={vi.fn()}
        signOut={signOut}
      />,
    )
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('renders a neutral placeholder while loading without crashing', () => {
    render(
      <AuthControl
        user={null}
        loading
        signInWithGoogle={vi.fn()}
        signOut={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})
