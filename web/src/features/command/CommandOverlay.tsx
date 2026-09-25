import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStream } from '@/hooks/subscriptions/useGameStream'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { useWorkspaceStore } from '@/stores/workspace'
import { ActivityFeed } from './ActivityFeed'
import { StatsBar } from './StatsBar'
import { Leaderboard } from './Leaderboard'
import { TeamInspector } from './TeamInspector'
import { BaseInspector } from './BaseInspector'
import { NotificationSender } from './NotificationSender'
import { UploadAttention } from './UploadAttention'

export function CommandOverlay({ gameId }: { gameId: string }) {
  const { t } = useTranslation()
  const connectionError = useGameStream(gameId)
  const inspectedTeamId = useWorkspaceStore((s) => s.inspectedTeamId)
  const inspectedBaseId = useWorkspaceStore((s) => s.inspectedBaseId)
  const notificationSenderOpen = useWorkspaceStore((s) => s.notificationSenderOpen)
  const isMobile = useIsMobile()
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false)

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-14 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
        {connectionError && (
          <OverlayPanel
            data-testid="ws-error-banner"
            padding="none"
            className="border-destructive/30 bg-destructive/90 px-3 py-1.5 text-xs text-destructive-foreground"
          >
            {t('workspace.connectionIssue', { error: connectionError })}
          </OverlayPanel>
        )}
        <UploadAttention gameId={gameId} />
      </div>
      <ActivityFeed
        gameId={gameId}
        mobileExpanded={isMobile ? mobileActivityOpen : undefined}
        onMobileExpandedChange={isMobile ? setMobileActivityOpen : undefined}
      />
      {(!isMobile || !mobileActivityOpen) && (
        <>
          <StatsBar
            gameId={gameId}
            onOpenActivity={isMobile ? () => setMobileActivityOpen(true) : undefined}
          />
          <Leaderboard gameId={gameId} />
        </>
      )}
      {inspectedTeamId && <TeamInspector gameId={gameId} />}
      {inspectedBaseId && <BaseInspector gameId={gameId} />}
      {notificationSenderOpen && <NotificationSender gameId={gameId} />}
    </>
  )
}
