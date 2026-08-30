import { motion, useReducedMotion } from 'framer-motion'

type Mood = 'idle' | 'celebrate' | 'sleeping'

const LABELS: Record<Mood, string> = {
  idle: 'squid mascot, idle',
  celebrate: 'squid mascot, celebrating',
  sleeping: 'squid mascot, asleep',
}

export function SquidMascot({
  mood,
  size = 120,
  className,
}: {
  mood: Mood
  size?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  const eyes =
    mood === 'sleeping' ? (
      <>
        <path
          d="M38 52 q8 7 16 0"
          fill="none"
          stroke="var(--sq-accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M66 52 q8 7 16 0"
          fill="none"
          stroke="var(--sq-accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    ) : (
      <>
        <circle cx="46" cy="52" r="9" fill="#ffffff" />
        <circle cx="74" cy="52" r="9" fill="#ffffff" />
        <circle cx="48" cy="54" r="4" fill="var(--sq-bg-deep)" />
        <circle cx="76" cy="54" r="4" fill="var(--sq-bg-deep)" />
      </>
    )

  const svg = (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={LABELS[mood]}
      className={className}
    >
      {/* mantle / head */}
      <path
        d="M60 8 C39 8 25 25 25 47 C25 66 30 78 35 86 L85 86 C90 78 95 66 95 47 C95 25 81 8 60 8 Z"
        fill="currentColor"
      />
      {/* accent crest */}
      <circle cx="60" cy="20" r="5" fill="var(--sq-accent)" />
      <circle cx="44" cy="26" r="3" fill="var(--sq-accent)" opacity="0.7" />
      <circle cx="76" cy="26" r="3" fill="var(--sq-accent)" opacity="0.7" />
      {/* tentacles */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      >
        <path d="M34 84 q-7 12 1 22 q6 8 -1 16" />
        <path d="M44 86 q-4 14 2 26 q4 8 -2 14" />
        <path d="M54 87 q-2 15 1 28 q2 6 -1 12" />
        <path d="M66 87 q2 15 -1 28 q-2 6 1 12" />
        <path d="M76 86 q4 14 -2 26 q-4 8 2 14" />
        <path d="M86 84 q7 12 -1 22 q-6 8 1 16" />
      </g>
      {eyes}
      {mood === 'sleeping' && (
        <text
          x="82"
          y="30"
          fontSize="15"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="var(--sq-accent)"
        >
          z
        </text>
      )}
    </svg>
  )

  if (reduce || mood === 'sleeping') return svg

  if (mood === 'celebrate') {
    return (
      <motion.div
        style={{ display: 'inline-block', lineHeight: 0 }}
        animate={{ y: [0, -14, 0, -8, 0], rotate: [0, -6, 6, -3, 0] }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      >
        {svg}
      </motion.div>
    )
  }

  return (
    <motion.div
      style={{ display: 'inline-block', lineHeight: 0 }}
      animate={{ y: [0, -6, 0] }}
      transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
    >
      {svg}
    </motion.div>
  )
}
