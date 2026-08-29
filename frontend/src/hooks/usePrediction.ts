import { useEffect, useRef, useState } from 'react'
import { PredictionClient } from '../lib/predictionClient'
import { WS_URL } from '../lib/config'
import type { ConnectionStatus, PredictionEvent } from '../types'

export function usePrediction(url: string = WS_URL) {
  const clientRef = useRef<PredictionClient | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [lastEvent, setLastEvent] = useState<PredictionEvent | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    const c = new PredictionClient(url)
    clientRef.current = c
    c.onStatus(setStatus)
    c.onFrame(setLastEvent)
    c.onError(setLastError)
    c.connect()
    return () => {
      c.close()
      clientRef.current = null
    }
  }, [url])

  return {
    status,
    lastEvent,
    lastError,
    sendLandmarks: (l: number[][] | null) => clientRef.current?.send(l),
  }
}
