import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { pressable } from '../motion'
import type { Mode } from '../types'

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'train', label: 'Train' },
  { mode: 'race', label: 'Race' },
]

const base: CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 9999,
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
}

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (m: Mode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Mode"
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 9999,
        background: 'var(--sq-surface)',
        border: '1px solid var(--sq-border)',
      }}
    >
      {TABS.map(({ mode: tabMode, label }) => {
        const active = mode === tabMode
        return (
          <motion.button
            key={tabMode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tabMode)}
            {...pressable}
            style={{
              ...base,
              background: active ? 'var(--sq-accent)' : 'transparent',
              color: active ? 'var(--sq-bg-deep)' : 'var(--sq-fg-muted)',
            }}
          >
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}
