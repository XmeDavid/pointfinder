import { LifeBuoy } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useDashboardStats } from '@/hooks/queries/useMonitoring'
import { useElapsedTimer } from '@/hooks/ui/useElapsedTimer'
import { useWorkspaceStore } from '@/stores/workspace'

export function StatsBar({ gameId }: { gameId: string }) {
  const { data: stats } = useDashboardStats(gameId)
  const toggleNotificationSender = useWorkspaceStore((s) => s.toggleNotificationSender)

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
      className="absolute bottom-3 left-3 z-20 flex gap-2"
    >
      {/* Active teams */}
      <GlassPanel className="rounded-lg px-3 py-2">
        <div data-testid="stat-teams" className="text-lg font-bold text-primary">
          {totalTeams}
        </div>
        <div className="text-xs text-muted-foreground">Teams</div>
      </GlassPanel>

      {/* Pending */}
      <GlassPanel className="rounded-lg px-3 py-2">
        <div
          data-testid="stat-pending"
          className={`text-lg font-bold ${
            pendingCount > 5 ? 'text-destructive' : 'text-yellow-500'
          }`}
        >
          {pendingCount}
        </div>
        <div className="text-xs text-muted-foreground">Pending</div>
      </GlassPanel>

      {/* Progress */}
      <GlassPanel className="rounded-lg px-3 py-2">
        <div data-testid="stat-progress" className="text-lg font-bold">
          {progressPct}%
        </div>
        <div className="text-xs text-muted-foreground">Progress</div>
      </GlassPanel>

      {/* Elapsed */}
      <GlassPanel className="rounded-lg px-3 py-2">
        <div data-testid="stat-elapsed" className="text-lg font-bold font-mono">
          {elapsed}
        </div>
        <div className="text-xs text-muted-foreground">Elapsed</div>
      </GlassPanel>

      {/* Rescue */}
      <button
        data-testid="rescue-btn"
        onClick={toggleNotificationSender}
        className="bg-card/95 backdrop-blur-xl border border-destructive/30 rounded-lg px-3 py-2 bg-destructive/10 hover:bg-destructive/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-center">
          <LifeBuoy size={20} className="text-destructive" />
        </div>
        <div className="text-xs text-muted-foreground">Rescue</div>
      </button>
    </div>
  )
}
