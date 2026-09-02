import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { WebcamPane } from './WebcamPane'
import type { PredictionEvent } from '../types'

vi.mock('./SkeletonOverlay', () => ({
  SkeletonOverlay: () => null,
}))

function mkEvent(partial: Partial<PredictionEvent>): PredictionEvent {
  return {
    prediction: null,
    confidence: 0,
    source: null,
    static_label: null,
    static_confidence: 0,
    motion_active: false,
    fps: 0,
    timestamp: 0,
    client_timestamp: null,
    transcript: null,
    race: null,
    ...partial,
  }
}

describe('WebcamPane', () => {
  it('shows a permission hint when the camera is denied', () => {
    render(
      <WebcamPane
        videoRef={createRef<HTMLVideoElement>()}
        landmarks={null}
        fps={0}
        status="denied"
        event={null}
        connection="closed"
        enabled={true}
        onToggleCamera={vi.fn()}
      />,
    )
    expect(screen.getByText('Allow camera access')).toBeInTheDocument()
  })

  it('shows fps and the static label without a motion pill', () => {
    render(
      <WebcamPane
        videoRef={createRef<HTMLVideoElement>()}
        landmarks={null}
        fps={27}
        status="ready"
        event={mkEvent({
          static_label: 'B',
          static_confidence: 0.8,
          motion_active: false,
        })}
        connection="open"
        enabled={true}
        onToggleCamera={vi.fn()}
      />,
    )
    expect(screen.getByText('27 fps')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.queryByText(/MOTION/)).toBeNull()
  })

  it('shows the motion pill when motion is active', () => {
    render(
      <WebcamPane
        videoRef={createRef<HTMLVideoElement>()}
        landmarks={null}
        fps={27}
        status="ready"
        event={mkEvent({
          static_label: 'B',
          static_confidence: 0.8,
          motion_active: true,
        })}
        connection="open"
        enabled={true}
        onToggleCamera={vi.fn()}
      />,
    )
    expect(screen.getByText(/MOTION/)).toBeInTheDocument()
  })

  it('shows the paused hint and a re-enable button clicking through to onToggleCamera', () => {
    const onToggleCamera = vi.fn()
    render(
      <WebcamPane
        videoRef={createRef<HTMLVideoElement>()}
        landmarks={null}
        fps={0}
        status="paused"
        event={null}
        connection="closed"
        enabled={false}
        onToggleCamera={onToggleCamera}
      />,
    )
    expect(screen.getByText('Camera off')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: 'Turn camera on' })
    fireEvent.click(btn)
    expect(onToggleCamera).toHaveBeenCalledTimes(1)
  })

  it('labels the toggle button "Turn camera off" while enabled', () => {
    render(
      <WebcamPane
        videoRef={createRef<HTMLVideoElement>()}
        landmarks={null}
        fps={0}
        status="ready"
        event={null}
        connection="open"
        enabled={true}
        onToggleCamera={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Turn camera off' }),
    ).toBeInTheDocument()
  })
})
