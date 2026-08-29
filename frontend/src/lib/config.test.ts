import { describe, it, expect } from 'vitest'
import { WS_URL, API_URL } from './config'

describe('config', () => {
  it('falls back to localhost defaults when env is unset', () => {
    expect(WS_URL).toBe('ws://localhost:8000/ws/predict')
    expect(API_URL).toBe('http://localhost:8000')
  })
})
