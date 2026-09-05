import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, MapPin, Unlock } from 'lucide-react'
import { InspectorPanel } from '@/components/layout/InspectorPanel'
import { OverrideBadge, StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useTeams } from '@/hooks/queries/useTeams'
import { useLeaderboard } from '@/hooks/queries/useMonitoring'
import {
  useManualCheckIn,
  useMarkCompleted,
  useUnlockOverride,
} from '@/hooks/mutations/useRescueMutations'
import { useWorkspaceStore } from '@/stores/workspace'

type RescueAction = 'checkin' | 'unlock' | 'completed'

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

  const isMobile = useIsMobile()

  const manualCheckIn = useManualCheckIn(gameId)
  const markCompleted = useMarkCompleted(gameId)
  const unlockOverride = useUnlockOverride(gameId)

  const [expandedAction, setExpandedAction] = useState<RescueAction | null>(
    null,
  )
  const [selectedBaseId, setSelectedBaseId] = useState('')
  const [selectedChallengeId, setSelectedChallengeId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const team = teams.find((t) => t.id === inspectedTeamId)
  const teamScore =
    leaderboard.find((e) => e.teamId === inspectedTeamId)?.points ?? 0
  const teamCompleted =
    leaderboard.find((e) => e.teamId === inspectedTeamId)
      ?.completedChallenges ?? 0

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') inspectTeam(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspectTeam])

  const handleBackdropClick = useCallback(() => {
    inspectTeam(null)
  }, [inspectTeam])

  function showFeedback(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 1500)
  }

  if (!team) return null

  function toggleAction(action: RescueAction) {
    setExpandedAction(expandedAction === action ? null : action)
  }

  return (
    <>
      <div
        data-testid="inspector-backdrop"
        className="absolute inset-0 z-[29]"
        onClick={handleBackdropClick}
      />

      <InspectorPanel
        data-testid="team-inspector"
        title={team.name}
        subtitle={`Completed: ${teamCompleted}/${challenges.length} · Score: ${teamScore}`}
        actions={
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: team.color }}
            aria-hidden="true"
          />
        }
        onClose={() => inspectTeam(null)}
        closeButtonTestId="inspector-close"
        shape={isMobile ? 'sheet' : 'default'}
        className={
          isMobile
            ? 'absolute bottom-16 left-0 right-0 z-30 max-h-[70vh]'
            : 'absolute left-1/2 top-1/3 z-30 w-[320px] -translate-x-1/2'
        }
        footer={
          <Button
            type="button"
            data-testid="send-message-btn"
            onClick={toggleNotificationSender}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Send Message
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <OverrideBadge label="Rescue actions" />
            {feedback && (
              <StatusBadge
                data-testid="rescue-feedback"
                tone="success"
                label={feedback}
              />
            )}
          </div>

          <RescueActionSection
            action="checkin"
            label="Manual Check-in"
            testId="action-checkin"
            icon={<MapPin size={14} aria-hidden="true" />}
            expandedAction={expandedAction}
            onToggle={toggleAction}
          >
            <select
              data-testid="checkin-base-select"
              value={selectedBaseId}
              onChange={(e) => setSelectedBaseId(e.target.value)}
              className="w-full rounded border border-border/50 bg-muted px-2 py-1 text-xs"
            >
              <option value="">Select base...</option>
              {bases.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              data-testid="checkin-confirm"
              disabled={!selectedBaseId}
              size="sm"
              onClick={() => {
                manualCheckIn.mutate({
                  teamId: team.id,
                  baseId: selectedBaseId,
                })
                showFeedback('Checked in!')
                setExpandedAction(null)
                setSelectedBaseId('')
              }}
            >
              Confirm
            </Button>
          </RescueActionSection>

          <RescueActionSection
            action="unlock"
            label="Unlock Base"
            testId="action-unlock"
            icon={<Unlock size={14} aria-hidden="true" />}
            expandedAction={expandedAction}
            onToggle={toggleAction}
          >
            <select
              data-testid="unlock-base-select"
              value={selectedBaseId}
              onChange={(e) => setSelectedBaseId(e.target.value)}
              className="w-full rounded border border-border/50 bg-muted px-2 py-1 text-xs"
            >
              <option value="">Select base...</option>
              {bases
                .filter((base) => base.hidden)
                .map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.name}
                  </option>
                ))}
            </select>
            <Button
              type="button"
              data-testid="unlock-confirm"
              disabled={!selectedBaseId}
              size="sm"
              onClick={() => {
                unlockOverride.mutate({
                  teamId: team.id,
                  baseId: selectedBaseId,
                })
                showFeedback('Unlocked!')
                setExpandedAction(null)
                setSelectedBaseId('')
              }}
            >
              Confirm
            </Button>
          </RescueActionSection>

          <RescueActionSection
            action="completed"
            label="Mark Completed"
            testId="action-completed"
            icon={<CheckCircle size={14} aria-hidden="true" />}
            expandedAction={expandedAction}
            onToggle={toggleAction}
          >
            <select
              data-testid="completed-base-select"
              value={selectedBaseId}
              onChange={(e) => {
                setSelectedBaseId(e.target.value)
                setSelectedChallengeId('')
              }}
              className="w-full rounded border border-border/50 bg-muted px-2 py-1 text-xs"
            >
              <option value="">Select base...</option>
              {bases.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name}
                </option>
              ))}
            </select>
            {selectedBaseId && (
              <select
                data-testid="completed-challenge-select"
                value={selectedChallengeId}
                onChange={(e) => setSelectedChallengeId(e.target.value)}
                className="w-full rounded border border-border/50 bg-muted px-2 py-1 text-xs"
              >
                <option value="">Select challenge...</option>
                {challenges.map((challenge) => (
                  <option key={challenge.id} value={challenge.id}>
                    {challenge.title}
                  </option>
                ))}
              </select>
            )}
            <Button
              type="button"
              data-testid="completed-confirm"
              disabled={!selectedBaseId || !selectedChallengeId}
              size="sm"
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
            >
              Confirm
            </Button>
          </RescueActionSection>
        </div>
      </InspectorPanel>
    </>
  )
}

function RescueActionSection({
  action,
  label,
  testId,
  icon,
  expandedAction,
  onToggle,
  children,
}: {
  action: RescueAction
  label: string
  testId: string
  icon: ReactNode
  expandedAction: RescueAction | null
  onToggle: (action: RescueAction) => void
  children: ReactNode
}) {
  const isExpanded = expandedAction === action

  return (
    <div>
      <button
        data-testid={testId}
        onClick={() => onToggle(action)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/5"
      >
        {icon}
        {label}
      </button>
      {isExpanded && <div className="ml-6 mt-1 space-y-1.5">{children}</div>}
    </div>
  )
}
