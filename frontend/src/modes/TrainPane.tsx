import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CommitPop } from '../motion/CommitPop'
import { SquidMascot } from '../components/SquidMascot'
import { HoldButton } from '../components/HoldButton'
import type { TranscriptAction } from '../types'

const HISTORY_KEY = 'squidspell-train-history'

type Saved = { id: string; text: string; savedAt: number }

function loadHistory(): Saved[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as Saved[]) : []
  } catch {
    return []
  }
}

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

const historyList: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxHeight: '9rem',
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

export function TrainPane({
  transcript,
  onAction,
}: {
  transcript: string
  onAction: (a: TranscriptAction) => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [history, setHistory] = useState<Saved[]>(loadHistory)

  const empty = transcript === ''

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcript])

  function persist(next: Saved[]) {
    setHistory(next)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function onSave() {
    persist([
      {
        id: crypto.randomUUID?.() ?? String(Date.now()),
        text: transcript,
        savedAt: Date.now(),
      },
      ...history,
    ])
  }

  function onDownload() {
    const blob = new Blob([transcript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'squidspell-transcript.txt'
    a.click()
    URL.revokeObjectURL(url)
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
      {empty ? (
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
        <button type="button" style={plainButton} disabled={empty} onClick={onSave}>
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
      </div>

      {history.length > 0 && (
        <ul style={historyList}>
          {history.map((entry) => (
            <li key={entry.id} style={historyItem}>
              <span style={{ flexShrink: 0 }}>{relativeTime(entry.savedAt)}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--sq-fg)',
                }}
              >
                {entry.text.slice(0, 40)}
              </span>
              <button
                type="button"
                aria-label={`Delete saved transcript from ${relativeTime(entry.savedAt)}`}
                onClick={() => persist(history.filter((h) => h.id !== entry.id))}
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
  )
}
