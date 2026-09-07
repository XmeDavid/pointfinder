import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTag } from '@/test/factories/tag'
import { ChallengePicker } from './ChallengePicker'

const challenges = [
  createMockChallenge({ id: 'c1', title: 'Count the arches', points: 10, answerType: 'text', tagIds: ['t1'] }),
  createMockChallenge({ id: 'c2', title: 'Photograph the bell', points: 25, answerType: 'file', locationBound: true, fixedBaseId: 'b2' }),
  createMockChallenge({ id: 'c3', title: 'Name the peak', points: 5, answerType: 'none' }),
]
const tags = [createMockTag({ id: 't1', label: 'Outdoor', color: '#16a34a' })]

function renderPicker(over: Partial<React.ComponentProps<typeof ChallengePicker>> = {}) {
  const onChange = vi.fn()
  render(
    <ChallengePicker
      value="c1"
      challenges={challenges}
      allowedIds={new Set(['c1', 'c3'])}
      reasonFor={(id) => (id === 'c2' ? 'At Chapel' : null)}
      tags={tags}
      onChange={onChange}
      label="Old mill · Falcons"
      testId="cell"
      {...over}
    />,
  )
  return onChange
}

describe('ChallengePicker', () => {
  it('shows the current title on the trigger and carries it as data-value', () => {
    renderPicker()
    const trigger = screen.getByTestId('cell')
    expect(trigger).toHaveTextContent('Count the arches')
    expect(trigger).toHaveAttribute('data-value', 'c1')
    expect(trigger).toHaveAttribute('aria-label', 'Old mill · Falcons')
  })

  it('opens a list with points, answer type, location, pin and tags per row, and picks one', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByTestId('cell'))

    expect(screen.getByRole('dialog', { name: 'Old mill · Falcons' })).toBeInTheDocument()
    const arches = screen.getByTestId('challenge-option-c1')
    expect(arches).toHaveAttribute('aria-pressed', 'true')
    expect(arches).toHaveTextContent('10 pts')
    expect(arches).toHaveTextContent('Outdoor')
    const bell = screen.getByTestId('challenge-option-c2')
    expect(bell).toBeDisabled()
    expect(bell).toHaveTextContent('Location-bound')
    expect(bell).toHaveTextContent('Pinned')
    expect(bell).toHaveTextContent('At Chapel')
    expect(bell).toHaveTextContent('File')

    await user.click(screen.getByTestId('challenge-option-c3'))
    expect(onChange).toHaveBeenCalledWith('c3')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('cell')).toHaveFocus()
  })

  it('searches by title and by tag label, and offers "No challenge" only without a query', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByTestId('cell'))
    expect(screen.getByTestId('challenge-option-none')).toBeInTheDocument()

    await user.type(screen.getByTestId('challenge-picker-search'), 'outdoor')
    expect(screen.getByTestId('challenge-option-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('challenge-option-c3')).not.toBeInTheDocument()
    expect(screen.queryByTestId('challenge-option-none')).not.toBeInTheDocument()

    await user.clear(screen.getByTestId('challenge-picker-search'))
    await user.type(screen.getByTestId('challenge-picker-search'), 'zzz')
    expect(screen.getByTestId('challenge-picker-empty')).toBeInTheDocument()
  })

  it('clears through "No challenge" and never re-emits the current value', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByTestId('cell'))
    await user.click(screen.getByTestId('challenge-option-c1'))
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('cell'))
    await user.click(screen.getByTestId('challenge-option-none'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('is inert when disabled', async () => {
    const user = userEvent.setup()
    renderPicker({ disabled: true })
    expect(screen.getByTestId('cell')).toBeDisabled()
    await user.click(screen.getByTestId('cell'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
