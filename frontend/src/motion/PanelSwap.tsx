import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { crossfade } from './index'

export function PanelSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce)
    return (
      <div key={swapKey} style={{ height: '100%' }}>
        {children}
      </div>
    )
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={swapKey}
        variants={crossfade}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
