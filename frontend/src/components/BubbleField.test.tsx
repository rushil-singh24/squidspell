import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BubbleField } from './BubbleField'

// Note: framer-motion's `useReducedMotion` caches the match result once per
// module registry, so the prefers-reduced-motion case lives in its own file
// (`BubbleField.reduced.test.tsx`) where matchMedia is stubbed before first render.

describe('BubbleField', () => {
  it('renders `count` drifting bubbles', () => {
    const { container } = render(<BubbleField count={5} />)
    expect(container.querySelectorAll('.sq-bubble')).toHaveLength(5)
  })

  it('defaults to 14 bubbles', () => {
    const { container } = render(<BubbleField />)
    expect(container.querySelectorAll('.sq-bubble')).toHaveLength(14)
  })

  it('gives each bubble randomised inline animation timing', () => {
    const { container } = render(<BubbleField count={6} />)
    const bubbles = Array.from(
      container.querySelectorAll<HTMLElement>('.sq-bubble'),
    )
    for (const b of bubbles) {
      expect(b.style.left).toMatch(/%$/)
      expect(b.style.width).toBe(b.style.height)
      expect(b.style.animationDelay).toMatch(/s$/)
      expect(b.style.animationDuration).toMatch(/s$/)
    }
  })
})
