import { useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useLeaderboard } from '@/hooks/queries/useMonitoring'
import { useTeamLocations } from '@/hooks/queries/useTeamLocations'
import { useWorkspaceStore } from '@/stores/workspace'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'

type Staleness = 'active' | 'stale' | 'unknown'

const stalenessColor: Record<Staleness, string> = {
  active: '#22c55e',
  stale: '#f59e0b',
  unknown: '#a1a1aa',
}

const stalenessLabel: Record<Staleness, string> = {
  active: 'Active',
  stale: 'Stale',
  unknown: 'No signal',
}

function computeStaleness(updatedAt: string | undefined): Staleness {
  if (!updatedAt) return 'unknown'
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  if (ageMs < 2 * 60 * 1000) return 'active'
  if (ageMs < 10 * 60 * 1000) return 'stale'
  return 'unknown'
}

function formatLastSeen(updatedAt: string | undefined): string {
  if (!updatedAt) return 'No location data'
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const mins = Math.floor(ageMs / 60_000)
  if (mins < 1) return 'Last seen just now'
  if (mins === 1) return 'Last seen 1 min ago'
  return `Last seen ${mins} min ago`
}

const podiumColors: Record<number, string> = {
  1: '#eab308', // gold
  2: '#a1a1aa', // silver
  3: '#cd7f32', // bronze
}

export function Leaderboard({ gameId }: { gameId: string }) {
  const { data: entries = [] } = useLeaderboard(gameId)
  const { data: locations = [] } = useTeamLocations(gameId)
  const leaderboardOpen = useWorkspaceStore((s) => s.leaderboardOpen)
  const toggleLeaderboard = useWorkspaceStore((s) => s.toggleLeaderboard)
  const impersonatedTeamId = useWorkspaceStore((s) => s.impersonatedTeamId)
  const impersonateTeam = useWorkspaceStore((s) => s.impersonateTeam)
  const isMobile = useIsMobile()

  const sorted = [...entries].sort((a, b) => b.points - a.points)

  // Most recent location update per team
  const teamLastSeen = useMemo(() => {
    const map = new Map<string, string>()
    for (const loc of locations) {
      const prev = map.get(loc.teamId)
      if (!prev || loc.updatedAt > prev) {
        map.set(loc.teamId, loc.updatedAt)
      }
    }
    return map
  }, [locations])

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
              No teams yet. Add teams in Build mode to see standings here.
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
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: stalenessColor[computeStaleness(teamLastSeen.get(entry.teamId))] }}
                    title={`${stalenessLabel[computeStaleness(teamLastSeen.get(entry.teamId))]} — ${formatLastSeen(teamLastSeen.get(entry.teamId))}`}
                  />
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
