import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { MapLegend } from './MapLegend'

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div> },
}))
afterEach(() => vi.useRealTimers())
it('yields space after a few seconds, and stays open when explicitly recalled', () => {
  vi.useFakeTimers()
  render(<MapLegend/>)
  expect(screen.getByRole('list')).toBeVisible()
  act(() => { vi.advanceTimersByTime(6500) })
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
  act(() => { vi.advanceTimersByTime(10000) })
  expect(screen.getByRole('list')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Hide legend' }))
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
