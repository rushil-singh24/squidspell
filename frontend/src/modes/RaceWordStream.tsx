import { memo } from 'react'
import type { CSSProperties } from 'react'

const column: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  textAlign: 'center',
}

const currentWord: CSSProperties = {
  fontSize: '2rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.08em',
  lineHeight: 1.2,
}

const upcomingRow: CSSProperties = {
  fontSize: '0.9rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.04em',
  color: 'var(--sq-fg-muted)',
  opacity: 0.7,
}

type LetterState = 'done' | 'cursor' | 'pending'

const letterStyle: Record<LetterState, CSSProperties> = {
  done: { color: 'var(--sq-accent)' },
  cursor: { color: 'var(--sq-fg)', borderBottom: '2px solid var(--sq-accent)' },
  pending: { color: 'var(--sq-fg-muted)' },
}

function stateFor(index: number, typedLength: number): LetterState {
  if (index < typedLength) return 'done'
  if (index === typedLength) return 'cursor'
  return 'pending'
}

export const RaceWordStream = memo(function RaceWordStream({
  target,
  typed,
  upcoming,
}: {
  target: string
  typed: string
  upcoming: string[]
}) {
  const typedLength = Math.min(typed.length, target.length)

  return (
    <div style={column}>
      <div style={currentWord}>
        {target.split('').map((char, index) => {
          const state = stateFor(index, typedLength)
          return (
            <span key={index} data-state={state} style={letterStyle[state]}>
              {char}
            </span>
          )
        })}
      </div>
      {upcoming.length > 0 && <div style={upcomingRow}>{upcoming.join(' ')}</div>}
    </div>
  )
})
