import { useTheme } from '../hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
      className="rounded-full p-2 text-sm leading-none transition-colors"
      style={{
        color: 'var(--sq-fg-muted)',
        background: 'var(--sq-surface)',
        border: '1px solid var(--sq-border)',
      }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
