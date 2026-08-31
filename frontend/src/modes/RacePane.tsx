import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { usePrediction } from '../hooks/usePrediction'
import { SquidMascot } from '../components/SquidMascot'
import { RaceWordStream } from './RaceWordStream'

const BESTS_KEY = 'squidspell-race-bests'
const DURATIONS = [15, 30, 60]

type Bests = Record<number, number>

function loadBests(): Bests {
  try {
    const raw = localStorage.getItem(BESTS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (!entries.every(([, v]) => typeof v === 'number')) return {}
    const out: Bests = {}
    for (const [k, v] of entries) out[Number(k)] = v as number
    return out
  } catch {
    return {}
  }
}

const wrap: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
}

const center: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  textAlign: 'center',
}

const hudRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.95rem',
  color: 'var(--sq-fg)',
}

const hudStat: CSSProperties = {
  padding: '0.25rem 0.5rem',
  borderRadius: '0.375rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
}

const segmented: CSSProperties = {
  display: 'inline-flex',
  gap: '0.25rem',
  padding: '0.25rem',
  borderRadius: '0.5rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
}

const segButton: CSSProperties = {
  borderRadius: '0.375rem',
  padding: '0.375rem 0.75rem',
  fontSize: '0.875rem',
  lineHeight: 1.2,
  color: 'var(--sq-fg-muted)',
  background: 'transparent',
  border: '1px solid transparent',
  cursor: 'pointer',
}

const segButtonActive: CSSProperties = {
  color: 'var(--sq-fg)',
  background: 'var(--sq-surface-raised)',
  borderColor: 'var(--sq-border)',
}

const primaryButton: CSSProperties = {
  borderRadius: '0.5rem',
  padding: '0.625rem 1.5rem',
  fontSize: '1rem',
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'var(--sq-bg-deep)',
  background: 'var(--sq-accent)',
  border: '1px solid var(--sq-accent)',
  cursor: 'pointer',
}

const linkButton: CSSProperties = {
  alignSelf: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--sq-fg-muted)',
  fontSize: '0.8125rem',
  textDecoration: 'underline',
  cursor: 'pointer',
}

const bestLine: CSSProperties = {
  margin: 0,
  fontSize: '0.875rem',
  color: 'var(--sq-fg-muted)',
}

const resultsCard: CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  padding: '1rem 1.25rem',
  borderRadius: '0.75rem',
  background: 'var(--sq-surface)',
  border: '1px solid var(--sq-border)',
}

const stat: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const statValue: CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: 'var(--sq-fg)',
}

const statLabel: CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--sq-fg-muted)',
}

export function RacePane() {
  const { race, startRace, stopRace } = usePrediction()
  const [selectedDuration, setSelectedDuration] = useState<number>(30)
  const [bests, setBests] = useState<Bests>(loadBests)
  const [dismissed, setDismissed] = useState(false)
  const [showCelebrate, setShowCelebrate] = useState(false)
  const finishedHandledRef = useRef(false)

  useEffect(() => {
    if (race?.phase === 'running') {
      finishedHandledRef.current = false
      setDismissed(false)
      setShowCelebrate(false)
      return
    }
    if (
      race?.phase === 'finished' &&
      race.results &&
      !finishedHandledRef.current
    ) {
      finishedHandledRef.current = true
      const { spm } = race.results
      setShowCelebrate(true)
      setBests((prev) => {
        if (spm <= (prev[selectedDuration] ?? 0)) return prev
        const next = { ...prev, [selectedDuration]: spm }
        try {
          localStorage.setItem(BESTS_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    }
  }, [race, selectedDuration])

  useEffect(() => {
    if (!showCelebrate) return
    const t = setTimeout(() => setShowCelebrate(false), 1500)
    return () => clearTimeout(t)
  }, [showCelebrate])

  if (race?.phase === 'running') {
    return (
      <div style={wrap}>
        <div style={hudRow}>
          <span style={hudStat}>{race.seconds_left}s left</span>
          <span style={hudStat}>SPM {race.spm}</span>
        </div>
        <div style={center}>
          <RaceWordStream
            target={race.target_word ?? ''}
            typed={race.typed}
            upcoming={race.upcoming}
          />
        </div>
        <button type="button" style={linkButton} onClick={() => stopRace()}>
          Stop
        </button>
      </div>
    )
  }

  if (race?.phase === 'finished' && race.results && !dismissed) {
    const r = race.results
    return (
      <div style={wrap}>
        <div style={center}>
          {showCelebrate && <SquidMascot mood="celebrate" size={120} />}
          <div style={resultsCard}>
            <div style={stat}>
              <span style={statValue}>{r.spm}</span>
              <span style={statLabel}>SPM</span>
            </div>
            <div style={stat}>
              <span style={statValue}>{Math.round(r.accuracy * 100)}%</span>
              <span style={statLabel}>Accuracy</span>
            </div>
            <div style={stat}>
              <span style={statValue}>{Math.round(r.consistency)}</span>
              <span style={statLabel}>Consistency</span>
            </div>
          </div>
          <button
            type="button"
            style={primaryButton}
            onClick={() => {
              setDismissed(true)
              stopRace()
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const best = bests[selectedDuration]
  return (
    <div style={wrap}>
      <div style={center}>
        <SquidMascot mood="idle" size={96} />
        <div style={segmented} role="group" aria-label="Race duration">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === selectedDuration}
              style={{
                ...segButton,
                ...(d === selectedDuration ? segButtonActive : null),
              }}
              onClick={() => setSelectedDuration(d)}
            >
              {d}s
            </button>
          ))}
        </div>
        {best !== undefined && <p style={bestLine}>Best: {best} SPM</p>}
        <button
          type="button"
          style={primaryButton}
          onClick={() => startRace(selectedDuration)}
        >
          Start
        </button>
      </div>
    </div>
  )
}
