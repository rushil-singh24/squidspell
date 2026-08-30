import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModeToggle } from './ModeToggle'

describe('ModeToggle', () => {
  it('marks the active mode as selected', () => {
    render(<ModeToggle mode="train" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Train' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Race' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('calls onChange with the clicked mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModeToggle mode="train" onChange={onChange} />)
    await user.click(screen.getByRole('tab', { name: 'Race' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('race')
  })
})
