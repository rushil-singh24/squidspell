import { afterEach, describe, expect, it, vi } from 'vitest'

// `supabase.ts` reads `import.meta.env` at module-eval time, so each branch
// needs a fresh module instance: stub the env, `vi.resetModules()`, then
// dynamic-import. `frontend/.env` may already populate these vars during the
// test run, hence the explicit stubbing for both directions.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('supabase client module', () => {
  it('is configured and exposes a client when both env vars are non-empty', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test_key')
    vi.resetModules()

    const mod = await import('./supabase')

    expect(mod.isSupabaseConfigured).toBe(true)
    expect(mod.supabase).not.toBeNull()
  })

  it('is not configured and exposes null when env vars are empty', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    vi.resetModules()

    const mod = await import('./supabase')

    expect(mod.isSupabaseConfigured).toBe(false)
    expect(mod.supabase).toBeNull()
  })

  it('warns and stays unconfigured when the URL is malformed', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'not-a-valid-url')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test_key')
    vi.resetModules()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mod = await import('./supabase')

    expect(warn).toHaveBeenCalled()
    expect(mod.isSupabaseConfigured).toBe(false)
    expect(mod.supabase).toBeNull()

    warn.mockRestore()
  })
})
