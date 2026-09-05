import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'

describe('workspace store', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset()
  })

  it('starts in build mode with drawer closed', () => {
    const state = useWorkspaceStore.getState()
    expect(state.mode).toBe('build')
    expect(state.drawerOpen).toBe(false)
  })

  it('setMode switches mode and closes drawer', () => {
    const { openDrawer, setMode } = useWorkspaceStore.getState()
    openDrawer('bases')
    setMode('command')
    const state = useWorkspaceStore.getState()
    expect(state.mode).toBe('command')
    expect(state.drawerOpen).toBe(false)
    expect(state.inspectedTeamId).toBeNull()
    expect(state.settingsPanelOpen).toBe(false)
  })

  it('selectBase opens drawer to bases tab and clears other selections', () => {
    const { selectChallenge, selectBase } = useWorkspaceStore.getState()
    selectChallenge('challenge-1')
    selectBase('base-1')
    const state = useWorkspaceStore.getState()
    expect(state.selectedBaseId).toBe('base-1')
    expect(state.selectedChallengeId).toBeNull()
    expect(state.selectedTeamId).toBeNull()
    expect(state.drawerOpen).toBe(true)
    expect(state.drawerTab).toBe('bases')
  })

  it('selectChallenge opens drawer to challenges tab and clears base selection', () => {
    const { selectBase, selectChallenge } = useWorkspaceStore.getState()
    selectBase('base-1')
    selectChallenge('challenge-1')
    const state = useWorkspaceStore.getState()
    expect(state.selectedChallengeId).toBe('challenge-1')
    expect(state.selectedBaseId).toBeNull()
    expect(state.selectedTeamId).toBeNull()
    expect(state.drawerOpen).toBe(true)
    expect(state.drawerTab).toBe('challenges')
  })

  it('selectStage sets stage and clears other selections', () => {
    const { selectBase, selectChallenge, selectTeam, selectStage } = useWorkspaceStore.getState()
    selectBase('base-1')
    selectChallenge('challenge-1')
    selectTeam('team-1')
    selectStage('stage-1')
    const state = useWorkspaceStore.getState()
    expect(state.selectedStageId).toBe('stage-1')
    expect(state.selectedBaseId).toBeNull()
    expect(state.selectedChallengeId).toBeNull()
    expect(state.selectedTeamId).toBeNull()
  })

  it('selectStage(null) clears stage filter', () => {
    const { selectStage } = useWorkspaceStore.getState()
    selectStage('stage-1')
    expect(useWorkspaceStore.getState().selectedStageId).toBe('stage-1')
    selectStage(null)
    expect(useWorkspaceStore.getState().selectedStageId).toBeNull()
  })

  it('toggleLeaderboard flips state', () => {
    const { toggleLeaderboard } = useWorkspaceStore.getState()
    expect(useWorkspaceStore.getState().leaderboardOpen).toBe(false)
    toggleLeaderboard()
    expect(useWorkspaceStore.getState().leaderboardOpen).toBe(true)
    toggleLeaderboard()
    expect(useWorkspaceStore.getState().leaderboardOpen).toBe(false)
  })

  it('reset returns to initial state', () => {
    const store = useWorkspaceStore.getState()
    store.setMode('review')
    store.selectBase('base-1')
    store.toggleLeaderboard()
    store.inspectTeam('team-1')
    store.reset()
    const state = useWorkspaceStore.getState()
    expect(state.mode).toBe('build')
    expect(state.drawerOpen).toBe(false)
    expect(state.selectedBaseId).toBeNull()
    expect(state.leaderboardOpen).toBe(false)
    expect(state.inspectedTeamId).toBeNull()
  })

  it('openDrawer without tab preserves current tab', () => {
    const { setDrawerTab, closeDrawer, openDrawer } = useWorkspaceStore.getState()
    setDrawerTab('challenges')
    closeDrawer()
    openDrawer()
    const state = useWorkspaceStore.getState()
    expect(state.drawerOpen).toBe(true)
    expect(state.drawerTab).toBe('challenges')
  })

  it('openDrawer with tab changes the active tab', () => {
    const { openDrawer } = useWorkspaceStore.getState()
    openDrawer('teams')
    const state = useWorkspaceStore.getState()
    expect(state.drawerOpen).toBe(true)
    expect(state.drawerTab).toBe('teams')
  })

  it('selectBase(null) does not open drawer', () => {
    const { selectBase } = useWorkspaceStore.getState()
    selectBase(null)
    expect(useWorkspaceStore.getState().drawerOpen).toBe(false)
  })

  it('toggleNotificationSender flips state', () => {
    const { toggleNotificationSender } = useWorkspaceStore.getState()
    expect(useWorkspaceStore.getState().notificationSenderOpen).toBe(false)
    toggleNotificationSender()
    expect(useWorkspaceStore.getState().notificationSenderOpen).toBe(true)
  })

  it('toggleSettingsPanel flips state', () => {
    const { toggleSettingsPanel } = useWorkspaceStore.getState()
    expect(useWorkspaceStore.getState().settingsPanelOpen).toBe(false)
    toggleSettingsPanel()
    expect(useWorkspaceStore.getState().settingsPanelOpen).toBe(true)
  })
})
