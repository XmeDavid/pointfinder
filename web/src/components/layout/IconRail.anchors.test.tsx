import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IconRail } from './IconRail'
import { useWorkspaceStore } from '@/stores/workspace'

function renderRail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IconRail showModes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('IconRail tutorial anchors', () => {
  beforeEach(() => useWorkspaceStore.getState().reset())

  it('labels every mode button on both the desktop rail and the mobile bar', () => {
    renderRail()
    for (const mode of ['build', 'command', 'review', 'results']) {
      // one in the desktop rail, one in the mobile tab bar
      expect(screen.getAllByTestId(`mode-${mode}`)).toHaveLength(2)
    }
    expect(screen.getAllByTestId('mode-build')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('mode-command')[0]).toHaveAttribute('aria-pressed', 'false')
  })
})
