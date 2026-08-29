import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePrediction } from './usePrediction'

class FakeWS {
  static OPEN = 1
  static CLOSED = 3
  static last: FakeWS | null = null
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    FakeWS.last = this
  }
  send(d: string) {
    this.sent.push(d)
  }
  close() {
    this.readyState = FakeWS.CLOSED
    this.onclose?.({ code: 1000 })
  }
  _open() {
    this.readyState = FakeWS.OPEN
    this.onopen?.()
  }
  _msg(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
}

const evt = {
  prediction: 'B',
  confidence: 0.8,
  source: 'static',
  static_label: 'B',
  static_confidence: 0.8,
  motion_active: false,
  fps: 24,
  timestamp: 5,
  client_timestamp: null,
}

const realWS = globalThis.WebSocket

beforeEach(() => {
  FakeWS.last = null
  globalThis.WebSocket = FakeWS as never
})

afterEach(() => {
  globalThis.WebSocket = realWS
  vi.restoreAllMocks()
})

describe('usePrediction', () => {
  it('reaches open status and surfaces frames + errors', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    expect(result.current.status).toBe('connecting')

    act(() => FakeWS.last!._open())
    expect(result.current.status).toBe('open')

    act(() => FakeWS.last!._msg(evt))
    expect(result.current.lastEvent).toEqual(evt)

    act(() => FakeWS.last!._msg({ error: 'bad frame', timestamp: 6 }))
    expect(result.current.lastError).toBe('bad frame')
  })

  it('sendLandmarks forwards to the client when open', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    act(() => result.current.sendLandmarks([[1, 2, 3]]))
    expect(FakeWS.last!.sent).toHaveLength(1)
    expect(JSON.parse(FakeWS.last!.sent[0]).landmarks).toEqual([[1, 2, 3]])
  })

  it('closes the socket on unmount without reconnecting', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => usePrediction('ws://test'))
    const sock = FakeWS.last!
    act(() => sock._open())
    unmount()
    expect(sock.readyState).toBe(FakeWS.CLOSED)
    act(() => sock.onclose?.({ code: 1006 }))
    vi.advanceTimersByTime(10000)
    expect(FakeWS.last).toBe(sock)
    vi.useRealTimers()
  })
})
