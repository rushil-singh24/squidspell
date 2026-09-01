import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CommitPop } from '../motion/CommitPop'
import { SquidMascot } from '../components/SquidMascot'
import { HoldButton } from '../components/HoldButton'
import type { TranscriptAction } from '../types'
import type { TrainEntry } from '../lib/trainHistory'
import {
  loadTrainHistory,
  saveTrainSentence,
  deleteTrainSentence,
} from '../lib/trainHistory'

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

export const TrainPane = memo(function TrainPane({
  transcript,
  onAction,
  userId,
}: {
  transcript: string
  onAction: (a: TranscriptAction) => void
  userId: string | null
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [history, setHistory] = useState<TrainEntry[]>([])

  const empty = transcript === ''

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcript])

  useEffect(() => {
    let active = true
    loadTrainHistory(userId).then((list) => {
      if (active) setHistory(list)
    })
    return () => {
      active = false
    }
  }, [userId])

  function onSave() {
    void saveTrainSentence(userId, transcript).then(setHistory)
  }

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
                onClick={() =>
                  void deleteTrainSentence(userId, entry.id).then(setHistory)
                }
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
})
