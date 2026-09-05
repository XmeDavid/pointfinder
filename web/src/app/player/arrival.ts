import type { QueryClient } from '@tanstack/react-query'
import type { GameDataResponse, PlayerSnapshotResponse } from '@pointfinder/api'
import { emptyArrivalState, evaluateArrival, type ArrivalCandidate, type ArrivalState, type Fix } from '@pointfinder/game-core'
import { buildCandidates } from '@/features/player/arrivalCandidates'
import type { AppServices } from './client'
import { setArrivalDwell, useLocationStore } from './locationStore'
import { pushArrivalNotice } from './arrivalNotices'

/** Refusals the player never asked for. They are dropped instead of nagging in the sync banner. */
const SILENT_REFUSALS = new Set(['CHECK_IN_OUT_OF_RANGE', 'PREVIOUS_BASE_REQUIRED', 'CHECK_IN_FIX_TOO_COARSE', 'CHECK_IN_FIX_STALE'])

function playerGameId(services: AppServices): string | null {
  const auth = services.client.session.current
  return auth.kind === 'player' ? auth.gameId : null
}

/**
 * The watch runs whenever the game is live, because operators rely on team
 * positions. Until the snapshot has loaded the game is assumed live, matching
 * the map screen's own default.
 */
export function playerGameIsLive(services: AppServices, queries: QueryClient): boolean {
  const auth = services.client.session.current
  if (auth.kind !== 'player') return false
  const snapshot = queries.getQueryData<PlayerSnapshotResponse>(['snapshot', auth.gameId])
  return (snapshot?.game.status ?? auth.gameStatus ?? 'live') === 'live'
}

function titleFor(queries: QueryClient, gameId: string, baseId: string): string | null {
  const snapshot = queries.getQueryData<PlayerSnapshotResponse>(['snapshot', gameId])
  const row = snapshot?.progress.find((p) => p.baseId === baseId)
  return row?.challengeTitle?.trim() ? row.challengeTitle : null
}

/**
 * App-wide arrival detection while the app is in the foreground. Pure evaluation
 * lives in game-core; this owns the side effects: enqueue, sync, notice, back-off.
 */
export function startArrivalDetector(services: AppServices, queries: QueryClient): () => void {
  let alive = true
  let state: ArrivalState = emptyArrivalState()
  let working = false
  let latest: Fix | null = null

  const candidatesFor = async (gameId: string): Promise<ArrivalCandidate[]> => {
    const data = queries.getQueryData<GameDataResponse>(['gameData', gameId])
    const snapshot = queries.getQueryData<PlayerSnapshotResponse>(['snapshot', gameId])
    if (!data) return []
    const pending = (await services.queue.list()).filter((a) => a.gameId === gameId)
    return buildCandidates({
      bases: data.bases,
      progress: snapshot?.progress ?? data.progress ?? [],
      pending,
      game: snapshot?.game ?? data,
    })
  }

  const fire = async (gameId: string, candidate: ArrivalCandidate, fix: Fix) => {
    const action = await services.queue.enqueueCheckIn({
      id: crypto.randomUUID(),
      gameId,
      baseId: candidate.baseId,
      proof: { type: 'geo', lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, capturedAt: new Date(fix.capturedAt).toISOString(), claimed: false },
      prerequisiteCheckInIds: [],
    })
    const report = await services.queue.sync()
    const outcome = report.outcomes.find((o) => o.id === action.id)
    if (outcome?.result === 'synced') {
      await queries.invalidateQueries({ queryKey: ['snapshot', gameId] })
      await queries.invalidateQueries({ queryKey: ['gameData', gameId] })
      if (!alive) return
      pushArrivalNotice({ baseId: candidate.baseId, title: titleFor(queries, gameId, candidate.baseId), state: 'synced', hidden: candidate.hidden })
      return
    }
    if (outcome?.result === 'failed') {
      // Silent refusals were never a player action: drop them and keep watching.
      if (outcome.code && SILENT_REFUSALS.has(outcome.code)) await services.queue.discard(action.id)
      return
    }
    const stored = (await services.queue.list()).find((a) => a.id === action.id)
    if (stored?.state === 'failed') {
      if (stored.lastErrorCode && SILENT_REFUSALS.has(stored.lastErrorCode)) await services.queue.discard(action.id)
      return
    }
    if (!alive) return
    pushArrivalNotice({ baseId: candidate.baseId, title: titleFor(queries, gameId, candidate.baseId), state: 'queued', hidden: candidate.hidden })
  }

  const run = async () => {
    if (working || !alive) return
    const fix = latest
    latest = null
    if (!fix) return
    const gameId = playerGameId(services)
    if (!gameId || !playerGameIsLive(services, queries)) return
    working = true
    try {
      const candidates = await candidatesFor(gameId)
      if (!candidates.length) {
        setArrivalDwell({}, {})
        return
      }
      const result = evaluateArrival(fix, candidates, state, Date.now())
      state = result.state
      setArrivalDwell(
        { ...result.state.dwell },
        Object.fromEntries(result.claimable.map((baseId) => [baseId, true])),
      )
      for (const candidate of result.fire) {
        if (!alive) break
        try { await fire(gameId, candidate, fix) }
        catch { /* Storage or network failures stay in the durable queue for the next fix. */ }
      }
    } finally {
      working = false
      if (alive && latest) void run()
    }
  }

  const unsubscribe = useLocationStore.subscribe((next, previous) => {
    if (!next.fix || next.fix === previous.fix) return
    latest = next.fix
    void run()
  })

  return () => {
    alive = false
    unsubscribe()
    state = emptyArrivalState()
    setArrivalDwell({}, {})
  }
}
