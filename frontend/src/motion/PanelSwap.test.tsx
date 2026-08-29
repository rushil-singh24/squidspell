import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelSwap } from './PanelSwap'

describe('PanelSwap', () => {
  it('renders its children for a given swapKey', () => {
    render(<PanelSwap swapKey="a">panel a</PanelSwap>)
    expect(screen.getByText('panel a')).toBeInTheDocument()
  })
})
