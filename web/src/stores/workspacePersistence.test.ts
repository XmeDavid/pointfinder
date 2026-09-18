import { describe, it, expect, vi, beforeEach } from 'vitest'

const memory = vi.hoisted(() => new Map<string, string>())
vi.mock('@/platform', () => ({
  isNative: () => false,
  kv: {
    get: async (key: string) => memory.get(key) ?? null,
    set: async (key: string, value: string) => {
      memory.set(key, value)
    },
    remove: async (key: string) => {
      memory.delete(key)
    },
  },
}))

import { useWorkspaceStore } from './workspace'
import {
  __flushWorkspaceWritesForTests,
  applyWorkspaceSnapshot,
  clearWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from './workspacePersistence'

describe('workspace persistence (OW-38)', () => {
  beforeEach(() => {
    memory.clear()
    useWorkspaceStore.getState().reset()
  })

  it('round-trips the editor selection, drawer and mode per game', async () => {
    const store = useWorkspaceStore.getState()
    store.setMode('build')
    store.openBaseChallenge('base-1', 'challenge-1')
    store.setSettingsPanelOpen(true)
    saveWorkspaceSnapshot('u1', 'g1', useWorkspaceStore.getState())
    await __flushWorkspaceWritesForTests()

    useWorkspaceStore.getState().reset()
    expect(useWorkspaceStore.getState().selectedChallengeId).toBeNull()

    const snapshot = await loadWorkspaceSnapshot('u1', 'g1')
    expect(snapshot).not.toBeNull()
    applyWorkspaceSnapshot(snapshot!)
    const state = useWorkspaceStore.getState()
    expect(state.selectedBaseId).toBe('base-1')
    expect(state.selectedChallengeId).toBe('challenge-1')
    expect(state.challengeOriginBaseId).toBe('base-1')
    expect(state.drawerOpen).toBe(true)
    expect(state.drawerTab).toBe('challenges')
    expect(state.settingsPanelOpen).toBe(true)
    expect(await loadWorkspaceSnapshot('u1', 'other')).toBeNull()
    expect(await loadWorkspaceSnapshot('other-user', 'g1')).toBeNull()
  })

  it('leaves transient inspection state out of the snapshot', async () => {
    const store = useWorkspaceStore.getState()
    store.inspectTeam('team-1')
    store.saveMapView([1, 2], 12)
    store.toggleLeaderboard()
    saveWorkspaceSnapshot('u1', 'g1', useWorkspaceStore.getState())
    await __flushWorkspaceWritesForTests()
    const raw = JSON.parse(memory.get('workspace:u1:g1')!)
    expect(raw).not.toHaveProperty('inspectedTeamId')
    expect(raw).not.toHaveProperty('preInspectMapView')
    expect(raw).not.toHaveProperty('leaderboardOpen')
  })

  it('drops a snapshot older than a day and clears on request', async () => {
    memory.set('workspace:u1:g1', JSON.stringify({ mode: 'build', drawerOpen: true, drawerTab: 'bases', selectedBaseId: 'b', selectedChallengeId: null, challengeOriginBaseId: null, selectedTeamId: null, selectedStageId: null, settingsPanelOpen: false, teamLocationsVisible: false, savedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }))
    expect(await loadWorkspaceSnapshot('u1', 'g1')).toBeNull()
    saveWorkspaceSnapshot('u1', 'g1', useWorkspaceStore.getState())
    await clearWorkspaceSnapshot('u1', 'g1')
    expect(memory.has('workspace:u1:g1')).toBe(false)
  })
})
