import type { CSSProperties, RefObject } from 'react'
import type { ConnectionStatus, PredictionEvent } from '../types'
import type { HandStatus } from '../hooks/useHandLandmarker'
import { SkeletonOverlay } from './SkeletonOverlay'

const fill: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
}

const readout: CSSProperties = {
  position: 'absolute',
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--sq-surface) 82%, transparent)',
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
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  landmarks: number[][] | null
  fps: number
  status: HandStatus
  event: PredictionEvent | null
  connection: ConnectionStatus
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
        : 'Starting camera…'

  const confidencePct = Math.round((event?.static_confidence ?? 0) * 100)

  return (
    <div className="w-full h-full" style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ ...fill, objectFit: 'cover', transform: 'scaleX(-1)' }}
      />

      <div style={{ ...fill, transform: 'scaleX(-1)', pointerEvents: 'none' }}>
        <SkeletonOverlay landmarks={landmarks} className="absolute inset-0" />
      </div>

      <div style={{ ...readout, top: 8, left: 8 }}>{fps} fps</div>

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
