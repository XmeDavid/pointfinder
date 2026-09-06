import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockGame } from '@/test/factories/game'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { useTourStore } from './store'
import { WelcomeCard } from './WelcomeCard'

beforeEach(() => {
  useTourStore.getState().reset()
  useWorkspaceContext.setState({ active: { type: 'personal' } })
})

describe('WelcomeCard', () => {
  it('offers the first-game tutorial on an empty personal dashboard', () => {
    render(<WelcomeCard games={[]} />)
    expect(screen.getByTestId('tutorial-welcome-card')).toBeInTheDocument()
    expect(screen.getByText('Build your first game, guided')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-welcome-start')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-welcome-skip')).toBeInTheDocument()
  })

  it('stays hidden while the games list is still loading', () => {
    render(<WelcomeCard games={undefined} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('stays hidden once the operator has a game', () => {
    render(<WelcomeCard games={[createMockGame({ id: 'g1' })]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('stays hidden in an organisation workspace', () => {
    useWorkspaceContext.setState({ active: { type: 'org', orgId: 'o1', orgName: 'Scouts' } })
    render(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('stays hidden once a progress row exists', () => {
    useTourStore.getState().setProgress([
      { scenarioId: 'first-game', status: 'skipped', currentStep: null, gameId: null, startedAt: '2026-09-06T10:00:00Z', completedAt: null },
    ])
    render(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('starts the scenario, snapshotting the games that already exist, and hides itself', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<WelcomeCard games={[]} />)
    await user.click(screen.getByTestId('tutorial-welcome-start'))
    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(useTourStore.getState().gamesAtStart).toEqual([])
    expect(useTourStore.getState().paused).toBe(false)
    rerender(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })

  it('records a skipped row and hides itself', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<WelcomeCard games={[]} />)
    await user.click(screen.getByTestId('tutorial-welcome-skip'))
    expect(useTourStore.getState().progress['first-game']?.status).toBe('skipped')
    expect(useTourStore.getState().activeScenario).toBeNull()
    rerender(<WelcomeCard games={[]} />)
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })
})
