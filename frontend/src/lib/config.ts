const env = import.meta.env as Record<string, string | undefined>
export const API_URL = env.VITE_API_URL ?? 'http://localhost:8000'
export const WS_URL =
  env.VITE_WS_URL ??
  API_URL.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws/predict'
