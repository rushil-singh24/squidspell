import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'

const HOLD_KEYS = new Set([' ', 'Enter'])

/**
 * Press-and-hold button with a fill indicator. Used for the destructive
 * "Clear transcript" action in Train mode: `onHoldComplete` fires exactly
 * once, only after the pointer / key has been held for `durationMs`. Any
 * release, leave, or cancel before completion aborts silently.
 */
export function HoldButton({
  onHoldComplete,
  durationMs = 1000,
  disabled = false,
  className,
  children,
}: {
  onHoldComplete: () => void
  durationMs?: number
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  const [progress, setProgress] = useState(0)

  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const holdingRef = useRef(false)
  const firedRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      holdingRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
      rafRef.current = null
      intervalRef.current = null
    }
  }, [])

  function stop() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    holdingRef.current = false
    startRef.current = null
  }

  function reset() {
    stop()
    firedRef.current = false
    if (mountedRef.current) setProgress(0)
  }

  // One tick of the progress loop. Returns true when the loop is finished
  // (completed or aborted) and must not be rescheduled.
  function frame(): boolean {
    if (!mountedRef.current || startRef.current === null) return true
    const p = Math.min(1, (performance.now() - startRef.current) / durationMs)
    setProgress(p)
    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true
        onHoldComplete()
      }
      stop()
      if (mountedRef.current) setProgress(0)
      return true
    }
    return false
  }

  function start() {
    if (disabled || holdingRef.current) return
    holdingRef.current = true
    firedRef.current = false
    startRef.current = performance.now()
    setProgress(0)
    if (reduce) {
      // Reduced motion: still enforce the timing, but step the fill coarsely
      // instead of tweening it every animation frame.
      intervalRef.current = setInterval(() => {
        frame()
      }, 100)
      return
    }
    const step = () => {
      if (!holdingRef.current) return
      if (frame()) return
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !HOLD_KEYS.has(e.key)) return
    if (e.key === ' ') e.preventDefault()
    if (!holdingRef.current) start()
  }

  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (!HOLD_KEYS.has(e.key)) return
    reset()
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      title="Press and hold to clear"
      onPointerDown={() => start()}
      onPointerUp={() => reset()}
      onPointerLeave={() => reset()}
      onPointerCancel={() => reset()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className={
        className
          ? `sq-hold-button ${className}`
          : 'sq-hold-button'
      }
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '0.5rem',
        padding: '0.5rem 0.75rem',
        fontSize: '0.875rem',
        lineHeight: 1.2,
        color: 'var(--sq-fg)',
        background: 'var(--sq-surface)',
        border: '1px solid var(--sq-border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          transform: `scaleX(${progress})`,
          transformOrigin: 'left',
          background: 'var(--sq-error)',
          opacity: progress > 0 ? 0.35 : 0,
          pointerEvents: 'none',
        }}
      />
      <span style={{ position: 'relative' }}>{children}</span>
    </button>
  )
}
