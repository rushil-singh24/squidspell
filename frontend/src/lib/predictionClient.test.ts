import { describe, it, expect, vi } from 'vitest'
import { PredictionClient } from './predictionClient'

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
  prediction: 'A',
  confidence: 0.9,
  source: 'static',
  static_label: 'A',
  static_confidence: 0.9,
  motion_active: false,
  fps: 30,
  timestamp: 1,
  client_timestamp: null,
}

describe('PredictionClient', () => {
  it('reports status open then delivers frames', () => {
    const frames: unknown[] = []
    const statuses: string[] = []
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.onFrame((e) => frames.push(e))
    c.onStatus((s) => statuses.push(s))
    c.connect()
    FakeWS.last!._open()
    FakeWS.last!._msg(evt)
    expect(statuses).toContain('connecting')
    expect(statuses).toContain('open')
    expect(frames).toEqual([evt])
  })

  it('send wraps landmarks with a timestamp only when open', () => {
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.connect()
    c.send([[0, 0, 0]]) // not open yet -> dropped
    FakeWS.last!._open()
    c.send([[1, 2, 3]])
    c.send(null)
    expect(FakeWS.last!.sent).toHaveLength(2)
    const first = JSON.parse(FakeWS.last!.sent[0])
    expect(first.landmarks).toEqual([[1, 2, 3]])
    expect(typeof first.t).toBe('number')
    expect(JSON.parse(FakeWS.last!.sent[1]).landmarks).toBeNull()
  })

  it('routes an {error} message to onError, not onFrame', () => {
    const errs: string[] = []
    const frames: unknown[] = []
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.onError((m) => errs.push(m))
    c.onFrame((e) => frames.push(e))
    c.connect()
    FakeWS.last!._open()
    FakeWS.last!._msg({ error: 'invalid landmarks', timestamp: 2 })
    expect(errs).toEqual(['invalid landmarks'])
    expect(frames).toEqual([])
  })

  it('reconnects after an unexpected close, backing off', () => {
    vi.useFakeTimers()
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never, backoff: [100, 200] })
    c.connect()
    const first = FakeWS.last!
    first._open()
    first.readyState = FakeWS.CLOSED
    first.onclose?.({ code: 1006 }) // unexpected
    vi.advanceTimersByTime(100)
    expect(FakeWS.last).not.toBe(first) // a new socket was created
    c.close()
    vi.useRealTimers()
  })

  it('close() clears listeners so a late onclose cannot emit status', () => {
    const statuses: string[] = []
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never })
    c.connect()
    FakeWS.last!._open()
    c.onStatus((s) => statuses.push(s))
    const sock = FakeWS.last!
    c.close()
    statuses.length = 0
    sock.onclose?.({ code: 1006 })
    expect(statuses).not.toContain('closed')
    expect(statuses).toEqual([])
  })

  it('close() stops further reconnects', () => {
    vi.useFakeTimers()
    const c = new PredictionClient('ws://x', { WebSocketCtor: FakeWS as never, backoff: [100] })
    c.connect()
    FakeWS.last!._open()
    c.close()
    const afterClose = FakeWS.last
    afterClose!.onclose?.({ code: 1006 })
    vi.advanceTimersByTime(1000)
    expect(FakeWS.last).toBe(afterClose) // no new socket
    vi.useRealTimers()
  })
})
