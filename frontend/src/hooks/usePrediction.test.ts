import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePrediction } from './usePrediction'

class FakeWS {
  static OPEN = 1
  static CLOSED = 3
  static last: FakeWS | null = null
  url: string
  readyState = 0
  bufferedAmount = 0
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

  it('exposes transcript from frames, retaining it when a frame carries null', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    expect(result.current.transcript).toBe('')

    act(() => FakeWS.last!._msg({ ...evt, transcript: 'HI' }))
    expect(result.current.transcript).toBe('HI')

    act(() => FakeWS.last!._msg({ ...evt, transcript: null }))
    expect(result.current.transcript).toBe('HI')
  })

  it('sendAction("clear") clears the local transcript with no frame', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    act(() => FakeWS.last!._msg({ ...evt, transcript: 'HI' }))
    expect(result.current.transcript).toBe('HI')

    act(() => result.current.sendAction('clear'))
    expect(result.current.transcript).toBe('')
  })

  it('loadTranscript sets the local transcript uppercased with no frame', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    act(() => result.current.loadTranscript('hi there'))
    expect(result.current.transcript).toBe('HI THERE')
  })

  it('clears the local transcript on a mode change', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())

    act(() => FakeWS.last!._msg({ ...evt, transcript: 'HI' }))
    expect(result.current.transcript).toBe('HI')

    act(() => result.current.setMode('race'))
    expect(result.current.transcript).toBe('')
  })

  it('exposes the race snapshot from frames, retaining it when a frame carries null', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    expect(result.current.race).toBeNull()

    const snap = {
      phase: 'running',
      target_word: 'cat',
      typed: 'c',
      word_index: 0,
      upcoming: [],
      correct_letters: 1,
      attempted_letters: 1,
      seconds_left: 12,
      spm: 20,
      results: null,
    }
    act(() => FakeWS.last!._msg({ ...evt, race: snap }))
    expect(result.current.race?.phase).toBe('running')
    expect(result.current.race?.typed).toBe('c')

    act(() => FakeWS.last!._msg({ ...evt, race: null }))
    expect(result.current.race?.phase).toBe('running')
    expect(result.current.race?.typed).toBe('c')
  })

  it('startRace and stopRace send through to the client', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    act(() => result.current.startRace(15))
    act(() => result.current.stopRace())
    const payloads = FakeWS.last!.sent.map((s) => JSON.parse(s))
    expect(payloads).toContainEqual({ race: 'start', duration: 15 })
    expect(payloads).toContainEqual({ race: 'stop' })
  })

  it('clears the race snapshot on a mode change', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    act(() =>
      FakeWS.last!._msg({
        ...evt,
        race: {
          phase: 'running',
          target_word: 'cat',
          typed: '',
          word_index: 0,
          upcoming: [],
          correct_letters: 0,
          attempted_letters: 0,
          seconds_left: 30,
          spm: 0,
          results: null,
        },
      }),
    )
    expect(result.current.race?.phase).toBe('running')

    act(() => result.current.setMode('train'))
    expect(result.current.race).toBeNull()
  })

  it('setMode and sendAction call through to the client', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())
    act(() => result.current.setMode('train'))
    act(() => result.current.sendAction('space'))
    const payloads = FakeWS.last!.sent.map((s) => JSON.parse(s))
    expect(payloads).toContainEqual({ mode: 'train' })
    expect(payloads).toContainEqual({ action: 'space' })
  })

  it('fires onCommit synchronously for commit events and stops after unsubscribe', () => {
    const { result } = renderHook(() => usePrediction('ws://test'))
    act(() => FakeWS.last!._open())

    const spy = vi.fn()
    let unsub: () => void = () => {}
    act(() => {
      unsub = result.current.onCommit(spy)
    })

    act(() => FakeWS.last!._msg({ ...evt, prediction: 'A', source: 'static', confidence: 0.9 }))
    expect(spy).toHaveBeenCalledWith('A', 'static', 0.9)

    spy.mockClear()
    act(() => FakeWS.last!._msg({ ...evt, prediction: null }))
    expect(spy).not.toHaveBeenCalled()

    act(() => unsub())
    act(() => FakeWS.last!._msg({ ...evt, prediction: 'B', source: 'static', confidence: 0.7 }))
    expect(spy).not.toHaveBeenCalled()
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
