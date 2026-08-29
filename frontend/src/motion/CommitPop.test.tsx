import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommitPop } from './CommitPop'

describe('CommitPop', () => {
  it('renders its children for a given trigger', () => {
    render(<CommitPop trigger={1}>pop me</CommitPop>)
    expect(screen.getByText('pop me')).toBeInTheDocument()
  })
})
