import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RaceWordStream } from './RaceWordStream'

function letterStates(container: HTMLElement): Array<[string, string | null]> {
  return Array.from(container.querySelectorAll('[data-state]')).map((el) => [
    el.textContent ?? '',
    el.getAttribute('data-state'),
  ])
}

describe('RaceWordStream', () => {
  it('marks the typed prefix done and the next letter as cursor', () => {
    const { container } = render(
      <RaceWordStream target="cat" typed="ca" upcoming={['dog', 'the']} />,
    )

    const states = letterStates(container)
    expect(states).toEqual([
      ['c', 'done'],
      ['a', 'done'],
      ['t', 'cursor'],
    ])
  })

  it('renders the upcoming words', () => {
    const { getByText } = render(
      <RaceWordStream target="cat" typed="ca" upcoming={['dog', 'the']} />,
    )

    expect(getByText('dog the')).toBeInTheDocument()
  })

  it('makes the first letter the cursor when nothing is typed', () => {
    const { container } = render(
      <RaceWordStream target="cat" typed="" upcoming={[]} />,
    )

    expect(letterStates(container)).toEqual([
      ['c', 'cursor'],
      ['a', 'pending'],
      ['t', 'pending'],
    ])
  })

  it('renders no upcoming row when upcoming is empty', () => {
    const { container, queryByText } = render(
      <RaceWordStream target="cat" typed="" upcoming={[]} />,
    )

    expect(queryByText('dog')).toBeNull()
    // only the three letter spans carry text-bearing state
    expect(container.textContent).toBe('cat')
  })

  it('marks every letter done and shows no cursor once the word is complete', () => {
    const { container } = render(
      <RaceWordStream target="cat" typed="cat" upcoming={['dog']} />,
    )

    const states = letterStates(container)
    expect(states.map(([, s]) => s)).toEqual(['done', 'done', 'done'])
    expect(states.some(([, s]) => s === 'cursor')).toBe(false)
  })

  it('renders without throwing when the target is empty', () => {
    const { container } = render(
      <RaceWordStream target="" typed="" upcoming={[]} />,
    )

    expect(container.querySelectorAll('[data-state]')).toHaveLength(0)
  })
})
