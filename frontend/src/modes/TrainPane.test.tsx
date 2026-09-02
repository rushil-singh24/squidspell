import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { TrainPane } from './TrainPane'
import type { TrainEntry } from '../lib/trainHistory'

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
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function flush(ms: number) {
  nowMs += ms
  const cbs = rafCbs
  rafCbs = []
  cbs.forEach((cb) => cb(nowMs))
}

function props(over: Partial<ComponentProps<typeof TrainPane>> = {}) {
  return {
    transcript: '',
    onAction: vi.fn(),
    userId: 'user-1' as string | null,
    entries: [] as TrainEntry[],
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onReopen: vi.fn(),
    ...over,
  }
}

describe('TrainPane', () => {
  it('shows the empty state with a disabled control set when transcript is blank', () => {
    render(<TrainPane {...props({ transcript: '' })} />)

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
    render(<TrainPane {...props({ transcript: 'HELLO', onAction })} />)

    expect(screen.getByTestId('train-transcript')).toHaveTextContent('HELLO')

    await user.click(screen.getByRole('button', { name: /space/i }))
    expect(onAction).toHaveBeenCalledWith('space')

    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onAction).toHaveBeenCalledWith('delete')
  })

  it('keyboard Space / Backspace fire the transcript edit actions', () => {
    const onAction = vi.fn()
    render(<TrainPane {...props({ transcript: 'HI', onAction })} />)

    fireEvent.keyDown(document.body, { key: ' ' })
    expect(onAction).toHaveBeenCalledWith('space')

    fireEvent.keyDown(document.body, { key: 'Backspace' })
    expect(onAction).toHaveBeenCalledWith('delete')
  })

  it('does not fire transcript edits from the keyboard while a button has focus', () => {
    const onAction = vi.fn()
    render(<TrainPane {...props({ transcript: 'HI', onAction })} />)
    const btn = screen.getByRole('button', { name: /download/i })
    btn.focus()
    fireEvent.keyDown(btn, { key: ' ' })
    expect(onAction).not.toHaveBeenCalledWith('space')
  })

  it('fires clear only after a full hold', () => {
    const onAction = vi.fn()
    render(<TrainPane {...props({ transcript: 'HI', onAction })} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /clear/i }))
    flush(1100)
    flush(1100)
    expect(onAction).toHaveBeenCalledWith('clear')
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('Save calls onSave with the current transcript when signed in', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<TrainPane {...props({ transcript: 'HI', onSave, userId: 'user-1' })} />)

    const save = screen.getByRole('button', { name: /^save$/i })
    expect(save).toBeEnabled()
    await user.click(save)
    expect(onSave).toHaveBeenCalledWith('HI')
  })

  it('Save is disabled with a sign-in hint when logged out', () => {
    render(<TrainPane {...props({ transcript: 'HI', userId: null })} />)
    const save = screen.getByRole('button', { name: /^save$/i })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('title', 'Sign in to save')
  })

  it('opens the Saved panel and drives it off entries: reopen + delete callbacks', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const onReopen = vi.fn()
    const entries: TrainEntry[] = [
      { id: 'e1', text: 'HELLO WORLD', savedAt: Date.now() },
    ]
    render(
      <TrainPane
        {...props({ transcript: 'HI', entries, onDelete, onReopen })}
      />,
    )

    // list is not mounted until the Saved panel is opened
    expect(screen.queryByRole('list')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^saved/i }))

    await user.click(screen.getByRole('button', { name: 'HELLO WORLD' }))
    expect(onReopen).toHaveBeenCalledWith('HELLO WORLD')

    // reopening closes the panel again
    expect(screen.queryByRole('list')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^saved/i }))
    await user.click(
      screen.getByRole('button', { name: /delete saved transcript/i }),
    )
    expect(onDelete).toHaveBeenCalledWith('e1')
  })

  it('Saved panel shows an empty hint and no list when there are no entries', async () => {
    const user = userEvent.setup()
    render(<TrainPane {...props({ transcript: 'HI', entries: [] })} />)
    expect(screen.queryByRole('list')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^saved/i }))
    expect(screen.getByText('No saved transcripts yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('Saved panel prompts sign-in when logged out', async () => {
    const user = userEvent.setup()
    render(<TrainPane {...props({ transcript: 'HI', userId: null, entries: [] })} />)
    await user.click(screen.getByRole('button', { name: /^saved/i }))
    expect(
      screen.getByText('Sign in to save and revisit transcripts.'),
    ).toBeInTheDocument()
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

    render(<TrainPane {...props({ transcript: 'HI' })} />)
    fireEvent.click(screen.getByRole('button', { name: /download/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 0))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })
})
