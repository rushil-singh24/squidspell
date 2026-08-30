import { useEffect, useRef } from 'react'
import { drawSkeleton } from '../lib/landmarks'

export function SkeletonOverlay({
  landmarks,
  className,
}: {
  landmarks: number[][] | null
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const color =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--sq-accent')
        .trim() || '#35e0c7'
    drawSkeleton(ctx, landmarks, canvas.width, canvas.height, color)
  }, [landmarks])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={640}
      height={480}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
