import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useIsMutating } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/lib/api/errors'
import { Plus, Shuffle, X } from 'lucide-react'
import { useWorkspaceStore, type DrawerTab } from '@/stores/workspace'
import { useCreateChallenge } from '@/hooks/mutations/useChallengeMutations'
import { useCreateTeam } from '@/hooks/mutations/useTeamMutations'
import { useCreateStage } from '@/hooks/mutations/useStageMutations'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { useGame } from '@/hooks/queries/useGames'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { SlideDrawer } from '@/components/layout/SlideDrawer'
import { BasesTab } from './BasesTab'
import { ChallengesTab } from './ChallengesTab'
import { TeamsTab } from './TeamsTab'
import StagesTab from './StagesTab'
import { NfcTagsManager } from './NfcTagsPage'
import { ResourceBrowser } from '@/features/org/ResourceBrowser'

const tabs: Array<{ key: DrawerTab; label: string; newLabel: string }> = [
  { key: 'bases', label: 'bases', newLabel: 'newBase' },
  { key: 'challenges', label: 'challenges', newLabel: 'newChallenge' },
  { key: 'teams', label: 'teams', newLabel: 'newTeam' },
  { key: 'stages', label: 'stages', newLabel: 'newStage' },
  { key: 'nfc', label: 'nfcTags', newLabel: '' },
  { key: 'documents', label: 'documents', newLabel: '' },
]

interface ContentDrawerProps {
  gameId: string
  onCreateBase: () => void
}

