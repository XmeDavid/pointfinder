import { useState, useMemo } from 'react'
import { useLeaderboard } from '@/hooks/queries/useMonitoring'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useBases } from '@/hooks/queries/useBases'
import { useStages } from '@/hooks/queries/useStages'
import { cn } from '@/lib/utils'

interface Props {
  gameId: string
}

export default function TeamBreakdown({ gameId }: Props) {
  const { data: leaderboard } = useLeaderboard(gameId)
  const { data: submissions } = useSubmissions(gameId)
  const { data: challenges } = useChallenges(gameId)
  const { data: bases } = useBases(gameId)
  const { data: stages } = useStages(gameId)

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const sortedStages = useMemo(
    () => (stages ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex),
    [stages],
  )

  const challengeMap = useMemo(() => {
    const map = new Map<string, (typeof challenges extends (infer T)[] | undefined ? T : never)>()
    if (challenges) {
      for (const ch of challenges) {
        map.set(ch.id, ch)
      }
    }
    return map
  }, [challenges])

  const rankedTeams = useMemo(() => {
    if (!leaderboard) return []
    const totalChallenges = challenges?.length ?? 0

    return leaderboard
      .slice()
      .sort((a, b) => b.points - a.points)
      .map((entry) => {
        const completionPct =
          totalChallenges > 0
            ? Math.round((entry.completedChallenges / totalChallenges) * 100)
            : 0
        return { ...entry, completionPct }
      })
  }, [leaderboard, challenges])

  const toggle = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }

  // Group bases by stage for breakdown display
  const getBasesForStage = (stageId: string) => {
    if (!bases) return []
    return bases.filter((b) => (b as unknown as Record<string, unknown>).stageId === stageId)
  }

  const getUnstagedBases = () => {
    if (!bases) return []
    const stagedBaseIds = new Set(
      sortedStages.flatMap((s) => s.baseIds ?? []),
    )
    return bases.filter((b) => !stagedBaseIds.has(b.id))
  }

  if (!leaderboard) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Loading breakdown...
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="team-breakdown">
      {rankedTeams.map((entry) => {
        const isExpanded = expandedTeams.has(entry.teamId)

        return (
          <div
            key={entry.teamId}
            className="bg-secondary/50 rounded-lg overflow-hidden"
          >
            {/* Collapsed header */}
            <button
              onClick={() => toggle(entry.teamId)}
              className="w-full px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/80 transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-medium flex-1 text-left">
                {entry.teamName}
              </span>
              <span className="text-sm font-bold mr-3">
                {entry.points} pts
              </span>
              <div className="w-24 flex items-center gap-2 mr-3">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${entry.completionPct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {entry.completionPct}%
                </span>
              </div>
              <svg
                className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-180',
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {sortedStages.map((stage) => {
                  const stageBases = getBasesForStage(stage.id)
                  if (stageBases.length === 0) return null

                  return (
                    <div key={stage.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          {stage.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {stage.transitionType === 'scheduled'
                            ? 'Scheduled'
                            : stage.transitionType === 'trigger'
                              ? 'Trigger-based'
                              : 'Manual'}
                        </span>
                      </div>
                      {renderBaseTable(stageBases, entry.teamId)}
                    </div>
                  )
                })}

                {/* Unstaged bases */}
                {(() => {
                  const unstaged = getUnstagedBases()
                  if (unstaged.length === 0 && sortedStages.length > 0) return null
                  if (unstaged.length === 0 && sortedStages.length === 0) {
                    // All bases are unstaged, show them without header
                    return bases && bases.length > 0
                      ? renderBaseTable(bases, entry.teamId)
                      : null
                  }
                  return (
                    <div>
                      {sortedStages.length > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Unstaged
                          </span>
                        </div>
                      )}
                      {renderBaseTable(unstaged, entry.teamId)}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  function renderBaseTable(
    basesToRender: NonNullable<typeof bases>,
    teamId: string,
  ) {
    return (
      <div className="space-y-1">
        {/* Table header */}
        <div className="flex items-center gap-3 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span className="flex-1">Base</span>
          <span className="w-40">Challenge</span>
          <span className="w-16 text-right">Points</span>
          <span className="w-28 text-right">Completed</span>
        </div>

        {basesToRender.map((base) => {
          // Find approved/correct submissions for this team at this base
          const approvedSubs = (submissions ?? []).filter(
            (s) =>
              s.teamId === teamId &&
              s.baseId === base.id &&
              (s.status === 'approved' || s.status === 'correct'),
          )

          const firstSub = approvedSubs.length > 0 ? approvedSubs[0] : null
          const challenge = firstSub
            ? challengeMap.get(firstSub.challengeId)
            : null
          const pts = approvedSubs.reduce(
            (sum, s) => sum + (s.points ?? 0),
            0,
          )

          return (
            <div
              key={base.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/30"
            >
              <span className="flex-1 text-sm text-muted-foreground">
                {base.name}
              </span>
              <span className="w-40 text-sm text-muted-foreground truncate">
                {challenge ? challenge.title : '\u2014'}
              </span>
              <span
                className={cn(
                  'w-16 text-right text-sm',
                  pts > 0 ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {pts > 0 ? pts : '\u2014'}
              </span>
              <span className="w-28 text-right text-xs text-muted-foreground">
                {firstSub?.submittedAt
                  ? new Date(firstSub.submittedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '\u2014'}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
}
