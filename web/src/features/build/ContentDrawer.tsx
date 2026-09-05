import { Plus, Shuffle, X } from 'lucide-react'
import { useWorkspaceStore, type DrawerTab } from '@/stores/workspace'
import { useCreateBase } from '@/hooks/mutations/useBaseMutations'
import { useCreateChallenge } from '@/hooks/mutations/useChallengeMutations'
import { useCreateTeam } from '@/hooks/mutations/useTeamMutations'
import { useCreateStage } from '@/hooks/mutations/useStageMutations'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { SlideDrawer } from '@/components/layout/SlideDrawer'
import { BasesTab } from './BasesTab'
import { ChallengesTab } from './ChallengesTab'
import { TeamsTab } from './TeamsTab'
import StagesTab from './StagesTab'

const tabs: Array<{ key: DrawerTab; label: string; newLabel: string }> = [
  { key: 'bases', label: 'Bases', newLabel: 'New Base' },
  { key: 'challenges', label: 'Challenges', newLabel: 'New Challenge' },
  { key: 'teams', label: 'Teams', newLabel: 'New Team' },
  { key: 'stages', label: 'Stages', newLabel: 'New Stage' },
]

interface ContentDrawerProps {
  gameId: string
}

export function ContentDrawer({ gameId }: ContentDrawerProps) {
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const drawerTab = useWorkspaceStore((s) => s.drawerTab)
  const setDrawerTab = useWorkspaceStore((s) => s.setDrawerTab)
  const closeDrawer = useWorkspaceStore((s) => s.closeDrawer)

  const createBase = useCreateBase(gameId)
  const createChallenge = useCreateChallenge(gameId)
  const createTeam = useCreateTeam(gameId)
  const createStage = useCreateStage(gameId)
  const setAssignments = useSetAssignments(gameId)

  const { data: bases = [] } = useBases(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  // Keep the query alive so child tabs share the cache
  useAssignments(gameId)

  const currentTabMeta = tabs.find((t) => t.key === drawerTab)

  const handleNew = () => {
    switch (drawerTab) {
      case 'bases':
        createBase.mutate({
          name: `Base ${bases.length + 1}`,
          description: '',
          lat: 0,
          lng: 0,
        })
        break
      case 'challenges':
        createChallenge.mutate({
          title: `Challenge ${challenges.length + 1}`,
          description: '',
          content: '',
          completionContent: '',
          answerType: 'text',
          autoValidate: false,
          points: 10,
          locationBound: false,
        })
        break
      case 'teams':
        createTeam.mutate({ name: `Team ${Date.now().toString(36).slice(-4).toUpperCase()}` })
        break
      case 'stages':
        createStage.mutate({
          name: `Stage ${Date.now().toString(36).slice(-4).toUpperCase()}`,
          transitionType: 'manual',
        })
        break
    }
  }

  const handleAutoAssign = () => {
    // Auto-assign: create one assignment per base+challenge combo for all teams
    const newAssignments = bases.flatMap((base) =>
      challenges.map((challenge) => ({
        gameId,
        baseId: base.id,
        challengeId: challenge.id,
      })),
    )
    if (newAssignments.length > 0) {
      setAssignments.mutate(newAssignments)
    }
  }

  return (
    <SlideDrawer
      open={drawerOpen}
      onClose={closeDrawer}
      width="md:w-[70vw]"
    >
      {/* Header with tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        {/* Tab group */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1" data-testid="drawer-tabs">
          {tabs.map(({ key, label }) => {
            const isActive = drawerTab === key
            return (
              <button
                key={key}
                onClick={() => setDrawerTab(key)}
                data-testid={`tab-${key}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Auto-assign button (bases tab only) */}
        {drawerTab === 'bases' && (
          <button
            onClick={handleAutoAssign}
            data-testid="auto-assign-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors cursor-pointer"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Auto-assign
          </button>
        )}

        {/* "+ New" button */}
        {currentTabMeta && (
          <button
            onClick={handleNew}
            data-testid="new-entity-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {currentTabMeta.newLabel}
          </button>
        )}

        {/* Close button */}
        <button
          onClick={closeDrawer}
          data-testid="drawer-close"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <TabContent tab={drawerTab} gameId={gameId} />
      </div>
    </SlideDrawer>
  )
}

function TabContent({ tab, gameId }: { tab: DrawerTab; gameId: string }) {
  switch (tab) {
    case 'bases':
      return <BasesTab gameId={gameId} />
    case 'challenges':
      return <ChallengesTab gameId={gameId} />
    case 'teams':
      return <TeamsTab gameId={gameId} />
    case 'stages':
      return <StagesTab gameId={gameId} />
  }
}
