import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShell } from './AppShell'
import { useHandLandmarker } from '../hooks/useHandLandmarker'

const baseHandValue = {
  videoRef: { current: null },
  landmarks: null as number[][] | null,
  fps: 0,
  status: 'loading' as const,
  error: null as string | null,
}

vi.mock('../hooks/useHandLandmarker', () => ({
  useHandLandmarker: vi.fn(() => baseHandValue),
}))

const mockPrediction = {
  status: 'connecting' as const,
  lastEvent: null,
  lastError: null as string | null,
  sendLandmarks: vi.fn(),
  onCommit: vi.fn(() => () => {}),
}

vi.mock('../hooks/usePrediction', () => ({
  usePrediction: () => mockPrediction,
}))

vi.mock('./WebcamPane', () => ({
  WebcamPane: () => <div data-testid="webcam-pane" />,
}))

beforeEach(() => {
  mockPrediction.lastError = null
  mockPrediction.sendLandmarks.mockClear()
  vi.mocked(useHandLandmarker).mockClear()
})

describe('AppShell', () => {
  it('renders both mode tabs and swaps panes on click', async () => {
    const user = userEvent.setup()
    render(<AppShell />)

    expect(screen.getByRole('tab', { name: 'Train' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Race' })).toBeInTheDocument()
    expect(screen.getByText(/Train mode/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Race' }))
    expect(await screen.findByText(/Race mode/)).toBeInTheDocument()
  })

  it('shows a dismissible error toast for a prediction error', async () => {
    const user = userEvent.setup()
    mockPrediction.lastError = 'boom'
    render(<AppShell />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('boom')

    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('wires the prediction send callback into the hand landmarker hook', () => {
    render(<AppShell />)
    expect(useHandLandmarker).toHaveBeenCalledWith(mockPrediction.sendLandmarks)
  })
})
