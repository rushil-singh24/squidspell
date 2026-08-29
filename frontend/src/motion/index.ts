import type { Transition, Variants } from 'framer-motion'

// `satisfies` keeps the narrow literal type (so `spring.stiffness` is reachable for
// consumers/tests) while still checking assignability to framer-motion's `Transition`.
export const spring = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 0.9,
} satisfies Transition
export const quickSpring = {
  type: 'spring',
  stiffness: 520,
  damping: 32,
  mass: 0.7,
} satisfies Transition

export const fadeSlide: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

export const crossfade: Variants = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0, transition: spring },
  exit: { opacity: 0, x: -10, transition: { duration: 0.14 } },
}

export const commitPop: Variants = {
  initial: { scale: 0.7, opacity: 0 },
  animate: { scale: [0.7, 1.12, 1], opacity: 1, transition: { ...quickSpring, duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

export const pressable = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.96 },
  transition: quickSpring,
} as const
