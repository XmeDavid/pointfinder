import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ActiveWorkspace =
  | { type: 'personal' }
  | { type: 'org'; orgId: string; orgName: string }

interface WorkspaceContextState {
  active: ActiveWorkspace
  setActive: (workspace: ActiveWorkspace) => void
}

export const useWorkspaceContext = create<WorkspaceContextState>()(
  persist(
    (set) => ({
      active: { type: 'personal' },
      setActive: (workspace) => set({ active: workspace }),
    }),
    {
      name: 'pointfinder-workspace',
    }
  )
)
