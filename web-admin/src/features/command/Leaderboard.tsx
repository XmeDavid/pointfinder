import { ChevronDown, ChevronUp } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useLeaderboard } from '@/hooks/queries/useMonitoring'
import { useWorkspaceStore } from '@/stores/workspace'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'

const podiumColors: Record<number, string> = {
  1: '#eab308', // gold
  2: '#a1a1aa', // silver
  3: '#cd7f32', // bronze
}

export function Leaderboard({ gameId }: { gameId: string }) {
  const { data: entries = [] } = useLeaderboard(gameId)
  const leaderboardOpen = useWorkspaceStore((s) => s.leaderboardOpen)
  const toggleLeaderboard = useWorkspaceStore((s) => s.toggleLeaderboard)
  const impersonatedTeamId = useWorkspaceStore((s) => s.impersonatedTeamId)
  const impersonateTeam = useWorkspaceStore((s) => s.impersonateTeam)
  const isMobile = useIsMobile()

  const sorted = [...entries].sort((a, b) => b.points - a.points)

  return (
    <GlassPanel
      data-testid="leaderboard"
      className={
        isMobile
          ? 'absolute bottom-16 left-0 right-0 z-20 overflow-hidden rounded-t-xl rounded-b-none'
          : 'absolute bottom-3 right-[266px] z-20 overflow-hidden'
      }
    >
      {/* Header toggle */}
      <button
        data-testid="leaderboard-toggle"
        onClick={toggleLeaderboard}
        className="w-full px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-accent/5 transition-colors"
      >
        <span className="text-sm font-semibold">Leaderboard</span>
        {leaderboardOpen ? (
          <ChevronDown size={16} className="text-muted-foreground" />
        ) : (
          <ChevronUp size={16} className="text-muted-foreground" />
        )}
      </button>

      {/* Expanded list */}
      {leaderboardOpen && (
        <div
          data-testid="leaderboard-list"
          className="border-t border-border/30 max-h-[280px] overflow-y-auto"
        >
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              No teams yet.
            </p>
          ) : (
            sorted.map((entry, idx) => {
              const rank = idx + 1
              const borderColor = podiumColors[rank] ?? 'transparent'
              return (
                <button
                  key={entry.teamId}
                  data-testid="leaderboard-entry"
                  onClick={() => impersonateTeam(impersonatedTeamId === entry.teamId ? null : entry.teamId)}
                  className={`w-full px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer ${
                    impersonatedTeamId === entry.teamId
                      ? 'bg-primary/10'
                      : 'hover:bg-accent/5'
                  }`}
                  style={{
                    borderLeftWidth: rank <= 3 ? 2 : 0,
                    borderLeftColor: borderColor,
                    borderLeftStyle: 'solid',
                  }}
                >
                  <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                    #{rank}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm flex-1 truncate">
                    {entry.teamName}
                  </span>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {entry.points}
                  </span>
                  <span className="text-xs text-muted-foreground w-6 text-right tabular-nums">
                    {entry.completedChallenges}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </GlassPanel>
  )
}
