import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import i18n from '@/i18n'
import { UserAvatarMenu } from './UserAvatarMenu'

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(async () => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
})

it('opens profile and language actions in a portal and changes the saved language', async () => {
  const user = userEvent.setup()
  const { container } = render(<MemoryRouter><UserAvatarMenu /></MemoryRouter>)
  await user.click(screen.getByTestId('user-avatar-btn'))
  expect(screen.getByTestId('menu-profile')).toBeVisible()
  expect(container.querySelector('[data-dropdown]')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Deutsch', exact: true }))
  expect(i18n.resolvedLanguage).toBe('de')
  expect(screen.queryByTestId('menu-profile')).not.toBeInTheDocument()
})

it('returns an operator to the mobile welcome screen after native logout', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  function LocationProbe() {
    return <span data-testid="location">{useLocation().pathname}</span>
  }
  render(<MemoryRouter initialEntries={['/dashboard']}><UserAvatarMenu /><LocationProbe /></MemoryRouter>)

  await userEvent.click(screen.getByTestId('user-avatar-btn'))
  await userEvent.click(screen.getByTestId('menu-logout'))

  expect(screen.getByTestId('location')).toHaveTextContent('/')
})

it('combines the mobile dashboard and profile entry points', async () => {
  function LocationProbe() {
    return <span data-testid="location">{useLocation().pathname}</span>
  }
  render(<MemoryRouter initialEntries={['/game/g']}><UserAvatarMenu showDashboard /><LocationProbe /></MemoryRouter>)

  await userEvent.click(screen.getByTestId('user-avatar-btn'))
  await userEvent.click(screen.getByTestId('menu-dashboard'))

  expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
})
