import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
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
      />,
    )
    expect(screen.getByText(/MOTION/)).toBeInTheDocument()
  })
})
