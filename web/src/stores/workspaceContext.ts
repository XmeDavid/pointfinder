import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Workspace } from '../types/organization'

export type ActiveWorkspace =
  | { type: 'personal' }
  | { type: 'org'; orgId: string; orgName: string }

interface WorkspaceContextState {
  active: ActiveWorkspace
  setActive: (workspace: ActiveWorkspace) => void
  /**
   * Reconcile the persisted workspace with what the server says this account
   * can reach. The active org survives a rename, but an org the account no
   * longer belongs to (left, removed, or deleted) falls back to personal, so a
   * stale device never sits in a workspace whose requests all 403.
   */
  reconcile: (workspaces: Workspace) => void
}

export const useWorkspaceContext = create<WorkspaceContextState>()(
  persist(
    (set, get) => ({
      active: { type: 'personal' },
      setActive: (workspace) => set({ active: workspace }),
      reconcile: (workspaces) => {
        const active = get().active
        if (active.type !== 'org') return
        const match = workspaces.organizations.find((org) => org.id === active.orgId)
        if (!match) {
          set({ active: { type: 'personal' } })
          return
        }
        if (match.name !== active.orgName) {
          set({ active: { type: 'org', orgId: match.id, orgName: match.name } })
        }
      },
    }),
    {
      name: 'pointfinder-workspace',
      // `reconcile` and `setActive` are behavior, not state worth persisting.
      partialize: (state) => ({ active: state.active }),
    }
  )
)
