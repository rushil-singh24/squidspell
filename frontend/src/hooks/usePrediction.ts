import { useCallback, useEffect, useRef, useState } from 'react'
import { PredictionClient } from '../lib/predictionClient'
import { WS_URL } from '../lib/config'
import type {
  ConnectionStatus,
  PredictionEvent,
  RaceSnapshot,
  TranscriptAction,
} from '../types'

export type CommitListener = (
  letter: string,
  source: 'static' | 'motion',
  confidence: number,
) => void

export function usePrediction(url: string = WS_URL) {
  const clientRef = useRef<PredictionClient | null>(null)
  const commitCbs = useRef(new Set<CommitListener>())
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [lastEvent, setLastEvent] = useState<PredictionEvent | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [race, setRace] = useState<RaceSnapshot | null>(null)

  useEffect(() => {
    const c = new PredictionClient(url)
    clientRef.current = c
    c.onStatus(setStatus)
    c.onError(setLastError)
    c.onFrame((e) => {
      setLastEvent(e)
      if (e.transcript !== null && e.transcript !== undefined) setTranscript(e.transcript)
      if (e.race != null) setRace(e.race)
      if (e.prediction && (e.source === 'static' || e.source === 'motion')) {
        for (const cb of commitCbs.current) cb(e.prediction, e.source, e.confidence)
      }
    })
    c.connect()
    return () => {
      c.close()
      clientRef.current = null
    }
  }, [url])

  const sendLandmarks = useCallback(
    (l: number[][] | null) => clientRef.current?.send(l),
    [],
  )
  const setMode = useCallback((m: 'train' | 'race' | null) => {
    // The server drops/recreates its TranscriptBuilder on every mode change
    // and reconnect, so the previous transcript is gone server-side. Clear the
    // local copy too, otherwise stale text lingers when frames have stopped.
    setTranscript('')
    setRace(null)
    clientRef.current?.setMode(m)
  }, [])
  const sendAction = useCallback((a: TranscriptAction) => {
    // Optimistically mirror TranscriptBuilder.apply for the deterministic edit
    // ops so they show with the camera off (no frames arriving). The server
    // stays authoritative and overwrites with an identical value when frames
    // resume; a change-only frame with an equal value is simply not delivered.
    if (a === 'clear') setTranscript('')
    else if (a === 'delete') setTranscript((t) => t.slice(0, -1))
    else if (a === 'space')
      setTranscript((t) => (t && !t.endsWith(' ') ? t + ' ' : t))
    clientRef.current?.sendAction(a)
  }, [])
  const loadTranscript = useCallback((text: string) => {
    // Optimistic local mirror of TranscriptBuilder.load (uppercase + clamp to
    // MAX_TRANSCRIPT_CHARS = 2000) so a reopened transcript shows with the
    // camera off. Server remains authoritative.
    setTranscript(text.toUpperCase().slice(0, 2000))
    clientRef.current?.sendLoad(text)
  }, [])
  const startRace = useCallback(
    (duration: number) => clientRef.current?.sendRace('start', duration),
    [],
  )
  const stopRace = useCallback(() => clientRef.current?.sendRace('stop'), [])
  const onCommit = useCallback((cb: CommitListener) => {
    commitCbs.current.add(cb)
    return () => {
      commitCbs.current.delete(cb)
    }
  }, [])

  return {
    status,
    lastEvent,
    lastError,
    transcript,
    race,
    sendLandmarks,
    setMode,
    sendAction,
    loadTranscript,
    startRace,
    stopRace,
    onCommit,
  }
}
