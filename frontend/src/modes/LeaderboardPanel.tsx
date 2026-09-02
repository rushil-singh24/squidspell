import type { CSSProperties } from 'react'
import type { LeaderRow } from '../lib/leaderboard'

const BUCKETS = [30, 60, 90]

const panel: CSSProperties = {
  flex: 1,
  minHeight: '6rem',
  overflowY: 'auto',
  padding: '0.5rem',
  borderRadius: '0.5rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  color: 'var(--sq-fg)',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--sq-fg-muted)',
  padding: '0.125rem 0.25rem',
}

const closeButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--sq-fg-muted)',
  cursor: 'pointer',
  fontSize: '0.875rem',
  lineHeight: 1,
}

const sectionLabel: CSSProperties = {
  margin: '0 0 0.25rem',
  padding: '0 0.25rem',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--sq-fg-muted)',
}

const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const item: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'baseline',
  padding: '0.375rem 0.5rem',
  borderRadius: '0.375rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
  fontSize: '0.8125rem',
}

const rankCell: CSSProperties = {
  flexShrink: 0,
  width: '1.75rem',
  color: 'var(--sq-fg-muted)',
}

const nameCell: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--sq-fg)',
}

const scoreCell: CSSProperties = {
  flexShrink: 0,
  color: 'var(--sq-accent)',
  fontVariantNumeric: 'tabular-nums',
}

const messageLine: CSSProperties = {
  margin: 0,
  padding: '0 0.25rem',
  fontSize: '0.8125rem',
  color: 'var(--sq-fg-muted)',
}

/**
 * Presentational public-leaderboard panel. Overlays the Race pre-race area
 * (parity with Train's saved-transcripts panel). Data-fetching lives in the
 * parent (`RacePane`) via `loadLeaderboard()`.
 */
export function LeaderboardPanel({
  data,
  loading,
  onClose,
}: {
  data: Record<number, LeaderRow[]>
  loading: boolean
  onClose: () => void
}) {
  return (
    <div style={panel}>
      <div style={header}>
        <span>Leaderboard</span>
        <button
          type="button"
          aria-label="Close leaderboard"
          onClick={onClose}
          style={closeButton}
        >
          ✕
        </button>
      </div>

      {loading ? (
        <p style={messageLine}>Loading…</p>
      ) : (
        BUCKETS.map((d) => {
          const rows = data[d] ?? []
          return (
            <section key={d}>
              <p style={sectionLabel}>{d}s</p>
              {rows.length === 0 ? (
                <p style={messageLine}>No scores yet.</p>
              ) : (
                <ol style={list}>
                  {rows.map((r, i) => (
                    <li key={`${r.name}-${r.createdAt}-${i}`} style={item}>
                      <span style={rankCell}>#{i + 1}</span>
                      <span style={nameCell}>{r.name}</span>
                      <span style={scoreCell}>· {r.spm} spm</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
