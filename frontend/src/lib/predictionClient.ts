import type { ConnectionStatus, PredictionEvent, TranscriptAction } from '../types'

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
  // Cap the landmark send rate. The browser produces ~30 fps but a free-tier
  // backend processes fewer, so unthrottled sends pile up and the committed
  // letter ends up reflecting a frame from a second or two ago. ~15 fps keeps
  // the server current; the smoother's stability timer is wall-clock, not
  // frame-count, so a lower rate doesn't change how long a hold must last.
  private lastLandmarkSentAt = 0
  private static readonly MIN_SEND_INTERVAL_MS = 66

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

  private rawSend(payload: unknown): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== 1 /* OPEN */) return false
    if (ws.bufferedAmount > 16384) return false // backend behind — drop rather than queue a backlog
    ws.send(JSON.stringify(payload))
    return true
  }

  send(landmarks: number[][] | null) {
    const now = Date.now()
    // Throttle detected-hand frames to ~15 fps; let a `null` (hand gone)
    // through immediately so downstream state clears without lag.
    if (
      landmarks !== null &&
      now - this.lastLandmarkSentAt < PredictionClient.MIN_SEND_INTERVAL_MS
    ) {
      return
    }
    const sent = this.rawSend({ landmarks, t: now })
    if (sent && landmarks !== null) this.lastLandmarkSentAt = now
  }

  setMode(mode: 'train' | 'race' | null): void {
    this.mode = mode
    this.rawSend({ mode })
  }

  sendAction(action: TranscriptAction): void {
    this.rawSend({ action })
  }

  sendLoad(text: string): void {
    this.rawSend({ action: 'load', text })
  }

  sendRace(action: 'start' | 'stop', duration?: number): void {
    this.rawSend({ race: action, ...(duration !== undefined ? { duration } : {}) })
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
