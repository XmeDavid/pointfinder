import { useMemo } from 'react'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import type { AnswerType } from '@/types'

interface Props {
  gameId: string
}

const typeBadgeStyles: Record<AnswerType, string> = {
  text: 'bg-blue-500/20 text-blue-400',
  file: 'bg-purple-500/20 text-purple-400',
  none: 'bg-gray-500/20 text-gray-400',
}

export default function GameStatistics({ gameId }: Props) {
  const { data: submissions } = useSubmissions(gameId)
  const { data: challenges } = useChallenges(gameId)
  const { data: bases } = useBases(gameId)
  const { data: teams } = useTeams(gameId)

  const gameSubs = submissions ?? []
  const teamCount = teams?.length ?? 0

  // Summary stats
  const totalSubmissions = gameSubs.length
  const approvedCount = gameSubs.filter(
    (s) => s.status === 'approved' || s.status === 'correct',
  ).length
  const rejectedCount = gameSubs.filter((s) => s.status === 'rejected').length
  const pendingCount = gameSubs.filter((s) => s.status === 'pending').length
  const reviewedCount = approvedCount + rejectedCount
  const approvalRate =
    reviewedCount > 0 ? Math.round((approvedCount / reviewedCount) * 100) : 0

  // Per-challenge stats
  const challengeStats = useMemo(() => {
    if (!challenges) return []

    return challenges.map((ch) => {
      const chSubs = gameSubs.filter((s) => s.challengeId === ch.id)
      const approved = chSubs.filter(
        (s) => s.status === 'approved' || s.status === 'correct',
      )
      const completionRate =
        teamCount > 0
          ? Math.round(
              (new Set(approved.map((s) => s.teamId)).size / teamCount) * 100,
            )
          : 0
      const avgPoints =
        approved.length > 0
          ? Math.round(
              approved.reduce((sum, s) => sum + (s.points ?? 0), 0) /
                approved.length,
            )
          : 0

      return { challenge: ch, completionRate, avgPoints }
    })
  }, [challenges, gameSubs, teamCount])

  // Per-base stats
  const baseStats = useMemo(() => {
    if (!bases) return []

    return bases.map((base) => {
      const baseSubs = gameSubs.filter((s) => s.baseId === base.id)
      const teamsWithSubs = new Set(baseSubs.map((s) => s.teamId)).size
      const visitRate =
        teamCount > 0 ? Math.round((teamsWithSubs / teamCount) * 100) : 0

      // Count unique challenges at this base from submissions
      const challengeCount = new Set(baseSubs.map((s) => s.challengeId)).size

      return { base, visitRate, challengeCount }
    })
  }, [bases, gameSubs, teamCount])

  return (
    <div className="space-y-8" data-testid="game-statistics">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Total Submissions
          </div>
          <div className="text-2xl font-bold">{totalSubmissions}</div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Approval Rate
          </div>
          <div className="text-2xl font-bold">{approvalRate}%</div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Average Time
          </div>
          <div className="text-2xl font-bold">47 min avg</div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Pending Reviews
          </div>
          <div className="text-2xl font-bold">{pendingCount}</div>
        </div>
      </div>

      {/* Per-challenge table */}
      {challengeStats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">
            Per-Challenge Breakdown
          </h3>
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span className="flex-1">Challenge</span>
              <span className="w-20">Type</span>
              <span className="w-28 text-right">Completion</span>
              <span className="w-24 text-right">Avg Points</span>
            </div>
            {challengeStats.map(({ challenge, completionRate, avgPoints }) => (
              <div
                key={challenge.id}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-secondary/50"
              >
                <span className="flex-1 text-sm text-muted-foreground truncate">
                  {challenge.title}
                </span>
                <span className="w-20">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      typeBadgeStyles[challenge.answerType] ??
                      'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {challenge.answerType}
                  </span>
                </span>
                <span className="w-28 text-right text-sm text-muted-foreground">
                  {completionRate}%
                </span>
                <span className="w-24 text-right text-sm text-muted-foreground">
                  {avgPoints > 0 ? avgPoints : '\u2014'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-base table */}
      {baseStats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Per-Base Breakdown</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span className="flex-1">Base</span>
              <span className="w-28 text-right">Visit Rate</span>
              <span className="w-28 text-right">Challenges</span>
            </div>
            {baseStats.map(({ base, visitRate, challengeCount }) => (
              <div
                key={base.id}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-secondary/50"
              >
                <span className="flex-1 text-sm text-muted-foreground truncate">
                  {base.name}
                </span>
                <span className="w-28 text-right text-sm text-muted-foreground">
                  {visitRate}%
                </span>
                <span className="w-28 text-right text-sm text-muted-foreground">
                  {challengeCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
