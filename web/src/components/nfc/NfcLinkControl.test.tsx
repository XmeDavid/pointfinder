import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { NfcLinkControl } from './NfcLinkControl'

const nfc = vi.hoisted(() => ({
  writeTag: vi.fn(),
  nfcErrorMessage: vi.fn(() => 'NFC failed'),
}))
vi.mock('@/platform/nfc', () => nfc)

beforeEach(() => vi.clearAllMocks())

it('writes and records the selected base tag through the audited endpoint', async () => {
  const baseId = '11111111-2222-3333-4444-555555555555'
  let linkedBaseId: string | null = null
  nfc.writeTag.mockResolvedValue({ verified: true, id: 'tag-1' })
  server.use(http.patch('/api/games/:gameId/bases/:baseId/nfc-link', ({ params }) => {
    linkedBaseId = String(params.baseId)
    return HttpResponse.json(createMockBase({ id: linkedBaseId, nfcLinked: true }))
  }))
  const base = createMockBase({ id: baseId, nfcLinked: false, nfcToken: 'secret-token' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <NfcLinkControl base={base} gameId="game-1" />
    </QueryClientProvider>,
  )

  await userEvent.click(screen.getByTestId(`nfc-write-${baseId}`))

  await waitFor(() => expect(linkedBaseId).toBe(baseId))
  expect(nfc.writeTag).toHaveBeenCalledOnce()
  expect(await screen.findByRole('status')).toHaveTextContent('Tag written and linked successfully!')
})
