import { useMemo } from 'react'
import { useLeaderboard } from '@/hooks/queries/useMonitoring'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { cn } from '@/lib/utils'

interface Props {
  gameId: string
}

export default function Standings({ gameId }: Props) {
  const { data: leaderboard } = useLeaderboard(gameId)
  const { data: submissions } = useSubmissions(gameId)
  const { data: challenges } = useChallenges(gameId)

  const rankedTeams = useMemo(() => {
    if (!leaderboard) return []

    const totalChallenges = challenges?.length ?? 0

    return leaderboard
      .slice()
      .sort((a, b) => b.points - a.points)
      .map((entry, index) => {
        const completionPct =
          totalChallenges > 0
            ? Math.round((entry.completedChallenges / totalChallenges) * 100)
            : 0

        // Count approved/correct submissions for this team
        const approvedCount = submissions
          ? submissions.filter(
              (s) =>
                s.teamId === entry.teamId &&
                (s.status === 'approved' || s.status === 'correct'),
            ).length
          : entry.completedChallenges

        return {
          ...entry,
          rank: index + 1,
          completionPct,
          approvedCount,
        }
      })
  }, [leaderboard, submissions, challenges])

  const rankBorder = (rank: number): string => {
    if (rank === 1) return 'border-l-4 border-[#eab308]'
    if (rank === 2) return 'border-l-4 border-[#a1a1aa]'
    if (rank === 3) return 'border-l-4 border-[#cd7f32]'
    return 'border-l-4 border-transparent'
  }

  if (!leaderboard) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Loading standings...
      </div>
    )
  }

  if (leaderboard.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No teams found.
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid="standings">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <span className="w-10">Rank</span>
        <span className="flex-1">Team</span>
        <span className="w-20 text-right">Score</span>
        <span className="w-28 text-right">Completion</span>
        <span className="w-24 text-right">Challenges</span>
      </div>

      {/* Team rows */}
      {rankedTeams.map((entry) => (
        <div
          key={entry.teamId}
          data-testid={`standing-row-${entry.rank}`}
          className={cn(
            'bg-secondary/50 rounded-lg px-4 py-3 mb-2 flex items-center gap-4',
            rankBorder(entry.rank),
          )}
        >
          {/* Rank */}
          <span className="w-10 text-sm font-bold text-muted-foreground">
            #{entry.rank}
          </span>

          {/* Team name with color dot */}
          <div className="flex-1 flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm font-medium">{entry.teamName}</span>
          </div>

          {/* Score */}
          <span className="w-20 text-right text-sm font-bold">
            {entry.points}
          </span>

          {/* Completion */}
          <div className="w-28 flex items-center justify-end gap-2">
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${entry.completionPct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">
              {entry.completionPct}%
            </span>
          </div>

          {/* Challenges completed */}
          <span className="w-24 text-right text-sm text-muted-foreground">
            {entry.approvedCount}
          </span>
        </div>
      ))}
    </div>
  )
}
