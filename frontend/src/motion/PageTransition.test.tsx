import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageTransition } from './PageTransition'

describe('PageTransition', () => {
  it('renders its children', () => {
    render(<PageTransition>hello page</PageTransition>)
    expect(screen.getByText('hello page')).toBeInTheDocument()
  })
})
