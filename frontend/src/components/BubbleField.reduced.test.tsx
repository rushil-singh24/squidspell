import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BubbleField } from './BubbleField'

// Stub matchMedia BEFORE the first render so framer-motion's one-shot
// `initPrefersReducedMotion()` reads "reduce" and `useReducedMotion()` returns true.
window.matchMedia = ((query: string) => ({
  matches: query.includes('reduced-motion'),
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

describe('BubbleField (prefers-reduced-motion)', () => {
  it('renders nothing', () => {
    const { container } = render(<BubbleField count={5} />)
    expect(container.querySelectorAll('.sq-bubble')).toHaveLength(0)
    expect(container.firstChild).toBeNull()
  })
})
