import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionChooser } from './SectionChooser'
import { BuildShortcuts } from './BuildShortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

describe('SectionChooser (OW-36)', () => {
  it('names the active section and opens one list of every section', async () => {
    const onSelect = vi.fn()
    render(<SectionChooser active="challenges" onSelect={onSelect} />)
    const trigger = screen.getByTestId('drawer-section-chooser')
    expect(trigger).toHaveTextContent('Challenges')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('tab-bases')).not.toBeInTheDocument()

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const entries = ['bases', 'challenges', 'teams', 'stages', 'nfc', 'documents'].map((key) => screen.getByTestId(`tab-${key}`))
    expect(entries.map((e) => e.textContent)).toEqual(['Bases', 'Challenges', 'Teams', 'Stages', 'Tags', 'Documents'])
    expect(screen.getByTestId('tab-challenges')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByTestId('tab-nfc'))
    expect(onSelect).toHaveBeenCalledWith('nfc')
    expect(screen.queryByTestId('tab-nfc')).not.toBeInTheDocument()
  })
})

describe('BuildShortcuts (OW-36)', () => {
  it('opens the content panel at the chosen section and keeps the selection', async () => {
    useWorkspaceStore.getState().reset()
    useWorkspaceStore.setState({ selectedBaseId: 'b1', drawerOpen: false })
    render(<BuildShortcuts />)
    expect(screen.getByRole('navigation', { name: 'Content sections' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(useWorkspaceStore.getState()).toMatchObject({ drawerOpen: true, drawerTab: 'documents', selectedBaseId: 'b1' })
    useWorkspaceStore.getState().reset()
  })
})
