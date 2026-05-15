import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { LifeBuoy } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { InspectorPanel } from '@/components/layout/InspectorPanel'
import {
  BaseProgressBadge,
  NfcStatusBadge,
  StatusBadge,
} from '@/components/status'
import { Button } from '@/components/ui/button'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useProgress } from '@/hooks/queries/useMonitoring'
import { useTeams } from '@/hooks/queries/useTeams'
import { relativeTime } from '@/lib/utils/dates'
import { useWorkspaceStore } from '@/stores/workspace'
import type { BaseStatus } from '@/types'
import { RescueDialog } from './RescueDialog'

const statusSortOrder: Record<BaseStatus, number> = {
  submitted: 0,
  checked_in: 1,
  rejected: 2,
  completed: 3,
  not_visited: 4,
}

function answerTypeLabel(answerType: 'text' | 'file' | 'none') {
  if (answerType === 'none') return 'None'
  return answerType.charAt(0).toUpperCase() + answerType.slice(1)
}

function answerTypeTone(answerType: 'text' | 'file' | 'none') {
  if (answerType === 'text') return 'info'
  if (answerType === 'file') return 'warning'
  return 'muted'
}

export function BaseInspector({ gameId }: { gameId: string }) {
  const inspectedBaseId = useWorkspaceStore((s) => s.inspectedBaseId)
  const inspectBase = useWorkspaceStore((s) => s.inspectBase)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)

  const { data: bases = [] } = useBases(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: progress = [] } = useProgress(gameId)

  const [rescueOpen, setRescueOpen] = useState(false)

  const base = bases.find((b) => b.id === inspectedBaseId)

  const baseAssignments = useMemo(
    () => assignments.filter((a) => a.baseId === inspectedBaseId),
    [assignments, inspectedBaseId],
  )

  const baseChallenges = useMemo(() => {
    const challengeIds = [...new Set(baseAssignments.map((a) => a.challengeId))]
    return challenges.filter((c) => challengeIds.includes(c.id))
  }, [baseAssignments, challenges])

  const baseProgress = useMemo(
    () => progress.filter((p) => p.baseId === inspectedBaseId),
    [progress, inspectedBaseId],
  )

  const teamRows = useMemo(() => {
    return teams
      .map((team) => {
        const entry = baseProgress.find((p) => p.teamId === team.id)
        const status: BaseStatus = entry?.status ?? 'not_visited'
        const assignment = baseAssignments.find(
          (a) => !a.teamId || a.teamId === team.id,
        )
        const challenge = assignment
          ? challenges.find((c) => c.id === assignment.challengeId)
          : undefined
        return { team, status, entry, challenge }
      })
      .sort((a, b) => statusSortOrder[a.status] - statusSortOrder[b.status])
  }, [teams, baseProgress, baseAssignments, challenges])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') inspectBase(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspectBase])

  function navigateToChallenge(challengeId: string) {
    setMode('build')
    selectChallenge(challengeId)
  }

  if (!base || !inspectedBaseId) return null

  const coordinates =
    base.lat !== 0 || base.lng !== 0
      ? `${base.lat.toFixed(5)}, ${base.lng.toFixed(5)}`
      : undefined

  return (
    <>
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute bottom-3 right-3 top-14 z-30 w-[350px]"
      >
        <InspectorPanel
          data-testid="base-inspector"
          title={base.name}
          subtitle={coordinates}
          className="h-full"
          closeButtonTestId="base-inspector-close"
          onClose={() => inspectBase(null)}
          actions={
            <>
              <NfcStatusBadge status={base.nfcLinked ? 'linked' : 'missing'} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Rescue actions"
                aria-label="Rescue actions"
                onClick={() => setRescueOpen(true)}
                data-testid="base-inspector-rescue"
              >
                <LifeBuoy size={16} aria-hidden="true" />
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <section>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Challenges at this base
              </span>
              {baseChallenges.length === 0 ? (
                <EmptyState
                  density="compact"
                  title="No challenges assigned"
                  className="min-h-24"
                />
              ) : (
                <div className="mt-2 space-y-1.5">
                  {baseChallenges.map((challenge) => (
                    <div
                      key={challenge.id}
                      className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5"
                    >
                      <button
                        onClick={() => navigateToChallenge(challenge.id)}
                        className="flex-1 cursor-pointer truncate text-left text-xs font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {challenge.title}
                      </button>
                      <StatusBadge
                        tone={answerTypeTone(challenge.answerType)}
                        label={answerTypeLabel(challenge.answerType)}
                        size="sm"
                      />
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                        {challenge.points}pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="border-t border-border/30" />

            <section>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Team Progress
              </span>
              <div className="mt-2 space-y-1.5">
                {teamRows.map(({ team, status, entry, challenge }) => (
                  <div
                    key={team.id}
                    className="rounded-lg border border-border bg-card px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="flex-1 truncate text-xs font-medium">
                        {team.name}
                      </span>
                      <BaseProgressBadge status={status} />
                    </div>
                    {challenge && (
                      <div className="ml-4.5 mt-1 flex items-center gap-1.5">
                        <button
                          onClick={() => navigateToChallenge(challenge.id)}
                          className="cursor-pointer truncate text-[11px] text-muted-foreground transition-colors hover:text-primary"
                        >
                          {challenge.title}
                        </button>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {challenge.points}pts
                        </span>
                      </div>
                    )}
                    {entry?.checkedInAt && (
                      <div className="ml-4.5 mt-1 text-[10px] text-muted-foreground">
                        {relativeTime(entry.checkedInAt)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </InspectorPanel>
      </motion.div>

      {rescueOpen && (
        <RescueDialog
          gameId={gameId}
          baseId={inspectedBaseId}
          baseHidden={base.hidden}
          onClose={() => setRescueOpen(false)}
        />
      )}
    </>
  )
}
