import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrainPane } from './TrainPane'

let rafCbs: FrameRequestCallback[] = []
let nowMs = 0

beforeEach(() => {
  rafCbs = []
  nowMs = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCbs.push(cb)
    return rafCbs.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

function flush(ms: number) {
  nowMs += ms
  const cbs = rafCbs
  rafCbs = []
  cbs.forEach((cb) => cb(nowMs))
}

describe('TrainPane', () => {
  it('shows the empty state with a disabled control set when transcript is blank', () => {
    render(<TrainPane transcript="" onAction={vi.fn()} />)

    expect(
      screen.getByText('Sign a letter to start your transcript.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })

  it('renders the transcript text and fires Space / Delete instantly', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<TrainPane transcript="HELLO" onAction={onAction} />)

    expect(screen.getByTestId('train-transcript')).toHaveTextContent('HELLO')

    await user.click(screen.getByRole('button', { name: /space/i }))
    expect(onAction).toHaveBeenCalledWith('space')

    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onAction).toHaveBeenCalledWith('delete')
  })

  it('fires clear only after a full hold', () => {
    const onAction = vi.fn()
    render(<TrainPane transcript="HI" onAction={onAction} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /clear/i }))
    flush(1100)
    flush(1100)
    expect(onAction).toHaveBeenCalledWith('clear')
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('saves a transcript to local history and removes it again', async () => {
    const user = userEvent.setup()
    render(<TrainPane transcript="HI" onAction={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    const item = screen.getByText(/HI/)
    expect(item).toBeInTheDocument()
    const stored = JSON.parse(
      localStorage.getItem('squidspell-train-history') ?? '[]',
    )
    expect(Array.isArray(stored)).toBe(true)
    expect(stored).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /delete saved transcript/i }))
    expect(screen.queryByText(/^HI$/)).toBeNull()
    const after = JSON.parse(
      localStorage.getItem('squidspell-train-history') ?? '[]',
    )
    expect(after).toHaveLength(0)
  })

  it('downloads the transcript as a text blob without leaking the anchor or revoking early', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:x')
    const revokeObjectURL = vi.fn()
    const click = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof URL)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)

    render(<TrainPane transcript="HI" onAction={vi.fn()} />)
    // fireEvent (sync) so we can observe the state right after the handler runs
    fireEvent.click(screen.getByRole('button', { name: /download/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalled()
    // anchor is cleaned out of the document
    expect(document.querySelector('a[download]')).toBeNull()
    // revoke is deferred, not synchronous (Firefox/Safari would cancel the download)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 0))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('degrades to an empty history when stored JSON has the wrong shape', async () => {
    const user = userEvent.setup()
    for (const bad of ['{"a":1}', '[1,2,3]']) {
      localStorage.setItem('squidspell-train-history', bad)
      const { unmount } = render(<TrainPane transcript="HI" onAction={vi.fn()} />)
      // renders without throwing; no history list present
      expect(screen.queryByRole('list')).toBeNull()
      await user.click(screen.getByRole('button', { name: /^save$/i }))
      const stored = JSON.parse(
        localStorage.getItem('squidspell-train-history') ?? 'null',
      )
      expect(Array.isArray(stored)).toBe(true)
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({ text: 'HI' })
      unmount()
      localStorage.clear()
    }
  })
})
