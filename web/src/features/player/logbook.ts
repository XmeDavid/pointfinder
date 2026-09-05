import type { Base, BaseProgress, GameDataResponse } from '@pointfinder/api'
import { mergeProgress, summarize, type BaseView, type PendingAction, type ProgressSummary } from '@pointfinder/game-core'

/**
 * One row in the team's logbook.
 * `open` rows are bases the backend lets this team see, merged with the local queue.
 * `locked` rows are hidden bases the backend included only as unlock targets: the team
 * knows something is there, but not what. Truly hidden bases never reach the client.
 */
export type LogbookEntry =
  | { kind: 'open'; baseId: string; title: string; view: BaseView; nfcLinked: boolean }
  | { kind: 'locked'; baseId: string }

export interface Logbook {
  entries: LogbookEntry[]
  summary: ProgressSummary
  /** Open bases the team has not finished yet, in server order. */
  nextUp: LogbookEntry[]
}

export function buildLogbook(progress: BaseProgress[], bases: Pick<Base, 'id' | 'hidden'>[], pending: PendingAction[]): Logbook {
  const views = mergeProgress(progress, pending).sort((a, b) =>
    typeof a.sequenceNumber === 'number' && typeof b.sequenceNumber === 'number' ? a.sequenceNumber - b.sequenceNumber : 0,
  )
  const visible = new Set(views.map((v) => v.baseId))
  const open: LogbookEntry[] = views.map((view) => ({
    kind: 'open',
    baseId: view.baseId,
    title: view.challengeTitle ?? '',
    view,
    nfcLinked: view.nfcLinked,
  }))
  const locked: LogbookEntry[] = bases
    .filter((b) => b.hidden && !visible.has(b.id))
    .map((b) => ({ kind: 'locked', baseId: b.id }))
  const entries = [...open, ...locked]
  return {
    entries,
    summary: summarize(views),
    nextUp: open.filter((e) => e.kind === 'open' && e.view.effectiveStatus !== 'completed'),
  }
}

/** Bases that became visible between two logbooks: the "you unlocked something" moment. */
export function newlyUnlocked(before: Logbook | null, after: Logbook): string[] {
  if (!before) return []
  const was = new Set(before.entries.filter((e) => e.kind === 'open').map((e) => e.baseId))
  return after.entries.filter((e) => e.kind === 'open' && !was.has(e.baseId)).map((e) => e.baseId)
}

/** The challenge the team must solve at a base, resolved from the cached game data. */
export function challengeForBase(data: GameDataResponse, baseId: string, teamId: string) {
  const base = data.bases.find((b) => b.id === baseId)
  const assignment =
    data.assignments.find((a) => a.baseId === baseId && a.teamId === teamId) ??
    data.assignments.find((a) => a.baseId === baseId && !a.teamId)
  const challengeId = assignment?.challengeId ?? base?.fixedChallengeId ?? null
  return challengeId ? (data.challenges.find((c) => c.id === challengeId) ?? null) : null
}
