import { kv } from '@/platform'
import { isNative } from '@/platform/runtime'
import { useWorkspaceStore, type DrawerTab, type GameMode } from './workspace'

/**
 * OW-38: the operator workspace lives in memory. When the phone kills the
 * WebView, the game reopens on a bare map with nothing selected. This keeps
 * the parts of the workspace worth returning to, per game, in the platform
 * key-value store, and puts them back when the workspace mounts again.
 * Map inspection state, leaderboards and dialogs are deliberately left out.
 */
export interface WorkspaceSnapshot {
  mode: GameMode
  drawerOpen: boolean
  drawerTab: DrawerTab
  selectedBaseId: string | null
  selectedChallengeId: string | null
  challengeOriginBaseId: string | null
  selectedTeamId: string | null
  selectedStageId: string | null
  settingsPanelOpen: boolean
  teamLocationsVisible: boolean
  savedAt: number
}

const PREFIX = 'workspace:'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const writes = new Map<string, Promise<void>>()
const storageKey = (accountId: string, gameId: string) => `${PREFIX}${accountId}:${gameId}`
let enabledOverride: boolean | null = null

/** Phones only: a browser reload keeps the URL and the drafts, which is enough there. */
export function workspacePersistenceEnabled(): boolean {
  return enabledOverride ?? isNative()
}

/** Test seam. */
export function __setWorkspacePersistenceForTests(value: boolean | null): void {
  enabledOverride = value
}

export function snapshotWorkspace(state: ReturnType<typeof useWorkspaceStore.getState>): WorkspaceSnapshot {
  return {
    mode: state.mode,
    drawerOpen: state.drawerOpen,
    drawerTab: state.drawerTab,
    selectedBaseId: state.selectedBaseId,
    selectedChallengeId: state.selectedChallengeId,
    challengeOriginBaseId: state.challengeOriginBaseId,
    selectedTeamId: state.selectedTeamId,
    selectedStageId: state.selectedStageId,
    settingsPanelOpen: state.settingsPanelOpen,
    teamLocationsVisible: state.teamLocationsVisible,
    savedAt: Date.now(),
  }
}

export async function loadWorkspaceSnapshot(accountId: string, gameId: string): Promise<WorkspaceSnapshot | null> {
  try {
    const raw = await kv.get(storageKey(accountId, gameId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceSnapshot
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (!['build', 'command', 'review', 'results'].includes(parsed.mode) || !['bases', 'challenges', 'teams', 'stages', 'nfc', 'documents'].includes(parsed.drawerTab)) return null
    for (const field of ['drawerOpen', 'settingsPanelOpen', 'teamLocationsVisible'] as const) if (typeof parsed[field] !== 'boolean') return null
    for (const field of ['selectedBaseId', 'selectedChallengeId', 'challengeOriginBaseId', 'selectedTeamId', 'selectedStageId'] as const) if (parsed[field] !== null && typeof parsed[field] !== 'string') return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function persist(key: string, snapshot: WorkspaceSnapshot | null): Promise<void> {
  const previous = writes.get(key) ?? Promise.resolve()
  const next = previous.then(() => snapshot ? kv.set(key, JSON.stringify(snapshot)) : kv.remove(key)).catch(() => {}).finally(() => {
    if (writes.get(key) === next) writes.delete(key)
  })
  writes.set(key, next)
  return next
}

/** Capture the owning account/game now; later navigation cannot change this write. */
export function saveWorkspaceSnapshot(accountId: string, gameId: string, state: ReturnType<typeof useWorkspaceStore.getState>): void {
  void persist(storageKey(accountId, gameId), snapshotWorkspace(state))
}

export async function clearWorkspaceSnapshot(accountId: string, gameId: string): Promise<void> {
  await persist(storageKey(accountId, gameId), null)
}

export function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  useWorkspaceStore.setState({
    mode: snapshot.mode,
    drawerOpen: snapshot.drawerOpen,
    drawerTab: snapshot.drawerTab,
    selectedBaseId: snapshot.selectedBaseId,
    selectedChallengeId: snapshot.selectedChallengeId,
    challengeOriginBaseId: snapshot.challengeOriginBaseId,
    selectedTeamId: snapshot.selectedTeamId,
    selectedStageId: snapshot.selectedStageId,
    settingsPanelOpen: snapshot.settingsPanelOpen,
    teamLocationsVisible: snapshot.teamLocationsVisible,
  })
}

/** Await the snapshots already captured by store notifications. */
export async function __flushWorkspaceWritesForTests(): Promise<void> {
  while (writes.size) await Promise.all(writes.values())
}
