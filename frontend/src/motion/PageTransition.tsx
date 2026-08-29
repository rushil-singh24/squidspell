import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { fadeSlide } from './index'

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <div>{children}</div>
  return (
    <motion.div variants={fadeSlide} initial="initial" animate="animate" style={{ height: '100%' }}>
      {children}
    </motion.div>
  )
}
