import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { server } from '@/test/msw/server'
import { renderPlayer, playerAuth } from '@/features/player/test/renderPlayer'
import { playerFixtures } from '@/test/msw/handlers/player'
import * as platform from '@/platform'
import * as runtime from '@/platform/runtime'
import * as navigation from '@/platform/navigation'
import DocumentsScreen from './DocumentsScreen'
import DocumentScreen from './DocumentScreen'

afterEach(() => vi.restoreAllMocks())

describe('DocumentsScreen', () => {
  it('lists shared files and documents with their kind and size', async () => {
    await renderPlayer(<DocumentsScreen />)
    const list = await screen.findByRole('list', { name: 'Documents' })
    expect(list).toBeInTheDocument()
    const map = screen.getByTestId('document-r1')
    expect(map).toHaveTextContent('Site map.pdf')
    expect(map).toHaveTextContent('File · 240 KB')
    expect(map.querySelector('a')).toHaveAttribute('href', 'https://files.example.test/site-map.pdf?sig=1')
    const rules = screen.getByTestId('document-r2')
    expect(rules).toHaveTextContent('Camp rules')
    expect(rules).toHaveTextContent('Document')
    expect(rules.querySelector('a')).toHaveAttribute('href', '/documents/r2')
  })

  it('shows an empty state when nothing is shared', async () => {
    server.use(http.get('/api/player/games/:gameId/files', () => HttpResponse.json([])))
    await renderPlayer(<DocumentsScreen />)
    expect(await screen.findByText('No documents yet')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    server.use(http.get('/api/player/games/:gameId/files', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    await renderPlayer(<DocumentsScreen />)
    expect(await screen.findByText("Couldn't load documents.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('opens a file through the system opener on native', async () => {
    vi.spyOn(runtime, 'isNative').mockReturnValue(true)
    const open = vi.spyOn(navigation, 'openExternal').mockResolvedValue()
    await renderPlayer(<DocumentsScreen />)
    await userEvent.click(await screen.findByRole('link', { name: /Site map\.pdf/ }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://files.example.test/site-map.pdf?sig=1'))
  })

  it('falls back to the cached list offline and marks files as needing a connection', async () => {
    const load = vi.spyOn(platform.gameCache, 'load').mockResolvedValue({ stateVersion: 0, fetchedAt: '2026-09-05T09:00:00Z', snapshot: playerFixtures.files })
    server.use(http.get('/api/player/games/:gameId/files', () => HttpResponse.error()))
    await renderPlayer(
      <Routes>
        <Route path="/documents" element={<DocumentsScreen />} />
        <Route path="/documents/:resourceId" element={<DocumentScreen />} />
      </Routes>,
      { route: '/documents' },
    )
    expect(await screen.findByTestId('documents-offline-hint')).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith(`files:${playerAuth.playerId}:${playerAuth.gameId}`)
    expect(screen.getByTestId('document-r1')).toHaveTextContent('Needs a connection')
    expect(screen.getByTestId('document-r1').querySelector('a')).toBeNull()
    // Documents still open: their content came with the cached list.
    await userEvent.click(screen.getByRole('link', { name: /Camp rules/ }))
    expect(await screen.findByTestId('document-body')).toHaveTextContent('Stay with your team at all times.')
  })
})

describe('DocumentScreen', () => {
  it('renders a document inline with a way back to the list', async () => {
    await renderPlayer(<DocumentScreen />, { route: '/documents/r2', path: '/documents/:resourceId' })
    const body = await screen.findByTestId('document-body')
    expect(body).toHaveTextContent('Camp rules')
    expect(body).toHaveTextContent('Stay with your team at all times.')
    expect(screen.getByRole('link', { name: /Documents/ })).toHaveAttribute('href', '/documents')
  })

  it('explains when the document is gone or is not a document', async () => {
    await renderPlayer(<DocumentScreen />, { route: '/documents/r1', path: '/documents/:resourceId' })
    expect(await screen.findByTestId('document-missing')).toHaveTextContent('This document is no longer available.')
  })
})
