import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CommitPop } from '../motion/CommitPop'
import { SquidMascot } from '../components/SquidMascot'
import { HoldButton } from '../components/HoldButton'
import type { TranscriptAction } from '../types'
import type { TrainEntry } from '../lib/trainHistory'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.round(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const panel: CSSProperties = {
  flex: 1,
  minHeight: '6rem',
  overflowY: 'auto',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '1rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: 'var(--sq-fg)',
}

const emptyState: CSSProperties = {
  ...panel,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  textAlign: 'center',
  color: 'var(--sq-fg-muted)',
}

const controlsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
}

const plainButton: CSSProperties = {
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  lineHeight: 1.2,
  color: 'var(--sq-fg)',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
  cursor: 'pointer',
}

const savedPanel: CSSProperties = {
  ...panel,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.5rem',
}

const savedPanelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--sq-fg-muted)',
  padding: '0.125rem 0.25rem',
}

const historyList: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const historyItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.375rem 0.5rem',
  borderRadius: '0.375rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
  fontSize: '0.8125rem',
  color: 'var(--sq-fg-muted)',
}

export const TrainPane = memo(function TrainPane({
  transcript,
  onAction,
  userId,
  entries,
  onSave,
  onDelete,
  onReopen,
}: {
  transcript: string
  onAction: (a: TranscriptAction) => void
  userId: string | null
  entries: TrainEntry[]
  onSave: (text: string) => void
  onDelete: (id: string) => void
  onReopen: (text: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [showSaved, setShowSaved] = useState(false)

  const empty = transcript === ''
  const canSave = userId != null

  function reopen(text: string) {
    onReopen(text)
    setShowSaved(false)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcript])

  // Keyboard Space / Backspace mirror the on-screen edit controls. Letter keys
  // are deliberately NOT wired — the transcript only grows from recognised
  // signs. Ignored while a button/input holds focus so it can't double-fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (
        el &&
        el.closest('button, input, textarea, select, [contenteditable="true"]')
      )
        return
      if (e.key === ' ') {
        e.preventDefault()
        onAction('space')
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        onAction('delete')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAction])

  function onDownload() {
    const url = URL.createObjectURL(new Blob([transcript], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'squidspell-transcript.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const head = transcript.slice(0, -1)
  const tail = transcript.slice(-1)

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {showSaved ? (
        <div style={savedPanel}>
          <div style={savedPanelHeader}>
            <span>Saved transcripts</span>
            <button
              type="button"
              aria-label="Close saved transcripts"
              onClick={() => setShowSaved(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--sq-fg-muted)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          {userId == null ? (
            <div style={{ ...emptyState, border: 'none', background: 'transparent' }}>
              <span>Sign in to save and revisit transcripts.</span>
            </div>
          ) : entries.length === 0 ? (
            <div style={{ ...emptyState, border: 'none', background: 'transparent' }}>
              <span>No saved transcripts yet.</span>
            </div>
          ) : (
            <ul style={historyList}>
              {entries.map((entry) => (
                <li key={entry.id} style={historyItem}>
                  <span style={{ flexShrink: 0 }}>{relativeTime(entry.savedAt)}</span>
                  <button
                    type="button"
                    onClick={() => reopen(entry.text)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'var(--sq-fg)',
                    }}
                  >
                    {entry.text.slice(0, 60)}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved transcript from ${relativeTime(entry.savedAt)}`}
                    onClick={() => onDelete(entry.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sq-fg-muted)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : empty ? (
        <div style={emptyState}>
          <SquidMascot mood="idle" size={96} />
          <span>Sign a letter to start your transcript.</span>
        </div>
      ) : (
        <div ref={scrollRef} style={panel} data-testid="train-transcript">
          {head}
          <CommitPop trigger={transcript.length}>{tail}</CommitPop>
        </div>
      )}

      <div style={controlsRow}>
        <button type="button" style={plainButton} onClick={() => onAction('space')}>
          ␣ Space
        </button>
        <button
          type="button"
          style={plainButton}
          disabled={empty}
          onClick={() => onAction('delete')}
        >
          ⌫ Delete
        </button>
        <HoldButton
          onHoldComplete={() => onAction('clear')}
          durationMs={1000}
          disabled={empty}
        >
          Clear (hold)
        </HoldButton>
        <button
          type="button"
          style={plainButton}
          disabled={empty || !canSave}
          title={userId == null ? 'Sign in to save' : undefined}
          onClick={() => onSave(transcript)}
        >
          Save
        </button>
        <button
          type="button"
          style={plainButton}
          disabled={empty}
          onClick={onDownload}
        >
          Download
        </button>
        <button
          type="button"
          style={{
            ...plainButton,
            ...(showSaved
              ? {
                  background: 'var(--sq-accent)',
                  color: 'var(--sq-bg-deep)',
                  borderColor: 'var(--sq-accent)',
                }
              : null),
          }}
          aria-pressed={showSaved}
          onClick={() => setShowSaved((v) => !v)}
        >
          Saved{userId != null && entries.length > 0 ? ` (${entries.length})` : ''}
        </button>
      </div>
    </div>
  )
})
