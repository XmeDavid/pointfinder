import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickFilters, type QuickFilterGroup } from './QuickFilters'

function group(over: Partial<QuickFilterGroup>): QuickFilterGroup {
  return { id: 'g', label: 'Group', mode: 'multi', options: [], value: [], onChange: vi.fn(), ...over }
}

describe('QuickFilters', () => {
  it('renders nothing when no group has options', () => {
    const { container } = render(<QuickFilters groups={[group({})]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('a single-select group offers All and swaps the choice', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <QuickFilters
        groups={[group({ id: 'stage', mode: 'single', options: [{ id: 's1', label: 'One' }, { id: 's2', label: 'Two' }], value: ['s1'], onChange })]}
      />,
    )
    expect(screen.getByTestId('filter-stage-all')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('filter-stage-s1')).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByTestId('filter-stage-s2'))
    expect(onChange).toHaveBeenLastCalledWith(['s2'])
    await user.click(screen.getByTestId('filter-stage-s1'))
    expect(onChange).toHaveBeenLastCalledWith([])
    await user.click(screen.getByTestId('filter-stage-all'))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('a multi-select group toggles options in and out', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <QuickFilters
        groups={[group({ id: 'tag', options: [{ id: 't1', label: 'A', color: '#16a34a' }, { id: 't2', label: 'B', color: '#eab308' }], value: ['t1'], onChange })]}
      />,
    )
    expect(screen.queryByTestId('filter-tag-all')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('filter-tag-t2'))
    expect(onChange).toHaveBeenLastCalledWith(['t1', 't2'])
    await user.click(screen.getByTestId('filter-tag-t1'))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('coloured chips paint the tag colour and Clear resets every group', async () => {
    const user = userEvent.setup()
    const onStage = vi.fn()
    const onTag = vi.fn()
    render(
      <QuickFilters
        groups={[
          group({ id: 'stage', mode: 'single', options: [{ id: 's1', label: 'One' }], value: ['s1'], onChange: onStage }),
          group({ id: 'tag', options: [{ id: 't1', label: 'A', color: '#16a34a' }], value: ['t1'], onChange: onTag }),
        ]}
      />,
    )
    expect(screen.getByTestId('filter-tag-t1')).toHaveStyle({ backgroundColor: '#16a34a' })
    await user.click(screen.getByTestId('quick-filters-clear'))
    expect(onStage).toHaveBeenCalledWith([])
    expect(onTag).toHaveBeenCalledWith([])
  })

  it('hides Clear while nothing is chosen', () => {
    render(<QuickFilters groups={[group({ id: 'tag', options: [{ id: 't1', label: 'A' }] })]} />)
    expect(screen.queryByTestId('quick-filters-clear')).not.toBeInTheDocument()
  })
})
