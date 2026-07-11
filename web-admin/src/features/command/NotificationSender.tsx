import { useState, useMemo } from 'react'
import { X, Send } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useWorkspaceStore } from '@/stores/workspace'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'
import { useTeams } from '@/hooks/queries/useTeams'
import { useNotifications } from '@/hooks/queries/useNotifications'
import { useSendNotification } from '@/hooks/mutations/useNotificationMutations'
import { relativeTime } from '@/lib/utils/dates'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status'

export function NotificationSender({ gameId }: { gameId: string }) {
  const toggleNotificationSender = useWorkspaceStore(
    (s) => s.toggleNotificationSender,
  )
  const isMobile = useIsMobile()

  const { data: teams = [] } = useTeams(gameId)
  const { data: notifications = [] } = useNotifications(gameId)
  const sendMutation = useSendNotification(gameId)

  const [recipientMode, setRecipientMode] = useState<'all' | 'specific'>('all')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [message, setMessage] = useState('')
  const [sentFeedback, setSentFeedback] = useState(false)

  const recentNotifications = useMemo(() => {
    return [...notifications].reverse().slice(0, 3)
  }, [notifications])

  function handleSend() {
    if (!message.trim()) return
    const targetTeamId =
      recipientMode === 'specific' && selectedTeamId
        ? selectedTeamId
        : undefined
    sendMutation.mutate(
      { message: message.trim(), targetTeamId },
      {
        onSuccess: () => {
          setMessage('')
          setSentFeedback(true)
          setTimeout(() => setSentFeedback(false), 1500)
        },
      },
    )
  }

  return (
    <GlassPanel
      data-testid="notification-sender"
      className={
        isMobile
          ? 'absolute bottom-16 left-0 right-0 z-30 p-4 rounded-t-xl rounded-b-none max-h-[70vh] overflow-y-auto'
          : 'absolute bottom-16 left-3 z-30 p-4 w-[340px]'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold">Send Notification</span>
        <Button
          data-testid="notif-close"
          onClick={toggleNotificationSender}
          variant="ghost"
          size="icon"
          aria-label="Close notifications"
        >
          <X size={16} />
        </Button>
      </div>

      {/* Recipient toggle */}
      <Tabs value={recipientMode} onValueChange={(value) => setRecipientMode(value as 'all' | 'specific')} className="mb-3">
        <TabsList className="w-full">
          <TabsTrigger value="all" data-testid="recipient-all" className="flex-1">All Teams</TabsTrigger>
          <TabsTrigger value="specific" data-testid="recipient-specific" className="flex-1">Specific Team</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Team dropdown */}
      {recipientMode === 'specific' && (
        <select
          data-testid="notif-team-select"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="w-full bg-muted border border-border/50 rounded px-2 py-1.5 text-xs mb-3"
        >
          <option value="">Select team...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {/* Message textarea */}
      <textarea
        data-testid="notif-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message..."
        rows={3}
        className="w-full bg-muted border border-border/50 rounded px-2 py-1.5 text-sm resize-none mb-2 placeholder:text-muted-foreground"
      />

      {/* Send button */}
      <Button
        data-testid="notif-send"
        onClick={handleSend}
        disabled={!message.trim() || sendMutation.isPending}
        className="w-full"
        loading={sendMutation.isPending}
      >
        <Send size={14} />
        {sentFeedback ? 'Sent!' : 'Send'}
      </Button>

      {/* Recent notifications */}
      {recentNotifications.length > 0 && (
        <div className="mt-3 border-t border-border/30 pt-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Recent
          </span>
          <div className="mt-1 space-y-1.5">
            {recentNotifications.map((n) => {
              const recipientTeam = n.targetTeamId
                ? teams.find((t) => t.id === n.targetTeamId)
                : null
              return (
                <div
                  key={n.id}
                  data-testid="recent-notification"
                  className="text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-1">
                    <StatusBadge size="sm" tone="info" label={recipientTeam ? recipientTeam.name : 'All Teams'} />
                    <span>{relativeTime(n.sentAt)}</span>
                  </div>
                  <p className="truncate">{n.message}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
