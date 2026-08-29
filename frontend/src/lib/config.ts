const env = import.meta.env as Record<string, string | undefined>
export const WS_URL = env.VITE_WS_URL ?? 'ws://localhost:8000/ws/predict'
export const API_URL = env.VITE_API_URL ?? 'http://localhost:8000'
