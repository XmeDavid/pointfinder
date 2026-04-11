import { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { X, LifeBuoy } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useProgress } from '@/hooks/queries/useMonitoring'
import { relativeTime } from '@/lib/utils/dates'
import { RescueDialog } from './RescueDialog'
import type { BaseStatus } from '@/types'

function statusConfig(status: BaseStatus) {
  switch (status) {
    case 'completed':
      return { label: '\u2713 Completed', color: 'text-success', bg: 'bg-success/5', border: 'border-success/20' }
    case 'checked_in':
      return { label: '\u231b Checked in', color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20' }
    case 'submitted':
      return { label: '\ud83d\udcdd Pending review', color: 'text-info', bg: 'bg-info/5', border: 'border-info/20' }
    case 'rejected':
      return { label: '\u2717 Rejected', color: 'text-destructive', bg: 'bg-destructive/5', border: 'border-destructive/20' }
    case 'not_visited':
      return { label: 'Not visited', color: 'text-muted-foreground', bg: '', border: 'border-border' }
  }
}

const statusSortOrder: Record<BaseStatus, number> = {
  submitted: 0,
  checked_in: 1,
  rejected: 2,
  completed: 3,
  not_visited: 4,
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

  // Close on Escape
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

  return (
    <>
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute right-3 top-14 bottom-3 w-[350px] z-30 bg-card/95 backdrop-blur-xl border border-border rounded-xl flex flex-col overflow-hidden"
        data-testid="base-inspector"
      >
        {/* Header */}
        <div className="p-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${base.nfcLinked ? 'bg-success' : 'bg-destructive'}`}
            />
            <span className="text-sm font-semibold flex-1 truncate">
              {base.name}
            </span>
            <button
              data-testid="base-inspector-rescue"
              onClick={() => setRescueOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
              title="Rescue actions"
            >
              <LifeBuoy size={16} />
            </button>
            <button
              data-testid="base-inspector-close"
              onClick={() => inspectBase(null)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
            >
              <X size={16} />
            </button>
          </div>
          {(base.lat !== 0 || base.lng !== 0) && (
            <div className="text-[11px] text-muted-foreground mt-1 ml-4.5">
              {base.lat.toFixed(5)}, {base.lng.toFixed(5)}
            </div>
          )}
        </div>

        {/* Challenges section */}
        <div className="px-3 pt-3 pb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Challenges at this base
          </span>
          {baseChallenges.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              No challenges assigned
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {baseChallenges.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50"
                >
                  <button
                    onClick={() => navigateToChallenge(c.id)}
                    className="text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer truncate flex-1 text-left"
                  >
                    {c.title}
                  </button>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                      c.answerType === 'text'
                        ? 'bg-info/20 text-info'
                        : c.answerType === 'file'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {c.answerType === 'none'
                      ? 'None'
                      : c.answerType.charAt(0).toUpperCase() +
                        c.answerType.slice(1)}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                    {c.points}pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/30 mx-3" />

        {/* Team Progress section */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Team Progress
          </span>
          <div className="mt-2 space-y-1.5">
            {teamRows.map(({ team, status, entry, challenge }) => {
              const cfg = statusConfig(status)
              return (
                <div
                  key={team.id}
                  className={`px-2 py-1.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="text-xs font-medium flex-1 truncate">
                      {team.name}
                    </span>
                  </div>
                  {challenge && (
                    <div className="flex items-center gap-1.5 mt-1 ml-4.5">
                      <button
                        onClick={() => navigateToChallenge(challenge.id)}
                        className="text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer truncate"
                      >
                        {challenge.title}
                      </button>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {challenge.points}pts
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 ml-4.5">
                    <span className={`text-[11px] font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {entry?.checkedInAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {relativeTime(entry.checkedInAt)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Rescue Dialog */}
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