export function ContentDrawer({ gameId, onCreateBase }: ContentDrawerProps) {
  const { t } = useTranslation()
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const drawerTab = useWorkspaceStore((s) => s.drawerTab)
  const tabStrip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    tabStrip.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [drawerTab, drawerOpen])
  const setDrawerTab = useWorkspaceStore((s) => s.setDrawerTab)
  const closeDrawer = useWorkspaceStore((s) => s.closeDrawer)

  const createChallenge = useCreateChallenge(gameId)
  const createTeam = useCreateTeam(gameId)
  const createStage = useCreateStage(gameId)
  const setAssignments = useSetAssignments(gameId)
  const [autoAssignError, setAutoAssignError] = useState<string | null>(null)
  const writingAssignments =
    useIsMutating({ mutationKey: ['assignments', 'set'] }) > 0

  const { data: game } = useGame(gameId)
  const baseRouteLocked = !!game?.enforceBaseOrder && game.status !== 'setup'
  const { data: bases = [] } = useBases(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  // Keep the query alive so child tabs share the cache
  const { data: assignments = [] } = useAssignments(gameId)

  const currentTabMeta = tabs.find((t) => t.key === drawerTab)
  // Tags & codes is no longer phone-only: QR codes are generated and printed
  // in the browser. The NFC write control inside the tab stays native-gated.
  const visibleTabs = tabs

  const handleNew = () => {
    switch (drawerTab) {
      case 'bases':
        if (baseRouteLocked) return
        closeDrawer()
        onCreateBase()
        break
      case 'challenges':
        createChallenge.mutate(
          {
            title: `${t('build.editor.newChallenge')} ${challenges.length + 1}`,
            description: '',
            content: '',
            completionContent: '',
            answerType: 'none',
            autoValidate: false,
            points: 0,
            locationBound: false,
          },
          {
            onSuccess: (created) =>
              useWorkspaceStore.getState().selectChallenge(created.id),
          },
        )
        break
      case 'teams':
        createTeam.mutate({
          name: `Team ${Date.now().toString(36).slice(-4).toUpperCase()}`,
        })
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
    // An "all teams" challenge waits at exactly one base and a base carries one
    // such challenge, so auto-assign pairs the bases that have nothing yet with
    // the challenges nobody uses, in order. Existing assignments (including
    // per-team ones and fixed challenges) are kept as they are.
    const assignedBases = new Set(assignments.map((a) => a.baseId))
    const usedChallenges = new Set(assignments.map((a) => a.challengeId))
    for (const base of bases)
      if (base.fixedChallengeId) usedChallenges.add(base.fixedChallengeId)
    const openBases = bases.filter(
      (base) => !assignedBases.has(base.id) && !base.fixedChallengeId,
    )
    const openChallenges = challenges.filter(
      (challenge) => !usedChallenges.has(challenge.id),
    )
    const pairs = openBases.slice(0, openChallenges.length).map((base, i) => ({
      gameId,
      baseId: base.id,
      challengeId: openChallenges[i].id,
    }))
    if (pairs.length === 0) return
    const kept = assignments.map((a) => ({
      gameId,
      baseId: a.baseId,
      challengeId: a.challengeId,
      teamId: a.teamId,
    }))
    setAutoAssignError(null)
    setAssignments.mutate([...kept, ...pairs], {
      onError: (err) =>
        setAutoAssignError(
          getApiErrorMessage(err, t('build.assignments.autoAssignFailed')),
        ),
    })
  }

  return (
    <SlideDrawer open={drawerOpen} onClose={closeDrawer} width="md:w-[70vw]">
      {/* Header with tabs */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-3 border-b border-border shrink-0">
        {/* Tab group */}
        <div
          className={`flex min-w-0 flex-wrap items-center gap-1 bg-muted rounded-lg p-1 md:flex-nowrap md:overflow-x-auto ${currentTabMeta?.newLabel ? 'order-2 w-full md:order-none md:w-auto' : 'flex-1'}`}
          ref={tabStrip}
          data-testid="drawer-tabs"
        >
          {visibleTabs.map(({ key, label }) => {
            const isActive = drawerTab === key
            return (
              <button
                key={key}
                aria-pressed={drawerTab === key}
                onClick={() => setDrawerTab(key)}
                data-testid={`tab-${key}`}
                className={`min-h-11 flex-1 shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`build.drawer.${label}`)}
              </button>
            )
          })}
        </div>

        {currentTabMeta?.newLabel && <div className="flex-1" />}

        {/* "+ New" button */}
        {currentTabMeta?.newLabel && (
          <button
            onClick={handleNew}
            data-testid="new-entity-btn"
            disabled={drawerTab === 'bases' && baseRouteLocked}
            title={
              drawerTab === 'bases' && baseRouteLocked
                ? t('baseOrder.setupOnly', {
                    defaultValue:
                      'Base order can only be changed during setup.',
                  })
                : undefined
            }
            className="disabled:cursor-not-allowed disabled:opacity-50 inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {t(`build.drawer.${currentTabMeta.newLabel}`)}
          </button>
        )}

        {/* Close button */}
        <button
          onClick={closeDrawer}
          data-testid="drawer-close"
          aria-label={t('playerApp.common.close')}
          className="h-11 w-11 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 flex min-h-0">
        <TabContent
          tab={drawerTab}
          gameId={gameId}
          autoLinkAction={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9 w-9 shrink-0 px-0"
              onClick={handleAutoAssign}
              disabled={writingAssignments || game?.status === 'ended'}
              data-testid="auto-assign-btn"
              aria-label={t('build.drawer.autoAssign')}
              title={t('build.drawer.autoAssign')}
            >
              <Shuffle className="h-4 w-4" aria-hidden />
            </Button>
          }
          autoLinkFeedback={
            autoAssignError && (
              <p
                className="px-3 py-2 text-xs text-destructive"
                role="alert"
                data-testid="auto-assign-error"
              >
                {autoAssignError}
              </p>
            )
          }
        />
      </div>
    </SlideDrawer>
  )
}

function TabContent({
  tab,
  gameId,
  autoLinkAction,
  autoLinkFeedback,
}: {
  tab: DrawerTab
  gameId: string
  autoLinkAction: ReactNode
  autoLinkFeedback: ReactNode
}) {
  switch (tab) {
    case 'bases':
      return (
        <BasesTab
          gameId={gameId}
          autoLinkAction={autoLinkAction}
          autoLinkFeedback={autoLinkFeedback}
        />
      )
    case 'challenges':
      return <ChallengesTab gameId={gameId} />
    case 'teams':
      return <TeamsTab gameId={gameId} />
    case 'stages':
      return <StagesTab gameId={gameId} />
    case 'nfc':
      return <NfcTagsManager gameId={gameId} />
    case 'documents':
      return <ResourceBrowser key={gameId} gameId={gameId} showShareToggle />
  }
}
