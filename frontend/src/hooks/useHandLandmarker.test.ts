import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { HandLandmarker } from '@mediapipe/tasks-vision'

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

    const onFrame = vi.fn()
    const { result } = renderHook(() => useHandLandmarker(onFrame))
    result.current.videoRef.current = document.createElement('video')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(result.current.landmarks).toHaveLength(21))

    const lm = result.current.landmarks!
    expect(lm[5][0]).toBeCloseTo(5 / 21)
    expect(lm[5][1]).toBeCloseTo(5 / 21)
    expect(lm[5][2]).toBe(0)

    await waitFor(() => expect(onFrame).toHaveBeenCalled())
    const arg = onFrame.mock.calls[0][0] as number[][]
    expect(arg).toHaveLength(21)
    expect(arg[0]).toHaveLength(3)
  })

  it('pauses on setEnabled(false) and re-acquires the camera on setEnabled(true)', async () => {
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream)

    const onFrame = vi.fn()
    const { result } = renderHook(() => useHandLandmarker(onFrame))
    result.current.videoRef.current = document.createElement('video')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(result.current.landmarks).toHaveLength(21))
    const callsBeforePause = getUserMedia.mock.calls.length

    act(() => result.current.setEnabled(false))

    await waitFor(() => expect(result.current.status).toBe('paused'))
    expect(result.current.landmarks).toBeNull()
    expect(onFrame.mock.calls.at(-1)![0]).toBeNull()

    act(() => result.current.setEnabled(true))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(getUserMedia.mock.calls.length).toBeGreaterThan(callsBeforePause)
  })

  it('maps a NotAllowedError from getUserMedia to denied', async () => {
    getUserMedia.mockRejectedValue({ name: 'NotAllowedError' })

    const { result } = renderHook(() => useHandLandmarker())

    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  it('a detectForVideo throw on the first tick does not immediately error the hook', async () => {
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream)
    vi.mocked(HandLandmarker.createFromOptions).mockResolvedValueOnce({
      detectForVideo: () => {
        throw new Error('detect boom')
      },
      close: vi.fn(),
    } as never)

    const rafSpy = vi.fn((cb: FrameRequestCallback) => {
      if (rafSpy.mock.calls.length === 1) cb(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', rafSpy)

    const { result } = renderHook(() => useHandLandmarker())
    result.current.videoRef.current = document.createElement('video')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(rafSpy.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(result.current.status).toBe('ready')
  })
})
