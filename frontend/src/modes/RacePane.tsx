import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { RaceSnapshot } from '../types'
import type { Bests } from '../lib/raceStore'
import { loadBests, recordRaceResult } from '../lib/raceStore'
import { SquidMascot } from '../components/SquidMascot'
import { RaceWordStream } from './RaceWordStream'

const DURATIONS = [15, 30, 60]

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

const cancelledBanner: CSSProperties = {
  margin: 0,
  fontSize: '0.875rem',
  color: 'var(--sq-error)',
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

export function RacePane({
  race,
  startRace,
  stopRace,
  userId,
}: {
  race: RaceSnapshot | null
  startRace: (duration: number) => void
  stopRace: () => void
  userId: string | null
}) {
  const [selectedDuration, setSelectedDuration] = useState<number>(30)
  const [bests, setBests] = useState<Bests>({})
  const [dismissed, setDismissed] = useState(false)
  const [showCelebrate, setShowCelebrate] = useState(false)
  const [raceCancelled, setRaceCancelled] = useState(false)
  const finishedHandledRef = useRef(false)
  const prevPhase = useRef<string | undefined>(undefined)
  const expectingStop = useRef(false)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  useEffect(() => {
    let active = true
    loadBests(userId).then((b) => {
      // null = a signed-in Supabase read failed; keep current bests.
      if (active && b) setBests(b)
    })
    return () => {
      active = false
    }
  }, [userId])

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
      const r = race.results
      setShowCelebrate(true)
      // Read userId from the ref, not the deps array: this effect is keyed on
      // race phase/results, not userId, so adding userId to the deps would
      // re-run the whole finished-handler on a sign-in/out identity change.
      const uid = userIdRef.current
      void recordRaceResult(uid, {
        duration_s: selectedDuration,
        spm: r.spm,
        accuracy: r.accuracy,
        consistency: r.consistency,
      }).then(
        (next) => {
          // null = a signed-in Supabase write/re-read failed; keep current bests.
          if (next && uid === userIdRef.current) setBests(next)
        },
        // recordRaceResult now rejects on a Supabase error. A failed best-write
        // is non-critical — swallow it so it doesn't become an unhandled
        // promise rejection / crash the finished-race screen.
        () => {},
      )
    }
  }, [race?.phase, race?.results, selectedDuration])

  // Surface a mid-race socket drop: the server rebuilds a fresh idle RaceState
  // on reconnect, so `race` snaps running -> idle/null with no local Stop.
  useEffect(() => {
    const phase = race?.phase
    if (phase === 'running') setRaceCancelled(false)
    if (
      prevPhase.current === 'running' &&
      phase !== 'running' &&
      phase !== 'finished' &&
      !expectingStop.current
    ) {
      setRaceCancelled(true)
    }
    expectingStop.current = false
    prevPhase.current = phase
  }, [race?.phase])

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
        <button
          type="button"
          style={linkButton}
          onClick={() => {
            expectingStop.current = true
            stopRace()
          }}
        >
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
              <span style={statValue}>
                {r.consistency == null ? '—' : Math.round(r.consistency)}
              </span>
              <span style={statLabel}>Consistency</span>
            </div>
          </div>
          <button
            type="button"
            style={primaryButton}
            onClick={() => {
              expectingStop.current = true
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
        {raceCancelled && (
          <p style={cancelledBanner}>Connection dropped — race cancelled.</p>
        )}
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
        {userId != null && best !== undefined && (
          <p style={bestLine}>Best: {best} SPM</p>
        )}
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
