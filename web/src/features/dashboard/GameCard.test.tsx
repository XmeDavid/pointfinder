import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameCard } from './GameCard'
import { createMockGame } from '@/test/factories/game'

describe('GameCard', () => {
  it('renders the game name', () => {
    const game = createMockGame({ name: 'Scout Rally' })
    render(<GameCard game={game} onClick={() => {}} />)
    expect(screen.getByText('Scout Rally')).toBeInTheDocument()
  })

  it('shows the correct status badge', () => {
    const game = createMockGame({ status: 'live' })
    render(<GameCard game={game} onClick={() => {}} />)
    expect(screen.getByText('live')).toBeInTheDocument()
  })

  it('shows description when present', () => {
    const game = createMockGame({ description: 'A fun game' })
    render(<GameCard game={game} onClick={() => {}} />)
    expect(screen.getByText('A fun game')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const game = createMockGame({ name: 'Clicky Game' })
    render(<GameCard game={game} onClick={onClick} />)
    await user.click(screen.getByText('Clicky Game'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders setup status with appropriate styling', () => {
    const game = createMockGame({ status: 'setup' })
    render(<GameCard game={game} onClick={() => {}} />)
    const badge = screen.getByText('setup')
    expect(badge.closest('[aria-label="Game status: setup"]')).toHaveClass(
      'bg-info/10',
    )
  })

  it('renders ended status with appropriate styling', () => {
    const game = createMockGame({ status: 'ended' })
    render(<GameCard game={game} onClick={() => {}} />)
    const badge = screen.getByText('ended')
    expect(badge.closest('[aria-label="Game status: ended"]')).toHaveClass(
      'bg-muted',
    )
  })
})
