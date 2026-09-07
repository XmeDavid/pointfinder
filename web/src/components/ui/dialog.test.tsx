import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from './dialog'

function Stacked() {
  const [outer, setOuter] = useState(true)
  const [inner, setInner] = useState(true)
  return (
    <Dialog open={outer} onOpenChange={setOuter}>
      <DialogContent data-testid="outer">
        <DialogTitle>Outer</DialogTitle>
        <Dialog open={inner} onOpenChange={setInner}>
          <DialogContent data-testid="inner">
            <DialogTitle>Inner</DialogTitle>
            <button type="button">Focus me</button>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('Escape closes only the topmost of two stacked dialogs', async () => {
    const user = userEvent.setup()
    render(<Stacked />)
    expect(screen.getByTestId('inner')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('inner')).not.toBeInTheDocument()
    expect(screen.getByTestId('outer')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('outer')).not.toBeInTheDocument()
  })
})
