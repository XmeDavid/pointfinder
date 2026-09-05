import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariableAwareChipInput } from './VariableAwareChipInput'

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
})
