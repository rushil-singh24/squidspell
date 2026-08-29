import { describe, it, expect } from 'vitest'
import { HAND_CONNECTIONS, computeFps, landmarksToArray, drawSkeleton } from './landmarks'

describe('landmarks helpers', () => {
  it('HAND_CONNECTIONS is 21 bones covering all fingers', () => {
    expect(HAND_CONNECTIONS.length).toBeGreaterThanOrEqual(20)
    for (const [a, b] of HAND_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(21)
    }
  })
  it('computeFps returns 0 for <2 samples and a rate otherwise', () => {
    expect(computeFps([], 1000)).toBe(0)
    expect(computeFps([1000], 1000)).toBe(0)
    expect(computeFps([0, 100, 200, 300, 400], 400)).toBe(10) // 4 gaps over 0.4s
  })
  it('computeFps drops samples outside the window', () => {
    // in-window = [5000, 5100, 5200], 2 gaps over 0.2s -> round(2 / 0.2) = 10
    expect(computeFps([0, 5000, 5100, 5200], 5200, 1000)).toBe(10)
  })
  it('landmarksToArray flattens the first hand or returns null', () => {
    expect(landmarksToArray({ landmarks: [] } as never)).toBeNull()
    const one = { landmarks: [Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: i / 21, z: 0 }))] }
    const out = landmarksToArray(one as never)!
    expect(out).toHaveLength(21)
    expect(out[5]).toEqual([5 / 21, 5 / 21, 0])
  })
  it('drawSkeleton is a no-op for null and draws for real landmarks', () => {
    const calls: string[] = []
    const ctx = new Proxy(
      {},
      {
        get: (_t, p) =>
          typeof p === 'string' && p.endsWith('Style') ? '' : () => calls.push(String(p)),
      },
    ) as unknown as CanvasRenderingContext2D
    drawSkeleton(ctx, null, 100, 100, '#fff')
    expect(calls).toEqual([])
    drawSkeleton(ctx, Array.from({ length: 21 }, () => [0.5, 0.5, 0]), 100, 100, '#fff')
    expect(calls).toContain('beginPath')
    expect(calls).toContain('stroke')
  })
})
