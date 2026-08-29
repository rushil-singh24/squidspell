import { describe, it, expect } from 'vitest'
import { spring, fadeSlide, crossfade, commitPop, pressable } from './index'

describe('motion primitives', () => {
  it('spring is a spring transition', () => {
    expect(spring.type).toBe('spring')
    expect(typeof spring.stiffness).toBe('number')
  })
  it('variants expose initial/animate/exit', () => {
    for (const v of [fadeSlide, crossfade, commitPop]) {
      expect(v).toHaveProperty('initial')
      expect(v).toHaveProperty('animate')
      expect(v).toHaveProperty('exit')
    }
  })
  it('commitPop animate scale settles at 1', () => {
    const a = commitPop.animate as { scale: number | number[] }
    const s = Array.isArray(a.scale) ? a.scale[a.scale.length - 1] : a.scale
    expect(s).toBe(1)
  })
  it('pressable has whileTap', () => {
    expect(pressable).toHaveProperty('whileTap')
  })
})
