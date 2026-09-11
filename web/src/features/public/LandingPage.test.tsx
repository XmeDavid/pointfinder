import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '@/i18n'
import { LandingPage } from './LandingPage'

function Location() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Location />
    </MemoryRouter>,
  )
}

const menuToggle = () => screen.getByTestId('landing-menu-toggle')
const menu = () => screen.getByTestId('landing-menu')

beforeEach(async () => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  await i18n.changeLanguage('en')
})

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

describe('LandingPage', () => {
  it('keeps the account journey links the welcome world expects', () => {
    mount()
    const getStarted = screen.getAllByRole('link', { name: 'Get started' })
    expect(getStarted.length).toBeGreaterThan(0)
    for (const link of getStarted) expect(link).toHaveAttribute('href', '/welcome')
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/welcome?role=organizer')
    expect(screen.getByRole('link', { name: 'Start monthly' })).toHaveAttribute('href', '/welcome?role=organizer')
    expect(screen.getByTestId('landing-download-ios')).toHaveAttribute('href', 'https://apps.apple.com/app/pointfinder/id6759060734')
    expect(screen.getByTestId('landing-download-android')).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.prayer.pointfinder')
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', expect.stringMatching(/^mailto:info@pointfinder\.pt/))
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq')
  })

  it('walks into the welcome world without a fade when motion is reduced', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    mount()
    fireEvent.click(screen.getAllByRole('link', { name: 'Get started' })[0])
    expect(screen.getByTestId('location')).toHaveTextContent('/welcome')
  })

  it('opens and closes the phone menu from the keyboard and returns focus to the button', () => {
    mount()
    expect(menu()).not.toBeVisible()
    expect(menuToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(menuToggle()).toHaveAccessibleName('Open menu')

    fireEvent.click(menuToggle())
    expect(menu()).toBeVisible()
    expect(menuToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(menuToggle()).toHaveAccessibleName('Close menu')
    const links = within(menu()).getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '#how-it-works')
    expect(document.activeElement).toBe(links[0])

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu()).not.toBeVisible()
    expect(document.activeElement).toBe(menuToggle())

    fireEvent.click(menuToggle())
    fireEvent.click(within(menu()).getByRole('link', { name: 'Pricing' }))
    expect(menu()).not.toBeVisible()
  })

  it('switches the language for the whole page', async () => {
    mount()
    const [select] = screen.getAllByTestId('landing-language')
    fireEvent.change(select, { target: { value: 'pt' } })
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Transforma qualquer lugar numa aventura.')
    expect(screen.getAllByRole('link', { name: 'Começar' }).length).toBeGreaterThan(0)
    fireEvent.change(select, { target: { value: 'de' } })
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Mach jeden Ort zum Abenteuer.')
  })

  it('switches the theme with the same preference the app uses', () => {
    mount()
    const [toggle] = screen.getAllByTestId('landing-theme-toggle')
    expect(toggle).toHaveAccessibleName('Switch to the dark theme')
    fireEvent.click(toggle)
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem('pointfinder-theme')).toBe('dark')
    expect(toggle).toHaveAccessibleName('Switch to the light theme')
    fireEvent.click(toggle)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(window.localStorage.getItem('pointfinder-theme')).toBe('light')
  })

  it('keeps the page readable when artwork and screenshots fail to load', () => {
    mount()
    const hero = screen.getByRole('img', { name: /Three explorers on a forest trail/ })
    fireEvent.error(hero)
    expect(screen.queryByRole('img', { name: /Three explorers on a forest trail/ })).not.toBeInTheDocument()
    const shot = screen.getByRole('img', { name: /Command workspace/ })
    fireEvent.error(shot)
    expect(screen.queryByRole('img', { name: /Command workspace/ })).not.toBeInTheDocument()
    for (const image of screen.getAllByRole('img').filter(image => image.getAttribute('src')?.startsWith('/landing/'))) fireEvent.error(image)
    expect(screen.queryByTestId('landing-artwork-fallback')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Build your game' })).toBeVisible()
    // The section's own copy and the map attribution never depended on the pictures.
    expect(screen.getByRole('heading', { name: 'Out in the field. Always in the loop.' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    expect(screen.getByRole('link', { name: 'CARTO' })).toHaveAttribute('href', 'https://carto.com/attributions')
  })

  it('shows the three steps and the organizer workspace with real, layered artwork', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Build your game' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Explore together' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Make every stop count' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /kneeling over a map/ })).toHaveAttribute('src', '/landing/illustrated/step-plan-mascot-v2.webp')
    expect(screen.getByRole('img', { name: /Two explorers walking/ })).toHaveAttribute('src', '/landing/illustrated/step-explore-mascot-v2.webp')
    expect(screen.getByRole('img', { name: /NFC plate on a wooden checkpoint post/ })).toHaveAttribute('src', '/landing/illustrated/step-checkin-mascot-v2.webp')
    expect(screen.getByRole('img', { name: /guide with a backpack/ })).toHaveAttribute('src', '/landing/illustrated/guide-pointing-mascot-v2.webp')
    expect(screen.getByRole('img', { name: /Command workspace/ })).toHaveAttribute('src', '/landing/illustrated/workspace-preview.webp')
    expect(screen.getByRole('img', { name: /Three explorers on a forest trail/ })).toHaveAttribute('src', '/landing/illustrated/hero.webp')
    expect(screen.getByText(/Costa de Lavos, Portugal/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your next adventure starts here.' })).toBeInTheDocument()
  })

  it('starts monthly with a yearly savings offer and switches billing periods explicitly', () => {
    mount()
    const group = screen.getByRole('group', { name: 'Billing cycle' })
    expect(within(group).getAllByRole('button')[0]).toHaveAccessibleName('Monthly')
    expect(within(group).getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('€3.99')).toBeInTheDocument()
    expect(screen.getByText('/ month')).toBeInTheDocument()
    expect(screen.queryByText('€30')).not.toBeInTheDocument()
    expect(screen.getByText('Save €17.88 a year with yearly billing')).toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: 'Yearly' }))
    expect(within(group).getByRole('button', { name: 'Yearly' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('€30')).toBeInTheDocument()
    expect(screen.getByText('/ year')).toBeInTheDocument()
    expect(screen.getByText('Save €17.88 vs monthly')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start yearly' })).toHaveAttribute('href', '/welcome?role=organizer')
    fireEvent.click(within(group).getByRole('button', { name: 'Monthly' }))
    expect(within(group).getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('€3.99')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start monthly' })).toHaveAttribute('href', '/welcome?role=organizer')
  })
})
