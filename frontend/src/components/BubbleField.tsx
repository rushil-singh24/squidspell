import { useMemo } from 'react'
import { useReducedMotion } from 'framer-motion'

const rand = (min: number, max: number) => min + Math.random() * (max - min)

export function BubbleField({ count = 14 }: { count?: number }) {
  const reduce = useReducedMotion()

  const bubbles = useMemo(
    () =>
      Array.from({ length: count }, (_unused, i) => {
        const size = `${rand(6, 18)}px`
        return {
          id: `bubble-${i}`,
          style: {
            left: `${rand(0, 100)}%`,
            width: size,
            height: size,
            animationDelay: `${rand(0, 20)}s`,
            animationDuration: `${rand(12, 26)}s`,
          },
        }
      }),
    [count],
  )

  if (reduce) return null

  return (
    <div
      className="sq-bubble-field"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {bubbles.map((b) => (
        <span key={b.id} className="sq-bubble" style={b.style} />
      ))}
    </div>
  )
}
