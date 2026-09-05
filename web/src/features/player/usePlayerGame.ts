import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, type CheckInResponse, type GameDataResponse, type PlayerSnapshotResponse, type SubmissionResponse } from '@pointfinder/api'
import type { PendingAction, SyncOutcome } from '@pointfinder/game-core'
import { useAuth, useServices } from '@/app/player/services'
import { gameCache } from '@/platform'
import { buildLogbook, newlyUnlocked, type Logbook } from '@/features/player/logbook'

/** Realtime events that change what the player sees. Everything else is operator-only. */
const SNAPSHOT_EVENTS = new Set(['activity', 'game_status', 'stage_unlock', 'submission_status'])
const DATA_EVENTS = new Set(['game_config', 'stage_unlock', 'game_status'])

export type ActionResult =
  | { state: 'synced'; response?: unknown }
  | { state: 'queued' }
  | { state: 'failed'; error: string; code?: string | null }
  | { state: 'auth' }

function fromOutcome(o: SyncOutcome | undefined): ActionResult {
  if (!o) return { state: 'queued' }
  switch (o.result) {
    case 'synced': return { state: 'synced', response: o.response }
    case 'retry_later': return { state: 'queued' }
    case 'failed': return { state: 'failed', error: o.error, code: o.code }
    case 'auth_required': return { state: 'auth' }
  }
}

/**
 * Everything the player screens need for one game: cached game data, the canonical
 * snapshot, the local queue merged in, realtime invalidation, and the two actions.
 * Network failures fall back to the last cached copy so the app keeps working in the woods.
 */
