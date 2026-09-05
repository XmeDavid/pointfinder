import { Activity, Bell, MapPin } from 'lucide-react'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { useDashboardStats } from '@/hooks/queries/useMonitoring'
import { useElapsedTimer } from '@/hooks/ui/useElapsedTimer'
import { useWorkspaceStore } from '@/stores/workspace'

export function StatsBar({
  gameId,
  onOpenActivity,
}: {
  gameId: string
  onOpenActivity?: () => void
}) {
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
      className="absolute bottom-16 left-2 right-2 z-20 grid grid-cols-4 gap-1.5 [&>*]:min-w-0 md:bottom-3 md:left-3 md:right-auto md:flex md:max-w-none md:gap-2"
    >
      {/* Active teams */}
      <OverlayPanel padding="none" className="shrink-0 px-2 py-1.5 md:px-3 md:py-2">
        <div data-testid="stat-teams" className="text-sm md:text-lg font-bold text-primary">
          {totalTeams}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Teams</div>
      </OverlayPanel>

      {/* Pending */}
      <OverlayPanel padding="none" className="shrink-0 px-2 py-1.5 md:px-3 md:py-2">
        <div
          data-testid="stat-pending"
          className={`text-sm md:text-lg font-bold ${
            pendingCount > 5 ? 'text-destructive' : 'text-warning'
          }`}
        >
          {pendingCount}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Pending</div>
      </OverlayPanel>

      {/* Progress */}
      <OverlayPanel padding="none" className="shrink-0 px-2 py-1.5 md:px-3 md:py-2">
        <div data-testid="stat-progress" className="text-sm md:text-lg font-bold">
          {progressPct}%
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Progress</div>
      </OverlayPanel>

      {/* Elapsed */}
      <OverlayPanel padding="none" className="shrink-0 px-2 py-1.5 md:px-3 md:py-2">
        <div data-testid="stat-elapsed" className="text-xs font-bold font-mono md:text-lg">
          {elapsed}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Elapsed</div>
      </OverlayPanel>

      {/* Team locations toggle */}
      <OverlayPanel
        as="button"
        data-testid="team-locations-btn"
        onClick={toggleTeamLocations}
        padding="none"
        className={`shrink-0 cursor-pointer px-2 py-1.5 transition-colors md:px-3 md:py-2 ${
          teamLocationsVisible
            ? 'border-info/30 bg-info/10 hover:bg-info/20'
            : 'hover:bg-muted'
        }`}
      >
        <div className="flex items-center justify-center">
          <MapPin size={18} className={`md:w-5 md:h-5 ${teamLocationsVisible ? 'text-info' : 'text-muted-foreground'}`} />
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Players</div>
      </OverlayPanel>

      {/* Notify */}
      <OverlayPanel
        as="button"
        data-testid="rescue-btn"
        onClick={toggleNotificationSender}
        padding="none"
        className="shrink-0 cursor-pointer border-primary/30 bg-primary/10 px-2 py-1.5 transition-colors hover:bg-primary/20 md:px-3 md:py-2"
      >
        <div className="flex items-center justify-center">
          <Bell size={18} className="text-primary md:w-5 md:h-5" />
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground">Notify</div>
      </OverlayPanel>

      {onOpenActivity && (
        <OverlayPanel
          as="button"
          data-testid="mobile-activity-btn"
          onClick={onOpenActivity}
          padding="none"
          className="min-w-0 cursor-pointer px-2 py-1.5 transition-colors hover:bg-muted"
        >
          <div className="flex items-center justify-center">
            <Activity size={18} className="text-primary" />
          </div>
          <div className="truncate text-[10px] text-muted-foreground">Activity</div>
        </OverlayPanel>
      )}
    </div>
  )
}
