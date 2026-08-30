import type { ConnectionStatus, PredictionEvent } from '../types'

type WSCtor = { new (url: string): WebSocket }

export class PredictionClient {
  private readonly url: string
  private readonly WSCtor: WSCtor
  private readonly backoff: number[]
  private ws: WebSocket | null = null
  private stopped = false
  private attempt = 0
  private mode: 'train' | 'race' | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private frameCbs: ((e: PredictionEvent) => void)[] = []
  private errorCbs: ((msg: string) => void)[] = []
  private statusCbs: ((s: ConnectionStatus) => void)[] = []

  constructor(url: string, opts: { WebSocketCtor?: WSCtor; backoff?: number[] } = {}) {
    this.url = url
    this.WSCtor = opts.WebSocketCtor ?? (globalThis.WebSocket as unknown as WSCtor)
    this.backoff = opts.backoff ?? [500, 1000, 2000, 5000]
  }

  onFrame(cb: (e: PredictionEvent) => void) {
    this.frameCbs.push(cb)
  }
  onError(cb: (msg: string) => void) {
    this.errorCbs.push(cb)
  }
  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusCbs.push(cb)
  }

  private emitStatus(s: ConnectionStatus) {
    for (const cb of this.statusCbs) cb(s)
  }

  connect() {
    this.stopped = false
    this.emitStatus('connecting')
    const ws = new this.WSCtor(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.attempt = 0
      this.emitStatus('open')
      if (this.mode !== null) this.rawSend({ mode: this.mode })
    }
    ws.onmessage = (ev: MessageEvent) => {
      let data: unknown
      try {
        data = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (data && typeof data === 'object' && 'error' in data) {
        const msg = String((data as { error: unknown }).error)
        for (const cb of this.errorCbs) cb(msg)
        return
      }
      for (const cb of this.frameCbs) cb(data as PredictionEvent)
    }
    ws.onerror = () => this.emitStatus('error')
    ws.onclose = () => {
      this.emitStatus('closed')
      if (this.stopped) return
      const wait = this.backoff[Math.min(this.attempt, this.backoff.length - 1)]
      this.attempt += 1
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        if (!this.stopped) this.connect()
      }, wait)
    }
  }

  private rawSend(payload: unknown): void {
    const ws = this.ws
    if (!ws || ws.readyState !== 1 /* OPEN */) return
    if (ws.bufferedAmount > 65536) return // backend stalled — drop this frame
    ws.send(JSON.stringify(payload))
  }

  send(landmarks: number[][] | null) {
    this.rawSend({ landmarks, t: Date.now() })
  }

  setMode(mode: 'train' | 'race' | null): void {
    this.mode = mode
    this.rawSend({ mode })
  }

  sendAction(action: 'delete' | 'space' | 'clear'): void {
    this.rawSend({ action })
  }

  close() {
    this.stopped = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.frameCbs = []
    this.errorCbs = []
    this.statusCbs = []
    this.ws?.close()
  }
}
