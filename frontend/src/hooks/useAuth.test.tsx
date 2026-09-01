import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth } from './useAuth'

const mocks = vi.hoisted(() => ({
  configured: { value: true },
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return mocks.configured.value
  },
  supabase: { auth: mocks.auth },
}))

const session = (over: Record<string, unknown> = {}) => ({
  user: {
    id: 'u1',
    email: 'ada@ex.com',
    user_metadata: { full_name: 'Ada Lovelace', avatar_url: 'https://ex/a.png' },
    ...over,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.configured.value = true
  mocks.auth.getSession.mockResolvedValue({ data: { session: null } })
  mocks.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  mocks.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
  mocks.auth.signOut.mockResolvedValue({ error: null })
})

describe('useAuth', () => {
  it('is inert when Supabase is not configured', async () => {
    mocks.configured.value = false
    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(false)
    await expect(result.current.signInWithGoogle()).resolves.toBeUndefined()
    await expect(result.current.signOut()).resolves.toBeUndefined()
    expect(mocks.auth.getSession).not.toHaveBeenCalled()
  })

  it('populates user from an existing session', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: session() } })
    const { result } = renderHook(() => useAuth())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.user).not.toBeNull())
    expect(result.current.user).toEqual({
      id: 'u1',
      email: 'ada@ex.com',
      name: 'Ada Lovelace',
      avatarUrl: 'https://ex/a.png',
    })
    expect(result.current.loading).toBe(false)
  })

  it('updates user on SIGNED_IN / SIGNED_OUT auth events', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const cb = mocks.auth.onAuthStateChange.mock.calls[0][0] as (
      event: string,
      s: unknown,
    ) => void

    act(() => cb('SIGNED_IN', session()))
    expect(result.current.user?.id).toBe('u1')

    act(() => cb('SIGNED_OUT', null))
    expect(result.current.user).toBeNull()
  })

  it('unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    mocks.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    })
    const { unmount } = renderHook(() => useAuth())
    await waitFor(() => expect(mocks.auth.onAuthStateChange).toHaveBeenCalled())

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('signInWithGoogle calls signInWithOAuth with google + redirectTo', async () => {
    const { result } = renderHook(() => useAuth())
    await result.current.signInWithGoogle()

    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  })

  it('signOut calls the Supabase client signOut', async () => {
    const { result } = renderHook(() => useAuth())
    await result.current.signOut()

    expect(mocks.auth.signOut).toHaveBeenCalledTimes(1)
  })
})
