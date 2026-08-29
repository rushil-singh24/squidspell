import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { computeFps, landmarksToArray } from '../lib/landmarks'

export type HandStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error'

const MAX_FRAME_TIMES = 60

export function useHandLandmarker(): {
  videoRef: RefObject<HTMLVideoElement | null>
  landmarks: number[][] | null
  fps: number
  status: HandStatus
  error: string | null
} {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [landmarks, setLandmarks] = useState<number[][] | null>(null)
  const [fps, setFps] = useState(0)
  const [status, setStatus] = useState<HandStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let rafId = 0
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null
    const frameTimes: number[] = []

    async function start() {
      setStatus('loading')

      try {
        const vision = await import('@mediapipe/tasks-vision')
        const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe')
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        })
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(String(err))
        return
      }

      if (cancelled) {
        landmarker?.close()
        return
      }

      try {
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
        await video.play()
      }
      if (cancelled) return
      setStatus('ready')

      const tick = () => {
        if (cancelled) return
        const v = videoRef.current
        if (v && v.readyState >= 2 && landmarker) {
          const result = landmarker.detectForVideo(v, performance.now())
          setLandmarks(landmarksToArray(result))
          frameTimes.push(performance.now())
          if (frameTimes.length > MAX_FRAME_TIMES) frameTimes.shift()
          setFps(computeFps(frameTimes, performance.now()))
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
      landmarker?.close()
    }
  }, [])

  return { videoRef, landmarks, fps, status, error }
}
