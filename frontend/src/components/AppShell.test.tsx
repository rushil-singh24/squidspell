import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShell } from './AppShell'

let currentLandmarks: number[][] | null = null

vi.mock('../hooks/useHandLandmarker', () => ({
  useHandLandmarker: () => ({
    videoRef: { current: null },
    landmarks: currentLandmarks,
    fps: 0,
    status: 'loading',
    error: null,
  }),
}))

const mockPrediction = {
  status: 'connecting' as const,
  lastEvent: null,
  lastError: null as string | null,
  sendLandmarks: vi.fn(),
}

vi.mock('../hooks/usePrediction', () => ({
  usePrediction: () => mockPrediction,
}))

vi.mock('./WebcamPane', () => ({
  WebcamPane: () => <div data-testid="webcam-pane" />,
}))

beforeEach(() => {
  currentLandmarks = null
  mockPrediction.lastError = null
  mockPrediction.sendLandmarks.mockClear()
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

  it('sends landmarks to the prediction hook whenever they change', () => {
    const { rerender } = render(<AppShell />)
    expect(mockPrediction.sendLandmarks).toHaveBeenCalledTimes(1)
    expect(mockPrediction.sendLandmarks).toHaveBeenLastCalledWith(null)

    currentLandmarks = [[1, 2, 3]]
    rerender(<AppShell />)
    expect(mockPrediction.sendLandmarks).toHaveBeenLastCalledWith([[1, 2, 3]])
  })
})
