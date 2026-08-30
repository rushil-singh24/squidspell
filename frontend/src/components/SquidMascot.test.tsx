import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SquidMascot } from './SquidMascot'

describe('SquidMascot', () => {
  it('renders an accessible img for the idle mood', () => {
    render(<SquidMascot mood="idle" />)
    const img = screen.getByRole('img')
    expect(img.tagName.toLowerCase()).toBe('svg')
    expect(img.getAttribute('aria-label')).toMatch(/squid/i)
  })

  it('labels the sleeping mood as asleep', () => {
    render(<SquidMascot mood="sleeping" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /asleep|sleeping/i,
    )
  })

  it('labels the celebrate mood as celebrating', () => {
    render(<SquidMascot mood="celebrate" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /celebrat/i,
    )
  })

  it('honours a custom size', () => {
    render(<SquidMascot mood="idle" size={64} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('width')).toBe('64')
    expect(img.getAttribute('height')).toBe('64')
  })
})
