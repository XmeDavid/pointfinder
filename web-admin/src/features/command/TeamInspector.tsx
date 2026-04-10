import { useState, useEffect, useCallback } from 'react'
import { X, MapPin, Unlock, CheckCircle } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTeams } from '@/hooks/queries/useTeams'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useLeaderboard } from '@/hooks/queries/useMonitoring'
import { useManualCheckIn } from '@/hooks/mutations/useRescueMutations'
import { useMarkCompleted } from '@/hooks/mutations/useRescueMutations'
import { useUnlockOverride } from '@/hooks/mutations/useRescueMutations'

export function TeamInspector({ gameId }: { gameId: string }) {
  const inspectedTeamId = useWorkspaceStore((s) => s.inspectedTeamId)
  const inspectTeam = useWorkspaceStore((s) => s.inspectTeam)
  const toggleNotificationSender = useWorkspaceStore(
    (s) => s.toggleNotificationSender,
  )

  const { data: teams = [] } = useTeams(gameId)
  const { data: bases = [] } = useBases(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: leaderboard = [] } = useLeaderboard(gameId)

  const manualCheckIn = useManualCheckIn(gameId)
  const markCompleted = useMarkCompleted(gameId)
  const unlockOverride = useUnlockOverride(gameId)

  const [expandedAction, setExpandedAction] = useState<
    'checkin' | 'unlock' | 'completed' | null
  >(null)
  const [selectedBaseId, setSelectedBaseId] = useState('')
  const [selectedChallengeId, setSelectedChallengeId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const team = teams.find((t) => t.id === inspectedTeamId)
  const teamScore =
    leaderboard.find((e) => e.teamId === inspectedTeamId)?.points ?? 0
  const teamCompleted =
    leaderboard.find((e) => e.teamId === inspectedTeamId)
      ?.completedChallenges ?? 0

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') inspectTeam(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspectTeam])

  // Backdrop click handler
  const handleBackdropClick = useCallback(() => {
    inspectTeam(null)
  }, [inspectTeam])

  function showFeedback(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 1500)
  }

  if (!team) return null

  return (
    <>
      {/* Invisible backdrop */}
      <div
        data-testid="inspector-backdrop"
        className="absolute inset-0 z-[29]"
        onClick={handleBackdropClick}
      />

      <GlassPanel
        data-testid="team-inspector"
        className="absolute top-1/3 left-1/2 -translate-x-1/2 z-30 p-4 w-[320px]"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: team.color }}
          />
          <span className="text-sm font-semibold flex-1">{team.name}</span>
          <button
            data-testid="inspector-close"
            onClick={() => inspectTeam(null)}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <div>
            <span className="text-muted-foreground">Completed: </span>
            {teamCompleted}/{challenges.length}
          </div>
          <div>
            <span className="text-muted-foreground">Score: </span>
            <span className="text-primary font-semibold">{teamScore}</span>
          </div>
        </div>

        <div className="border-t border-border/30 my-2" />

        {/* Rescue Actions */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Rescue Actions
          </span>

          {/* Manual Check-in */}
          <div>
            <button
              data-testid="action-checkin"
              onClick={() =>
                setExpandedAction(
                  expandedAction === 'checkin' ? null : 'checkin',
                )
              }
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/5 transition-colors cursor-pointer"
            >
              <MapPin size={14} />
              Manual Check-in
            </button>
            {expandedAction === 'checkin' && (
              <div className="ml-6 mt-1 space-y-1.5">
                <select
                  data-testid="checkin-base-select"
                  value={selectedBaseId}
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="w-full bg-muted border border-border/50 rounded px-2 py-1 text-xs"
                >
                  <option value="">Select base...</option>
                  {bases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="checkin-confirm"
                  disabled={!selectedBaseId}
                  onClick={() => {
                    manualCheckIn.mutate({
                      teamId: team.id,
                      baseId: selectedBaseId,
                    })
                    showFeedback('Checked in!')
                    setExpandedAction(null)
                    setSelectedBaseId('')
                  }}
                  className="px-3 py-1 rounded text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
              </div>
            )}
          </div>

          {/* Unlock Base */}
          <div>
            <button
              data-testid="action-unlock"
              onClick={() =>
                setExpandedAction(
                  expandedAction === 'unlock' ? null : 'unlock',
                )
              }
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/5 transition-colors cursor-pointer"
            >
              <Unlock size={14} />
              Unlock Base
            </button>
            {expandedAction === 'unlock' && (
              <div className="ml-6 mt-1 space-y-1.5">
                <select
                  data-testid="unlock-base-select"
                  value={selectedBaseId}
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="w-full bg-muted border border-border/50 rounded px-2 py-1 text-xs"
                >
                  <option value="">Select base...</option>
                  {bases
                    .filter((b) => b.hidden)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
                <button
                  data-testid="unlock-confirm"
                  disabled={!selectedBaseId}
                  onClick={() => {
                    unlockOverride.mutate({
                      teamId: team.id,
                      baseId: selectedBaseId,
                    })
                    showFeedback('Unlocked!')
                    setExpandedAction(null)
                    setSelectedBaseId('')
                  }}
                  className="px-3 py-1 rounded text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
              </div>
            )}
          </div>

          {/* Mark Completed */}
          <div>
            <button
              data-testid="action-completed"
              onClick={() =>
                setExpandedAction(
                  expandedAction === 'completed' ? null : 'completed',
                )
              }
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/5 transition-colors cursor-pointer"
            >
              <CheckCircle size={14} />
              Mark Completed
            </button>
            {expandedAction === 'completed' && (
              <div className="ml-6 mt-1 space-y-1.5">
                <select
                  data-testid="completed-base-select"
                  value={selectedBaseId}
                  onChange={(e) => {
                    setSelectedBaseId(e.target.value)
                    setSelectedChallengeId('')
                  }}
                  className="w-full bg-muted border border-border/50 rounded px-2 py-1 text-xs"
                >
                  <option value="">Select base...</option>
                  {bases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {selectedBaseId && (
                  <select
                    data-testid="completed-challenge-select"
                    value={selectedChallengeId}
                    onChange={(e) => setSelectedChallengeId(e.target.value)}
                    className="w-full bg-muted border border-border/50 rounded px-2 py-1 text-xs"
                  >
                    <option value="">Select challenge...</option>
                    {challenges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  data-testid="completed-confirm"
                  disabled={!selectedBaseId || !selectedChallengeId}
                  onClick={() => {
                    markCompleted.mutate({
                      teamId: team.id,
                      baseId: selectedBaseId,
                      request: { challengeId: selectedChallengeId },
                    })
                    showFeedback('Marked completed!')
                    setExpandedAction(null)
                    setSelectedBaseId('')
                    setSelectedChallengeId('')
                  }}
                  className="px-3 py-1 rounded text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div
            data-testid="rescue-feedback"
            className="mt-2 text-xs text-primary font-medium text-center"
          >
            {feedback}
          </div>
        )}

        <div className="border-t border-border/30 my-2" />

        {/* Send Message */}
        <button
          data-testid="send-message-btn"
          onClick={toggleNotificationSender}
          className="w-full px-3 py-1.5 rounded-lg text-sm bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer text-center"
        >
          Send Message
        </button>
      </GlassPanel>
    </>
  )
}
