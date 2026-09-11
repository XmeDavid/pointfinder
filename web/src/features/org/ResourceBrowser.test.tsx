import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { resourcesApi } from '@/lib/api/resources'
import type { Resource } from '@/types/resource'
import { ResourceBrowser } from './ResourceBrowser'
vi.mock('@/components/editor/RichTextEditor', () => ({
  RichTextEditor: ({
    content,
    onChange,
  }: {
    content: string
    onChange: (value: string) => void
  }) => (
    <textarea
      aria-label="Content"
      value={content}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))
afterEach(() => vi.restoreAllMocks())
function setup() {
  const resource = {
    id: 'doc-1',
    name: 'Guide',
    type: 'document',
    content: '',
    contentType: 'text/html',
    sizeBytes: 0,
    sharedWithPlayers: false,
    createdAt: '2026-09-10',
  } as Resource
  vi.spyOn(resourcesApi, 'listGameResources').mockResolvedValue([resource])
  vi.spyOn(resourcesApi, 'listGameFolders').mockResolvedValue([])
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={query}>
      <ResourceBrowser gameId="game-1" showShareToggle />
    </QueryClientProvider>,
  )
  return resource
}
it('keeps the document editor and changes after a failed save', async () => {
  const update = vi
    .spyOn(resourcesApi, 'update')
    .mockRejectedValue(new Error('Unavailable'))
  setup()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Guide' }))
  await user.clear(screen.getByRole('textbox', { name: 'Document title' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Document title' }),
    'Field guide',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Content' }),
    'Meet at the harbour',
  )
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }))
  await screen.findByRole('alert')
  expect(update).toHaveBeenCalledWith('doc-1', {
    name: 'Field guide',
    content: 'Meet at the harbour',
  })
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(
    'Meet at the harbour',
  )
})
it('keeps sharing off when the server refuses the change', async () => {
  const update = vi
    .spyOn(resourcesApi, 'update')
    .mockRejectedValue(new Error('Unavailable'))
  setup()
  const toggle = await screen.findByRole('switch', {
    name: 'Share with players',
  })
  await userEvent.click(toggle)
  await screen.findByRole('alert')
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(toggle).not.toBeChecked()
  expect(update).toHaveBeenCalledWith('doc-1', { sharedWithPlayers: true })
})
