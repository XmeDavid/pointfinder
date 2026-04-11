import { create } from 'zustand'

export type GameMode = 'build' | 'command' | 'review' | 'results'
export type DrawerTab = 'bases' | 'challenges' | 'teams' | 'stages'

interface WorkspaceState {
  mode: GameMode
  drawerOpen: boolean
  drawerTab: DrawerTab
  selectedBaseId: string | null
  selectedChallengeId: string | null
  selectedTeamId: string | null
  selectedStageId: string | null
  selectedSubmissionId: string | null
  inspectedTeamId: string | null
  inspectedBaseId: string | null
  preInspectMapView: { center: [number, number]; zoom: number } | null
  leaderboardOpen: boolean
  notificationSenderOpen: boolean
  settingsPanelOpen: boolean
}

interface WorkspaceActions {
  setMode: (mode: GameMode) => void
  openDrawer: (tab?: DrawerTab) => void
  closeDrawer: () => void
  setDrawerTab: (tab: DrawerTab) => void
  selectBase: (id: string | null) => void
  selectChallenge: (id: string | null) => void
  selectTeam: (id: string | null) => void
  selectStage: (id: string | null) => void
  selectSubmission: (id: string | null) => void
  inspectTeam: (id: string | null) => void
  inspectBase: (id: string | null) => void
  saveMapView: (center: [number, number], zoom: number) => void
  toggleLeaderboard: () => void
  toggleNotificationSender: () => void
  toggleSettingsPanel: () => void
  reset: () => void
}

const initialState: WorkspaceState = {
  mode: 'build',
  drawerOpen: false,
  drawerTab: 'bases',
  selectedBaseId: null,
  selectedChallengeId: null,
  selectedTeamId: null,
  selectedStageId: null,
  selectedSubmissionId: null,
  inspectedTeamId: null,
  inspectedBaseId: null,
  preInspectMapView: null,
  leaderboardOpen: false,
  notificationSenderOpen: false,
  settingsPanelOpen: false,
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()((set) => ({
  ...initialState,

  setMode: (mode) => set({
    mode,
    drawerOpen: false,
    inspectedTeamId: null,
    inspectedBaseId: null,
    settingsPanelOpen: false,
    preInspectMapView: null,
  }),

  openDrawer: (tab) => set(() => ({
    drawerOpen: true,
    ...(tab ? { drawerTab: tab } : {}),
  })),

  closeDrawer: () => set({ drawerOpen: false }),
  setDrawerTab: (tab) => set({ drawerTab: tab }),

  selectBase: (id) => set({
    selectedBaseId: id,
    selectedChallengeId: null,
    selectedTeamId: null,
    ...(id ? { drawerOpen: true, drawerTab: 'bases' as const } : {}),
  }),

  selectChallenge: (id) => set({
    selectedChallengeId: id,
    selectedBaseId: null,
    selectedTeamId: null,
    ...(id ? { drawerOpen: true, drawerTab: 'challenges' as const } : {}),
  }),

  selectTeam: (id) => set({
    selectedTeamId: id,
    selectedBaseId: null,
    selectedChallengeId: null,
    ...(id ? { drawerOpen: true, drawerTab: 'teams' as const } : {}),
  }),

  selectStage: (id) => set({
    selectedStageId: id,
    selectedBaseId: null,
    selectedChallengeId: null,
    selectedTeamId: null,
  }),

  selectSubmission: (id) => set({ selectedSubmissionId: id }),
  inspectTeam: (id) => set({ inspectedTeamId: id, inspectedBaseId: null, preInspectMapView: null }),
  inspectBase: (id) => set({
    inspectedBaseId: id,
    inspectedTeamId: null,
    ...(!id ? { preInspectMapView: null } : {}),
  }),
  saveMapView: (center, zoom) => set({ preInspectMapView: { center, zoom } }),
  toggleLeaderboard: () => set((s) => ({ leaderboardOpen: !s.leaderboardOpen })),
  toggleNotificationSender: () => set((s) => ({ notificationSenderOpen: !s.notificationSenderOpen })),
  toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),
  reset: () => set(initialState),
}))
