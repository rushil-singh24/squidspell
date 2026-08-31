export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'
export type Mode = 'train' | 'race'
export type TranscriptAction = 'delete' | 'space' | 'clear'

export interface RaceResults {
  spm: number
  accuracy: number
  consistency: number | null
  duration_s: number
}

export interface RaceSnapshot {
  phase: 'idle' | 'running' | 'finished'
  target_word: string | null
  typed: string
  word_index: number
  upcoming: string[]
  correct_letters: number
  attempted_letters: number
  seconds_left: number
  spm: number
  results: RaceResults | null
}

export interface PredictionEvent {
  prediction: string | null
  confidence: number
  source: 'static' | 'motion' | null
  static_label: string | null
  static_confidence: number
  motion_active: boolean
  fps: number
  timestamp: number
  client_timestamp: number | null
  transcript: string | null
  race: RaceSnapshot | null
}
