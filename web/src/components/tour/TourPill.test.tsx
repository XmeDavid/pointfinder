import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourPill } from './TourPill'

afterEach(() => {
  cleanup()
})

describe('TourPill', () => {
  it('shows where the operator is and resumes on demand', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    render(<TourPill step={4} total={12} onResume={onResume} />)

    expect(screen.getByTestId('tour-pill')).toHaveTextContent('Tutorial')
    expect(screen.getByTestId('tour-pill')).not.toHaveTextContent('step 4 of 12')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
    await user.click(screen.getByTestId('tour-pill-resume'))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('sits on the tour layer and portals to the body', () => {
    const { container } = render(<TourPill step={1} total={3} onResume={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(document.body.querySelector('[data-testid="tour-pill"]')?.className).toContain('z-[71]')
  })
})
