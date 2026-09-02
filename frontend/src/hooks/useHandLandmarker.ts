import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { computeFps, landmarksToArray } from '../lib/landmarks'

export type HandStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error' | 'paused'

const MAX_FRAME_TIMES = 60

export function useHandLandmarker(
  onFrame?: (landmarks: number[][] | null) => void,
): {
  videoRef: RefObject<HTMLVideoElement | null>
  landmarks: number[][] | null
  fps: number
  status: HandStatus
  error: string | null
  enabled: boolean
  setEnabled: (v: boolean) => void
} {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const [landmarks, setLandmarks] = useState<number[][] | null>(null)
  const [fps, setFps] = useState(0)
  const [status, setStatus] = useState<HandStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  // Bumped once the one-time landmarker load finishes, so the camera effect
  // (which may have bailed early while the landmarker was still loading) re-runs.
  const [landmarkerReady, setLandmarkerReady] = useState(0)

  // Effect A: create the HandLandmarker exactly once and keep it in a ref.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const base = import.meta.env.BASE_URL ?? '/'
        const vision = await import('@mediapipe/tasks-vision')
        const fileset = await vision.FilesetResolver.forVisionTasks(base + 'mediapipe')
        const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task' },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) {
          landmarker.close()
          return
        }
        landmarkerRef.current = landmarker
        setLandmarkerReady((n) => n + 1)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(String(err))
      }
    }

    void load()

    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  // Effect B: acquire the camera + run the detect loop while `enabled`.
  useEffect(() => {
    if (!enabled) {
      setStatus('paused')
      setLandmarks(null)
      onFrameRef.current?.(null) // clear downstream prediction state
      setFps(0)
      return
    }

    const landmarker = landmarkerRef.current
    if (!landmarker) {
      // Effect A will bump `landmarkerReady` and this effect will re-run.
      setStatus('loading')
      return
    }

    let cancelled = false
    let rafId = 0
    let stream: MediaStream | null = null
    const frameTimes: number[] = []
    // Captured for the cleanup: the <video> element is stable for the
    // component's lifetime, so reading it here (rather than in cleanup) is safe.
    const videoEl = videoRef.current

    async function start() {
      try {
        // A second getUserMedia call after a previous grant does NOT re-prompt.
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      } catch (err) {
        if (cancelled) return
        const name =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: unknown }).name)
            : ''
        if (name === 'NotAllowedError') {
          setStatus('denied')
        } else {
          setStatus('error')
          setError(String(err))
        }
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        try {
          await video.play()
        } catch (err) {
          // AbortError here is the StrictMode double-mount aborting the first play —
          // benign, and `cancelled` is already true in that case. A real autoplay
          // rejection is not.
          if (!cancelled) {
            setStatus('error')
            setError(String(err))
          }
          return
        }
      }
      if (cancelled) return
      setStatus('ready')

      let lastVideoTime = -1
      let lastFpsAt = 0
      let failStreak = 0

      const tick = () => {
        if (cancelled) return
        const v = videoRef.current
        if (v && v.readyState >= 2 && landmarker && v.currentTime !== lastVideoTime) {
          lastVideoTime = v.currentTime
          try {
            const result = landmarker.detectForVideo(v, performance.now())
            const lm = landmarksToArray(result)
            failStreak = 0
            if (!cancelled) setLandmarks(lm)
            onFrameRef.current?.(lm) // send EVERY camera frame, incl. null
            const now = performance.now()
            frameTimes.push(now)
            while (frameTimes.length > MAX_FRAME_TIMES) frameTimes.shift()
            if (now - lastFpsAt > 250) {
              lastFpsAt = now
              if (!cancelled) setFps(computeFps(frameTimes, now))
            }
          } catch (err) {
            failStreak += 1
            if (failStreak > 30) {
              if (!cancelled) {
                setStatus('error')
                setError(String(err))
              }
              return
            }
          }
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
      if (videoEl) videoEl.srcObject = null
    }
  }, [enabled, landmarkerReady])

  return { videoRef, landmarks, fps, status, error, enabled, setEnabled }
}
