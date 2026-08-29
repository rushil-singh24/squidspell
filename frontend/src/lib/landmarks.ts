import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

/**
 * MediaPipe's canonical 21-landmark bone pairs (palm, thumb, index, middle, ring, pinky).
 * Index order matches `HandLandmarker`'s output.
 */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  // palm
  [0, 1],
  [0, 5],
  [0, 17],
  [5, 9],
  [9, 13],
  [13, 17],
  // thumb
  [1, 2],
  [2, 3],
  [3, 4],
  // index
  [5, 6],
  [6, 7],
  [7, 8],
  // middle
  [9, 10],
  [10, 11],
  [11, 12],
  // ring
  [13, 14],
  [14, 15],
  [15, 16],
  // pinky
  [17, 18],
  [18, 19],
  [19, 20],
]

/**
 * Rolling FPS over the last `windowMs`. Keeps only frame times within the window
 * of `now`; needs >= 2 to produce a rate, else 0.
 */
export function computeFps(frameTimesMs: number[], now: number, windowMs = 1000): number {
  const inWindow = frameTimesMs.filter((t) => now - t <= windowMs)
  if (inWindow.length < 2) return 0
  const oldest = Math.min(...inWindow)
  return Math.round((inWindow.length - 1) / ((now - oldest) / 1000))
}

/**
 * The first detected hand as `number[][]` of length 21, each `[x, y, z]`.
 * `null` when no hand was detected this frame.
 */
export function landmarksToArray(result: HandLandmarkerResult): number[][] | null {
  const hands = result.landmarks
  if (!hands || hands.length === 0) return null
  return hands[0].map((p) => [p.x, p.y, p.z])
}

/**
 * Draw the hand skeleton onto `ctx` in normalised coords scaled to `width`/`height`.
 * No-op when `landmarks` is null. Does NOT clear the canvas — that's the caller's job.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: number[][] | null,
  width: number,
  height: number,
  color: string,
): void {
  if (landmarks === null) return
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(landmarks[a][0] * width, landmarks[a][1] * height)
    ctx.lineTo(landmarks[b][0] * width, landmarks[b][1] * height)
    ctx.stroke()
  }
  for (const p of landmarks) {
    ctx.beginPath()
    ctx.arc(p[0] * width, p[1] * height, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}
