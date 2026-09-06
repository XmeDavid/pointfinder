import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { UserAvatarMenu } from './UserAvatarMenu'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('UserAvatarMenu', () => {
  beforeEach(() => {
    // The portalled menu measures itself; jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })

  it('offers a Tutorials entry that routes to /tutorials', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserAvatarMenu />
      </MemoryRouter>,
    )

    await user.click(screen.getByTestId('user-avatar-btn'))
    const item = screen.getByTestId('menu-tutorials')
    expect(item).toHaveTextContent('Tutorials')

    await user.click(item)
    expect(mockNavigate).toHaveBeenCalledWith('/tutorials')
  })
})