export function usePlayerGame() {
  const auth = useAuth()
  const { client, queue, media } = useServices()
  const qc = useQueryClient()
  const gameId = auth.kind === 'player' ? auth.gameId : null
  const teamId = auth.kind === 'player' ? auth.teamId : null
  const [fromCache, setFromCache] = useState(false)
  const [pending, setPending] = useState<PendingAction[]>([])
  const [needsAuth, setNeedsAuth] = useState(false)
  const previous = useRef<Logbook | null>(null)
  const [unlocked, setUnlocked] = useState<string[]>([])

  const cached = useCallback(
    async <T,>(key: string, fetcher: () => Promise<T>, version: (v: T) => number): Promise<T> => {
      try {
        const value = await fetcher()
        await gameCache.save(key, version(value), value).catch(() => {})
        setFromCache(false)
        return value
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          const hit = await gameCache.load<T>(key).catch(() => null)
          if (hit) {
            setFromCache(true)
            return hit.snapshot
          }
        }
        throw err
      }
    },
    [],
  )

  const data = useQuery({
    queryKey: ['gameData', gameId],
    queryFn: () => cached(`data:${auth.kind === 'player' ? auth.playerId : ''}:${gameId}`, () => client.api.player.gameData(gameId!), () => 0),
    enabled: gameId !== null,
    staleTime: 60_000,
  })
  const snapshot = useQuery({
    queryKey: ['snapshot', gameId],
    queryFn: () => cached(`snapshot:${auth.kind === 'player' ? auth.playerId : ''}:${gameId}`, () => client.api.player.snapshot(gameId!), (s: PlayerSnapshotResponse) => s.stateVersion),
    enabled: gameId !== null,
    staleTime: 15_000,
  })

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['snapshot', gameId] })
    void qc.invalidateQueries({ queryKey: ['gameData', gameId] })
  }, [qc, gameId])

  // Local queue, kept in sync with the store.
  useEffect(() => {
    let alive = true
    const refresh = () => queue.list().then((l) => alive && setPending(l.filter((a) => a.gameId === gameId)))
    void refresh()
    const off = queue.onChange(() => void refresh())
    return () => { alive = false; off() }
  }, [queue, gameId])

  // Sync: on mount, when the network returns, and every half minute while something is pending.
  const sync = useCallback(async () => {
    const report = await queue.sync()
    if (report.authRequired) setNeedsAuth(true)
    if (report.outcomes.some((o) => o.result === 'synced')) invalidate()
    return report
  }, [queue, invalidate])

  useEffect(() => {
    const initialSync = window.setTimeout(() => void sync(), 0)
    const online = () => void sync()
    window.addEventListener('online', online)
    const timer = window.setInterval(() => { if (pending.length) void sync() }, 30_000)
    return () => { window.clearTimeout(initialSync); window.removeEventListener('online', online); window.clearInterval(timer) }
  }, [sync, pending.length])

  // Realtime is invalidation; the snapshot is canonical.
  useEffect(() => {
    if (!gameId) return
    client.realtime.connect(gameId)
    const offEvent = client.realtime.onEvent((e) => {
      if (SNAPSHOT_EVENTS.has(e.type)) void qc.invalidateQueries({ queryKey: ['snapshot', gameId] })
      if (DATA_EVENTS.has(e.type)) void qc.invalidateQueries({ queryKey: ['gameData', gameId] })
      if (e.type === 'notification') void qc.invalidateQueries({ queryKey: ['notifications'] })
    })
    const offReconnect = client.realtime.onReconnect(() => { invalidate(); void sync() })
    return () => { offEvent(); offReconnect(); client.realtime.disconnect() }
  }, [client, qc, gameId, invalidate, sync])

  const logbook = useMemo(
    () => (snapshot.data && data.data ? buildLogbook(snapshot.data.progress, data.data.bases, pending) : null),
    [snapshot.data, data.data, pending],
  )

  // The "you unlocked something" moment: bases that turned from locked to open.
  useEffect(() => {
    if (!logbook) return
    const fresh = newlyUnlocked(previous.current, logbook)
    previous.current = logbook
    if (fresh.length) setUnlocked(fresh)
  }, [logbook])

  const checkIn = useCallback(async (baseId: string, nfcToken: string): Promise<ActionResult> => {
    if (!gameId) return { state: 'auth' }
    const action = await queue.enqueueCheckIn({ id: crypto.randomUUID(), gameId, baseId, nfcToken })
    const report = await sync()
    const r = fromOutcome(report.outcomes.find((o) => o.id === action.id))
    return r.state === 'synced' ? { state: 'synced', response: r.response as CheckInResponse | undefined } : r
  }, [gameId, queue, sync])

  const submit = useCallback(async (baseId: string, challengeId: string, answer: string, fileUrls?: string[]): Promise<ActionResult> => {
    if (!gameId) return { state: 'auth' }
    const action = await queue.enqueueSubmission({ id: crypto.randomUUID(), gameId, baseId, challengeId, answer, fileUrls: fileUrls ?? null })
    const report = await sync()
    const r = fromOutcome(report.outcomes.find((o) => o.id === action.id))
    return r.state === 'synced' ? { state: 'synced', response: r.response as SubmissionResponse | undefined } : r
  }, [gameId, queue, sync])

  /** Photo/video answers: files are copied into app-owned storage before the action is queued. */
  const submitMedia = useCallback(async (baseId: string, challengeId: string, answer: string, files: File[]): Promise<ActionResult> => {
    if (!gameId) return { state: 'auth' }
    const action = await media.enqueueSubmission({ id: crypto.randomUUID(), gameId, baseId, challengeId, answer, files })
    const report = await sync()
    const r = fromOutcome(report.outcomes.find((o) => o.id === action.id))
    return r.state === 'synced' ? { state: 'synced', response: r.response as SubmissionResponse | undefined } : r
  }, [gameId, media, sync])

  return {
    gameId,
    teamId,
    data: data.data as GameDataResponse | undefined,
    snapshot: snapshot.data,
    logbook,
    pending,
    isLoading: data.isLoading || snapshot.isLoading,
    error: (data.error ?? snapshot.error) as Error | null,
    fromCache,
    needsAuth,
    unlocked,
    clearUnlocked: () => setUnlocked([]),
    refetch: invalidate,
    sync,
    checkIn,
    submit,
    submitMedia,
    retry: (id: string) => queue.retry(id).then(() => sync()),
    discard: (id: string) => queue.discard(id),
  }
}

export type PlayerGame = ReturnType<typeof usePlayerGame>
