import { useEffect, useState } from 'react'
import { useHandLandmarker } from '../hooks/useHandLandmarker'
import { usePrediction } from '../hooks/usePrediction'
import { WebcamPane } from './WebcamPane'
import { ModeToggle } from './ModeToggle'
import { ThemeToggle } from './ThemeToggle'
import { PanelSwap } from '../motion/PanelSwap'
import { TrainPane } from '../modes/TrainPane'
import { RacePane } from '../modes/RacePane'
import type { Mode } from '../types'

export function AppShell() {
  const [mode, setMode] = useState<Mode>('train')
  const prediction = usePrediction()
  const hand = useHandLandmarker(prediction.sendLandmarks)
  const [dismissedError, setDismissedError] = useState<string | null>(null)

  useEffect(() => {
    prediction.setMode(mode)
  }, [mode, prediction.setMode])

  const showError =
    prediction.lastError !== null && prediction.lastError !== dismissedError

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <WebcamPane
          videoRef={hand.videoRef}
          landmarks={hand.landmarks}
          fps={hand.fps}
          status={hand.status}
          event={prediction.lastEvent}
          connection={prediction.status}
        />
      </div>

      <div
        style={{
          width: 420,
          maxWidth: '45vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: 20,
          borderLeft: '1px solid var(--sq-border)',
          background: 'var(--sq-bg)',
        }}
      >
        <ModeToggle mode={mode} onChange={setMode} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <PanelSwap swapKey={mode}>
            {mode === 'train' ? (
              <TrainPane
                transcript={prediction.transcript}
                onAction={prediction.sendAction}
              />
            ) : (
              <RacePane
                race={prediction.race}
                startRace={prediction.startRace}
                stopRace={prediction.stopRace}
              />
            )}
          </PanelSwap>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <ThemeToggle />
      </div>

      {showError && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            borderRadius: 8,
            background: 'var(--sq-error)',
            color: 'var(--sq-bg-deep)',
            fontSize: 14,
            zIndex: 20,
          }}
        >
          <span>{prediction.lastError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setDismissedError(prediction.lastError)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
