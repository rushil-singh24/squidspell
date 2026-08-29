export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'
export type Mode = 'train' | 'race'

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
}
