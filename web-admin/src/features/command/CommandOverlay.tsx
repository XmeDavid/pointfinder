import { useGameStream } from '@/hooks/subscriptions/useGameStream'
import { useWorkspaceStore } from '@/stores/workspace'
import { ActivityFeed } from './ActivityFeed'
import { StatsBar } from './StatsBar'
import { Leaderboard } from './Leaderboard'
import { TeamInspector } from './TeamInspector'
import { BaseInspector } from './BaseInspector'
import { NotificationSender } from './NotificationSender'

export function CommandOverlay({ gameId }: { gameId: string }) {
  const connectionError = useGameStream(gameId)
  const inspectedTeamId = useWorkspaceStore((s) => s.inspectedTeamId)
  const inspectedBaseId = useWorkspaceStore((s) => s.inspectedBaseId)
  const notificationSenderOpen = useWorkspaceStore((s) => s.notificationSenderOpen)

  return (
    <>
      {connectionError && (
        <div
          data-testid="ws-error-banner"
          className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-destructive/90 text-destructive-foreground text-xs px-3 py-1.5 rounded-lg backdrop-blur"
        >
          Connection issue: {connectionError}
        </div>
      )}
      <ActivityFeed gameId={gameId} />
      <StatsBar gameId={gameId} />
      <Leaderboard gameId={gameId} />
      {inspectedTeamId && <TeamInspector gameId={gameId} />}
      {inspectedBaseId && <BaseInspector gameId={gameId} />}
      {notificationSenderOpen && <NotificationSender gameId={gameId} />}
    </>
  )
}
