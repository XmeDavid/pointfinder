import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { CreateOrgPage } from './CreateOrgPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateOrgPage />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('CreateOrgPage', () => {
  it('explains that clubs are set up by us and offers a contact link', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Clubs are set up by us' })).toBeInTheDocument()
    expect(screen.getByTestId('create-org-contact')).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:info@pointfinder\.pt/),
    )
  })

  it('lists what a club includes without promising seat counts', () => {
    renderPage()
    expect(screen.getByText('What a club includes')).toBeInTheDocument()
    expect(
      screen.getByText('Games, members and storage limits tailored to your club'),
    ).toBeInTheDocument()
  })

  it('offers no self-serve checkout: no name field, no plan picker, no subscribe', () => {
    renderPage()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Club')).not.toBeInTheDocument()
    expect(screen.queryByText('Institution')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument()
  })

  it('keeps its copy complete in German', async () => {
    await i18n.changeLanguage('de')
    renderPage()
    expect(screen.getByRole('heading', { name: 'Vereine richten wir für dich ein' })).toBeInTheDocument()
    expect(screen.getByTestId('create-org-contact')).toHaveTextContent('Sprich mit uns über einen Verein')
    await i18n.changeLanguage('en')
  })
})
