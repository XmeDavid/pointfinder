import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { resourcesApi } from '@/lib/api/resources'
import type { Resource } from '@/types/resource'
import { useDraftStore } from '@/features/build/drafts/draftStore'
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
beforeEach(() => useDraftStore.getState().resetAll())
afterEach(() => vi.restoreAllMocks())

const guide = {
  id: 'doc-1',
  name: 'Guide',
  type: 'document',
  content: '<p>Meet at the gate</p>',
  contentType: 'text/html',
  sizeBytes: 0,
  sharedWithPlayers: false,
  createdAt: '2026-09-10',
  updatedAt: '2026-09-10',
} as Resource
const map = {
  id: 'file-1',
  name: 'Map.pdf',
  type: 'file',
  content: null,
  contentType: 'application/pdf',
  sizeBytes: 2048,
  sharedWithPlayers: true,
  downloadUrl: 'https://files.example/old',
  createdAt: '2026-09-10',
  updatedAt: '2026-09-10',
} as Resource

function setup(resources: Resource[] = [guide]) {
  const list = vi.spyOn(resourcesApi, 'listGameResources').mockResolvedValue(resources)
  vi.spyOn(resourcesApi, 'listGameFolders').mockResolvedValue([])
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={query}>
      <ResourceBrowser gameId="game-1" showShareToggle />
    </QueryClientProvider>,
  )
  return { list, view }
}

it('opens a document to read first, with an explicit Edit action', async () => {
  setup()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Guide' }))
  const viewer = screen.getByRole('dialog', { name: 'Guide' })
  expect(within(viewer).getByText('Meet at the gate')).toBeInTheDocument()
  expect(within(viewer).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(viewer).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
})

it('returns to reading after a successful save', async () => {
  const update = vi.spyOn(resourcesApi, 'update').mockImplementation(async (_id, data) => ({ ...guide, ...data }) as Resource)
  setup()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Guide' }))
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByRole('textbox', { name: 'Content' }), ' at noon')
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }))
  await waitFor(() => expect(screen.getByTestId('resource-viewer-edit')).toBeInTheDocument())
  expect(update).toHaveBeenCalledWith('doc-1', { name: 'Guide', content: '<p>Meet at the gate</p> at noon' })
})

it('keeps the document editor and changes after a failed save', async () => {
  const update = vi
    .spyOn(resourcesApi, 'update')
    .mockRejectedValue(new Error('Unavailable'))
  setup([{ ...guide, content: '' }])
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Guide' }))
  await user.click(screen.getByRole('button', { name: 'Edit' }))
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
  expect(screen.getByTestId('resource-viewer-save-status')).toHaveTextContent('Could not save')
})

it('keeps unsaved edits when the viewer closes and reopens straight into them', async () => {
  setup()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Guide' }))
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByRole('textbox', { name: 'Content' }), ' by the bridge')
  await user.click(screen.getByRole('button', { name: 'Close', exact: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Guide' }))
  expect(await screen.findByRole('textbox', { name: 'Content' })).toHaveValue('<p>Meet at the gate</p> by the bridge')
})

it('asks before discarding unsaved edits, then shows the saved document', async () => {
  const update = vi.spyOn(resourcesApi, 'update')
  setup()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Guide' }))
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByRole('textbox', { name: 'Content' }), ' changed')
  await user.click(screen.getByTestId('resource-viewer-cancel'))
  expect(screen.getByTestId('resource-viewer-discard')).toHaveTextContent('Discard your unsaved changes')
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('<p>Meet at the gate</p> changed')
  await user.click(screen.getByTestId('resource-viewer-cancel'))
  await user.click(screen.getByTestId('resource-viewer-discard-confirm'))
  expect(await screen.findByText('Meet at the gate')).toBeInTheDocument()
  expect(update).not.toHaveBeenCalled()
})

it('opens a file with a freshly signed link', async () => {
  const { list } = setup([map])
  const tab = { location: { href: '' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  list.mockResolvedValue([{ ...map, downloadUrl: 'https://files.example/fresh' }])
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Map.pdf' }))
  await user.click(screen.getByRole('button', { name: 'Open file' }))
  await waitFor(() => expect(tab.location.href).toBe('https://files.example/fresh'))
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
})

it('asks before deleting a resource', async () => {
  const remove = vi.spyOn(resourcesApi, 'delete').mockResolvedValue(undefined as never)
  setup()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Delete Guide' }))
  expect(screen.getByRole('dialog', { name: 'Delete Guide?' })).toBeInTheDocument()
  expect(remove).not.toHaveBeenCalled()
  await user.click(screen.getByTestId('confirm-action-btn'))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('doc-1'))
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
