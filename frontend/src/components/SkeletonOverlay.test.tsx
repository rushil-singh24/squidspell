import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SkeletonOverlay } from './SkeletonOverlay'
import { drawSkeleton } from '../lib/landmarks'

vi.mock('../lib/landmarks', () => ({ drawSkeleton: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

describe('SkeletonOverlay', () => {
  it('draws the skeleton on every landmarks change', () => {
    const { rerender } = render(<SkeletonOverlay landmarks={null} />)
    expect(drawSkeleton).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
    )

    const hand = Array.from({ length: 21 }, () => [0.5, 0.5, 0])
    rerender(<SkeletonOverlay landmarks={hand} />)

    expect(drawSkeleton).toHaveBeenLastCalledWith(
      expect.anything(),
      hand,
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
    )
  })
})
