import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = resolve(root, 'public/mediapipe')
const taskSrc = resolve(root, '../ml/models/hand_landmarker.task')
const taskDest = resolve(root, 'public/models/hand_landmarker.task')

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDest, { recursive: true })
  cpSync(wasmSrc, wasmDest, { recursive: true })
  console.log(`copied MediaPipe wasm -> ${wasmDest}`)
} else {
  console.warn(
    `WARN: ${wasmSrc} not found — @mediapipe/tasks-vision package layout may differ; MediaPipe wasm assets will 404 until resolved`,
  )
}

if (existsSync(taskSrc)) {
  mkdirSync(dirname(taskDest), { recursive: true })
  cpSync(taskSrc, taskDest)
  console.log(`copied hand_landmarker.task -> ${taskDest}`)
} else {
  console.warn(
    `WARN: ${taskSrc} not found — run "python ml/train_static.py" / see ml/README; hand tracking will 404 until it exists`,
  )
}
