import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { commitPop } from './index'

export function CommitPop({ trigger, children }: { trigger: string | number; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <span>{children}</span>
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={trigger}
        variants={commitPop}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ display: 'inline-block' }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}
