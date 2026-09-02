import type { CSSProperties, RefObject } from 'react'
import type { ConnectionStatus, PredictionEvent } from '../types'
import type { HandStatus } from '../hooks/useHandLandmarker'
import { SkeletonOverlay } from './SkeletonOverlay'

const stage: CSSProperties = {
  position: 'absolute',
  inset: 0,
  margin: 'auto',
  aspectRatio: '4 / 3',
  maxWidth: '100%',
  maxHeight: '100%',
}

const readout: CSSProperties = {
  position: 'absolute',
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--sq-surface) 80%, transparent)',
  color: 'var(--sq-fg-muted)',
  lineHeight: 1.4,
}

export function WebcamPane({
  videoRef,
  landmarks,
  fps,
  status,
  event,
  connection,
  enabled,
  onToggleCamera,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  landmarks: number[][] | null
  fps: number
  status: HandStatus
  event: PredictionEvent | null
  connection: ConnectionStatus
  enabled: boolean
  onToggleCamera: () => void
}) {
  const dotColor =
    connection === 'open'
      ? 'var(--sq-accent)'
      : connection === 'error' || connection === 'closed'
        ? 'var(--sq-error)'
        : 'var(--sq-fg-muted)'

  const hint =
    status === 'denied'
      ? 'Allow camera access'
      : status === 'error'
        ? 'Camera error'
        : status === 'paused'
          ? 'Camera off'
          : 'Starting camera…'

  const confidencePct = Math.round((event?.static_confidence ?? 0) * 100)

  return (
    <div className="w-full h-full" style={{ position: 'relative' }}>
      <div style={stage}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: 'scaleX(-1)',
            pointerEvents: 'none',
          }}
        >
          <SkeletonOverlay landmarks={landmarks} />
        </div>
      </div>

      <div style={{ ...readout, top: 8, left: 8 }}>{fps} fps</div>

      <button
        type="button"
        aria-label={enabled ? 'Turn camera off' : 'Turn camera on'}
        onClick={onToggleCamera}
        style={{
          ...readout,
          top: 34,
          left: 8,
          cursor: 'pointer',
          border: '1px solid var(--sq-border)',
        }}
      >
        {enabled ? 'Camera on' : 'Turn on'}
      </button>

      <div
        style={{
          ...readout,
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ color: dotColor }}>●</span>
        <span>{connection}</span>
      </div>

      <div
        style={{
          ...readout,
          bottom: 8,
          left: 8,
          minWidth: 96,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {status !== 'ready' ? (
          <span>{hint}</span>
        ) : (
          <>
            <span style={{ fontSize: 18, color: 'var(--sq-fg)', lineHeight: 1 }}>
              {event?.static_label ?? '–'}
            </span>
            <div
              style={{
                height: 3,
                borderRadius: 9999,
                background: 'var(--sq-border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${confidencePct}%`,
                  background: 'var(--sq-accent)',
                }}
              />
            </div>
            {event?.motion_active && (
              <span
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 9999,
                  background: 'var(--sq-accent-dim)',
                  color: 'var(--sq-bg-deep)',
                }}
              >
                MOTION…
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
