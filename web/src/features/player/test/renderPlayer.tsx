import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryTokenStore, type StoredAuth } from '@pointfinder/api'
import { MemoryQueueStore, type PendingAction } from '@pointfinder/game-core'
import { ServicesProvider } from '@/app/player/services'
import { createServices, type AppServices } from '@/app/player/client'
import type { PlatformServices } from '@/platform/contracts'

/** A signed-in account for the player app; its access token matches the msw fixtures. */
export const accountAuth: Extract<StoredAuth, { kind: 'operator' }> = {
  kind: 'operator',
  accessToken: `header.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.signature`,
  refreshToken: 'refresh-ana',
  userId: 'u-ana',
  userName: 'Ana',
  email: 'ana@example.com',
  role: 'participant',
}

export const playerAuth: Extract<StoredAuth, { kind: 'player' }> = {
  kind: 'player',
  token: 'player-token',
  playerId: 'p1',
  teamId: 'team1',
  gameId: 'g1',
  displayName: 'David',
  teamName: 'Falcons',
  teamColor: '#22c55e',
  gameName: 'Serra da Estrela',
  gameStatus: 'live',
  tileSource: 'osm',
}

/** In-memory platform: msw intercepts the global fetch, everything else stays in the test. */
export async function memoryPlatform(auth: StoredAuth | null = playerAuth, pending: PendingAction[] = [], account: StoredAuth | null = null): Promise<PlatformServices> {
  const tokens = new MemoryTokenStore()
  if (auth) await tokens.save(auth)
  const queue = new MemoryQueueStore()
  for (const action of pending) await queue.upsert({ ...action, playerId: auth?.kind === 'player' ? auth.playerId : undefined } as unknown as PendingAction)
  const cache = new Map<string, { stateVersion: number; fetchedAt: string; snapshot: unknown }>()
  const settings = new Map<string, string>()
  const secretStore = new Map<string, string>()
  if (account) secretStore.set('account', JSON.stringify(account))
  const blobs = new Map<string, Uint8Array>()
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    tokens,
    queue,
    cache: {
      load: async <T,>(key: string) => (cache.get(key) as { stateVersion: number; fetchedAt: string; snapshot: T } | undefined) ?? null,
      save: async (key, version, snapshot) => { cache.set(key, { stateVersion: version, fetchedAt: new Date().toISOString(), snapshot }) },
      clear: async (key) => { if (key) cache.delete(key); else cache.clear() },
    },
    secrets: {
      get: async (key) => secretStore.get(key) ?? null,
      set: async (key, value) => { secretStore.set(key, value) },
      remove: async (key) => { secretStore.delete(key) },
    },
    settings: {
      get: async (key) => settings.get(key) ?? null,
      set: async (key, value) => { settings.set(key, value) },
      remove: async (key) => { settings.delete(key) },
    },
    socketFactory: async () => ({ send() {}, close() {}, onMessage() {}, onClose() {}, onError() {} }),
    media: {
      put: async (id, file) => { blobs.set(id, new Uint8Array(await file.arrayBuffer())) },
      read: async (id, offset, length) => (blobs.get(id) ?? new Uint8Array()).slice(offset, offset + length),
      remove: async (id) => { blobs.delete(id) },
    },
  }
}

export interface RenderPlayerOptions {
  auth?: StoredAuth | null
  pending?: PendingAction[]
  route?: string
  /** Route pattern for `ui`, e.g. "/base/:baseId". Defaults to matching everything. */
  path?: string
  /** A signed-in account on the phone, next to the player session. */
  account?: StoredAuth | null
}

export async function renderPlayer(ui: ReactNode, options: RenderPlayerOptions = {}): Promise<{ services: AppServices; queryClient: QueryClient }> {
  const services = await createServices(await memoryPlatform(options.auth === undefined ? playerAuth : options.auth, options.pending, options.account ?? null))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={services}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>
          <Routes>
            <Route path={options.path ?? '*'} element={ui} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
        </MemoryRouter>
      </ServicesProvider>
    </QueryClientProvider>,
  )
  return { services, queryClient }
}
