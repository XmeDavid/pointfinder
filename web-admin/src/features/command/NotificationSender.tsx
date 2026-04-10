import { useState, useMemo } from 'react'
import { X, Send } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTeams } from '@/hooks/queries/useTeams'
import { useNotifications } from '@/hooks/queries/useNotifications'
import { useSendNotification } from '@/hooks/mutations/useNotificationMutations'
import { relativeTime } from '@/lib/utils/dates'

export function NotificationSender({ gameId }: { gameId: string }) {
  const toggleNotificationSender = useWorkspaceStore(
    (s) => s.toggleNotificationSender,
  )

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
      className="absolute bottom-16 left-3 z-30 p-4 w-[340px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold">Send Notification</span>
        <button
          data-testid="notif-close"
          onClick={toggleNotificationSender}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Recipient toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          data-testid="recipient-all"
          onClick={() => setRecipientMode('all')}
          className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
            recipientMode === 'all'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground bg-muted'
          }`}
        >
          All Teams
        </button>
        <button
          data-testid="recipient-specific"
          onClick={() => setRecipientMode('specific')}
          className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
            recipientMode === 'specific'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground bg-muted'
          }`}
        >
          Specific Team
        </button>
      </div>

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
      <button
        data-testid="notif-send"
        onClick={handleSend}
        disabled={!message.trim() || sendMutation.isPending}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Send size={14} />
        {sentFeedback ? 'Sent!' : 'Send'}
      </button>

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
                    <span>{recipientTeam ? recipientTeam.name : 'All Teams'}</span>
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
