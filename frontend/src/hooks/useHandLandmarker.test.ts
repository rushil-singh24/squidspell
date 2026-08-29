import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  HandLandmarker: {
    createFromOptions: vi.fn().mockResolvedValue({
      detectForVideo: () => ({
        landmarks: [Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: i / 21, z: 0 }))],
      }),
      close: vi.fn(),
    }),
  },
}))

import { useHandLandmarker } from './useHandLandmarker'

const getUserMedia = vi.fn()

beforeEach(() => {
  getUserMedia.mockReset()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 4,
  })
  let ran = false
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (!ran) {
      ran = true
      cb(0)
    }
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useHandLandmarker', () => {
  it('reaches ready and populates landmarks from a mocked detectForVideo', async () => {
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream)

    const { result } = renderHook(() => useHandLandmarker())
    result.current.videoRef.current = document.createElement('video')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(result.current.landmarks).toHaveLength(21))

    const lm = result.current.landmarks!
    expect(lm[5][0]).toBeCloseTo(5 / 21)
    expect(lm[5][1]).toBeCloseTo(5 / 21)
    expect(lm[5][2]).toBe(0)
  })

  it('maps a NotAllowedError from getUserMedia to denied', async () => {
    getUserMedia.mockRejectedValue({ name: 'NotAllowedError' })

    const { result } = renderHook(() => useHandLandmarker())

    await waitFor(() => expect(result.current.status).toBe('denied'))
  })
})
