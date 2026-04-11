import { Bell, MapPin } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useDashboardStats } from '@/hooks/queries/useMonitoring'
import { useElapsedTimer } from '@/hooks/ui/useElapsedTimer'
import { useWorkspaceStore } from '@/stores/workspace'

export function StatsBar({ gameId }: { gameId: string }) {
  const { data: stats } = useDashboardStats(gameId)
  const toggleNotificationSender = useWorkspaceStore((s) => s.toggleNotificationSender)
  const toggleTeamLocations = useWorkspaceStore((s) => s.toggleTeamLocations)
  const teamLocationsVisible = useWorkspaceStore((s) => s.teamLocationsVisible)

  const elapsed = useElapsedTimer(stats?.startDate ?? null)

  const pendingCount = stats?.pendingSubmissions ?? 0
  const totalTeams = stats?.totalTeams ?? 0
  const totalSubmissions = stats?.totalSubmissions ?? 0
  const completedSubmissions = stats?.completedSubmissions ?? 0
  const progressPct =
    totalSubmissions > 0
      ? Math.round((completedSubmissions / totalSubmissions) * 100)
      : 0

  return (
    <div
      data-testid="stats-bar"
      className="absolute bottom-16 md:bottom-3 left-2 md:left-3 z-20 flex gap-1.5 md:gap-2 overflow-x-auto scrollbar-none max-w-[calc(100vw-16px)] md:max-w-none"
    >
      {/* Active teams */}
      <GlassPanel className="rounded-lg px-2 py-1.5 md:px-3 md:py-2 shrink-0">
        <div data-testid="stat-teams" className="text-sm md:text-lg font-bold text-primary">
          {totalTeams}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Teams</div>
      </GlassPanel>

      {/* Pending */}
      <GlassPanel className="rounded-lg px-2 py-1.5 md:px-3 md:py-2 shrink-0">
        <div
          data-testid="stat-pending"
          className={`text-sm md:text-lg font-bold ${
            pendingCount > 5 ? 'text-destructive' : 'text-yellow-500'
          }`}
        >
          {pendingCount}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Pending</div>
      </GlassPanel>

      {/* Progress */}
      <GlassPanel className="rounded-lg px-2 py-1.5 md:px-3 md:py-2 shrink-0">
        <div data-testid="stat-progress" className="text-sm md:text-lg font-bold">
          {progressPct}%
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Progress</div>
      </GlassPanel>

      {/* Elapsed */}
      <GlassPanel className="rounded-lg px-2 py-1.5 md:px-3 md:py-2 shrink-0">
        <div data-testid="stat-elapsed" className="text-sm md:text-lg font-bold font-mono">
          {elapsed}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Elapsed</div>
      </GlassPanel>

      {/* Team locations toggle */}
      <button
        data-testid="team-locations-btn"
        onClick={toggleTeamLocations}
        className={`bg-card/95 backdrop-blur-xl border rounded-lg px-2 py-1.5 md:px-3 md:py-2 transition-colors cursor-pointer shrink-0 ${
          teamLocationsVisible
            ? 'border-info/30 bg-info/10 hover:bg-info/20'
            : 'border-border hover:bg-muted'
        }`}
      >
        <div className="flex items-center justify-center">
          <MapPin size={18} className={`md:w-5 md:h-5 ${teamLocationsVisible ? 'text-info' : 'text-muted-foreground'}`} />
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Players</div>
      </button>

      {/* Notify */}
      <button
        data-testid="rescue-btn"
        onClick={toggleNotificationSender}
        className="bg-card/95 backdrop-blur-xl border border-primary/30 rounded-lg px-2 py-1.5 md:px-3 md:py-2 bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer shrink-0"
      >
        <div className="flex items-center justify-center">
          <Bell size={18} className="text-primary md:w-5 md:h-5" />
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Notify</div>
      </button>
    </div>
  )
}
