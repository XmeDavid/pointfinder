import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import i18n from '@/i18n'
import { VariableAwareChipInput } from './VariableAwareChipInput'
import { completeReference, findOpenReference } from './chipReferences'

/** Keeps the chips like the challenge editor does, so multi-step edits land. */
function Controlled({
  initial,
  availableKeys = [],
  onChange = () => {},
}: {
  initial: string[]
  availableKeys?: string[]
  onChange?: (chips: string[]) => void
}) {
  const [chips, setChips] = useState(initial)
  return (
    <VariableAwareChipInput
      chips={chips}
      onChange={(next) => {
        setChips(next)
        onChange(next)
      }}
      availableKeys={availableKeys}
    />
  )
}

describe('VariableAwareChipInput', () => {
  it('renders existing chips', () => {
    render(
      <VariableAwareChipInput
        chips={['FOX', '{{secret}}']}
        onChange={() => {}}
        availableKeys={['secret']}
      />,
    )
    expect(screen.getByText('FOX')).toBeInTheDocument()
    expect(screen.getByText('{{secret}}')).toBeInTheDocument()
  })

  it('adds a chip on Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput
        chips={['FOX']}
        onChange={onChange}
        availableKeys={[]}
      />,
    )
    const input = screen.getByTestId('chip-add-input')
    await user.type(input, 'WOLF{Enter}')
    expect(onChange).toHaveBeenCalledWith(['FOX', 'WOLF'])
  })

  it('removes a chip on X click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput
        chips={['FOX', 'WOLF']}
        onChange={onChange}
        availableKeys={[]}
      />,
    )
    await user.click(screen.getByTestId('chip-remove-0'))
    expect(onChange).toHaveBeenCalledWith(['WOLF'])
  })

  it('renders pill style for chips containing {{key}}', () => {
    render(
      <VariableAwareChipInput
        chips={['{{secret}}-FOX']}
        onChange={() => {}}
        availableKeys={['secret']}
      />,
    )
    const pill = screen.getByTestId('chip-pill-secret')
    expect(pill).toHaveClass('variable-tag')
    expect(pill).not.toHaveClass('variable-tag--undefined')
  })

  it('marks undefined-key chips with warning style', () => {
    render(
      <VariableAwareChipInput
        chips={['{{typo}}']}
        onChange={() => {}}
        availableKeys={['secret']}
      />,
    )
    const pill = screen.getByTestId('chip-pill-typo')
    expect(pill).toHaveClass('variable-tag')
    expect(pill).toHaveClass('variable-tag--undefined')
  })

  it('removes last chip with Backspace when draft is empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput
        chips={['FOX', 'WOLF']}
        onChange={onChange}
        availableKeys={[]}
      />,
    )
    const input = screen.getByTestId('chip-add-input')
    input.focus()
    await user.keyboard('{Backspace}')
    expect(onChange).toHaveBeenCalledWith(['FOX'])
  })

  it('labels the add, edit and remove controls in the active language', async () => {
    render(
      <VariableAwareChipInput chips={['FOX']} onChange={() => {}} availableKeys={[]} />,
    )
    expect(screen.getByLabelText('Add an accepted answer')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit FOX')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove FOX')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type an answer, or {{variable}} for a team value')).toBeInTheDocument()

    await i18n.changeLanguage('pt')
    try {
      render(
        <VariableAwareChipInput chips={['LOBO']} onChange={() => {}} availableKeys={[]} />,
      )
      expect(screen.getByLabelText('Remover LOBO')).toBeInTheDocument()
      expect(screen.getByLabelText('Editar LOBO')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('commits a typed answer when focus leaves the field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <VariableAwareChipInput chips={['FOX']} onChange={onChange} availableKeys={[]} />
        <button type="button">Save</button>
      </>,
    )
    await user.type(screen.getByTestId('chip-add-input'), 'WOLF')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChange).toHaveBeenCalledWith(['FOX', 'WOLF'])
  })

  it('commits the draft before a chip control acts, so removing one chip cannot drop another', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={['FOX']} onChange={onChange} />)
    await user.type(screen.getByTestId('chip-add-input'), 'WOLF')
    await user.click(screen.getByTestId('chip-remove-0'))
    expect(onChange).toHaveBeenNthCalledWith(1, ['FOX', 'WOLF'])
    expect(onChange).toHaveBeenNthCalledWith(2, ['WOLF'])
    expect(screen.getByTestId('chip-add-input')).toHaveValue('')
    expect(screen.getByText('WOLF')).toBeInTheDocument()
  })

  it('commits a typed answer when the input unmounts, so a toggle cannot lose it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { unmount } = render(
      <VariableAwareChipInput chips={['FOX']} onChange={onChange} availableKeys={[]} />,
    )
    await user.type(screen.getByTestId('chip-add-input'), 'WOLF')
    unmount()
    expect(onChange).toHaveBeenCalledWith(['FOX', 'WOLF'])
  })

  it('edits a chip in place and commits with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={['FOX', 'WOLF']} onChange={onChange} />)
    await user.click(screen.getByTestId('chip-edit-1'))
    const edit = screen.getByTestId('chip-edit-input')
    expect(edit).toHaveValue('WOLF')
    expect(edit).toHaveFocus()
    await user.clear(edit)
    await user.type(edit, 'BEAR{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['FOX', 'BEAR'])
    expect(screen.queryByTestId('chip-edit-input')).not.toBeInTheDocument()
    expect(screen.getByText('BEAR')).toBeInTheDocument()
  })

  it('cancels an edit with Escape and keeps an emptied chip', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={['FOX']} onChange={onChange} />)
    await user.click(screen.getByTestId('chip-edit-0'))
    await user.type(screen.getByTestId('chip-edit-input'), 'X{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('FOX')).toBeInTheDocument()

    await user.click(screen.getByTestId('chip-edit-0'))
    await user.clear(screen.getByTestId('chip-edit-input'))
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('FOX')).toBeInTheDocument()
  })

  it('commits an edit when focus leaves the field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <Controlled initial={['FOX']} onChange={onChange} />
        <button type="button">Save</button>
      </>,
    )
    await user.click(screen.getByTestId('chip-edit-0'))
    await user.type(screen.getByTestId('chip-edit-input'), 'ES')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChange).toHaveBeenCalledWith(['FOXES'])
  })

  it('offers matching team values after {{ and completes the reference from the keyboard', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput
        chips={[]}
        onChange={onChange}
        availableKeys={['secret', 'motto', 'teamColor']}
      />,
    )
    const input = screen.getByTestId('chip-add-input')
    await user.type(input, '{{{{')
    expect(screen.getByTestId('chip-suggestions')).toBeInTheDocument()
    expect(screen.getByTestId('variable-suggestion-secret')).toBeInTheDocument()
    expect(screen.getByTestId('variable-suggestion-motto')).toBeInTheDocument()

    await user.type(input, 'm')
    expect(screen.queryByTestId('variable-suggestion-secret')).not.toBeInTheDocument()
    expect(screen.getByTestId('variable-suggestion-motto')).toBeInTheDocument()

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('{{motto}}')
    expect(screen.queryByTestId('chip-suggestions')).not.toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(['{{motto}}'])
  })

  it('completes a reference from a pointer without committing the partial text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariableAwareChipInput chips={[]} onChange={onChange} availableKeys={['secret']} />,
    )
    const input = screen.getByTestId('chip-add-input')
    await user.type(input, 'A-{{{{se')
    await user.click(screen.getByTestId('variable-suggestion-secret'))
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('A-{{secret}}')
  })

  it('closes the suggestions with Escape and keeps what was typed', async () => {
    const user = userEvent.setup()
    render(
      <VariableAwareChipInput chips={[]} onChange={() => {}} availableKeys={['secret']} />,
    )
    const input = screen.getByTestId('chip-add-input')
    await user.type(input, '{{{{s')
    expect(screen.getByTestId('chip-suggestions')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('chip-suggestions')).not.toBeInTheDocument()
    expect(input).toHaveValue('{{s')
    // Typing again reopens the list.
    await user.type(input, 'e')
    expect(screen.getByTestId('chip-suggestions')).toBeInTheDocument()
  })

  it('offers suggestions while editing a chip too', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={['FOX']} availableKeys={['secret']} onChange={onChange} />)
    await user.click(screen.getByTestId('chip-edit-0'))
    const edit = screen.getByTestId('chip-edit-input')
    await user.type(edit, '-{{{{')
    await user.click(screen.getByTestId('variable-suggestion-secret'))
    expect(edit).toHaveValue('FOX-{{secret}}')
    fireEvent.keyDown(edit, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['FOX-{{secret}}'])
  })
})

describe('open reference helpers', () => {
  it('finds the partial being typed only while the braces are open at the caret', () => {
    expect(findOpenReference('A-{{se', 6)).toEqual({ start: 2, query: 'se' })
    expect(findOpenReference('{{secret}} and', 14)).toBeNull()
    expect(findOpenReference('{{se cret', 9)).toBeNull()
    expect(findOpenReference('plain', 5)).toBeNull()
    expect(findOpenReference('{{a}}-{{', 8)).toEqual({ start: 6, query: '' })
  })

  it('replaces the partial with the full reference and leaves the tail alone', () => {
    expect(completeReference('A-{{se-B', 6, 'secret')).toEqual({ value: 'A-{{secret}}-B', caret: 12 })
    expect(completeReference('plain', 5, 'secret')).toEqual({ value: 'plain', caret: 5 })
  })
})
