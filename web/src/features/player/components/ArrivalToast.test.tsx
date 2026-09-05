import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { clearArrivalNotices, pushArrivalNotice } from '@/app/player/arrivalNotices'
import { ArrivalToast } from './ArrivalToast'

afterEach(() => clearArrivalNotices())

function renderToast() {
  return render(<MemoryRouter><ArrivalToast /></MemoryRouter>)
}

describe('ArrivalToast', () => {
  it('renders nothing without notices', () => {
    renderToast()
    expect(screen.queryByTestId('player-arrival-notice')).not.toBeInTheDocument()
  })

  it('announces a visible base by name and links to it', () => {
    pushArrivalNotice({ baseId: 'b1', title: 'The old mill', state: 'synced', hidden: false })
    renderToast()
    expect(screen.getByTestId('player-arrival-notice')).toHaveTextContent('Arrived at The old mill')
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/base/b1')
  })

  it('celebrates a hidden base once its name has arrived', () => {
    pushArrivalNotice({ baseId: 'h1', title: 'The hollow oak', state: 'synced', hidden: true })
    renderToast()
    expect(screen.getByTestId('player-arrival-notice')).toHaveTextContent('You found The hollow oak')
  })

  it('says a base was found without naming it while offline', () => {
    pushArrivalNotice({ baseId: 'h1', title: null, state: 'queued', hidden: true })
    renderToast()
    const notice = screen.getByTestId('player-arrival-notice')
    expect(notice).toHaveTextContent('You found a base')
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('dismisses one notice and keeps the rest', async () => {
    pushArrivalNotice({ baseId: 'b1', title: 'The old mill', state: 'synced', hidden: false })
    pushArrivalNotice({ baseId: 'b2', title: 'Granite boulder', state: 'synced', hidden: false })
    renderToast()
    expect(screen.getAllByTestId('player-arrival-notice')).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button')[0]!)
    expect(screen.getAllByTestId('player-arrival-notice')).toHaveLength(1)
    expect(screen.getByTestId('player-arrival-notice')).toHaveTextContent('Granite boulder')
  })
})
