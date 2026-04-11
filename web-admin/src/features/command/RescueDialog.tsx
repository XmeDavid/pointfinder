import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTeams } from '@/hooks/queries/useTeams'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import {
  useManualCheckIn,
  useMarkCompleted,
  useUnlockOverride,
} from '@/hooks/mutations/useRescueMutations'

interface RescueDialogProps {
  gameId: string
  baseId: string
  baseHidden: boolean
  onClose: () => void
}

export function RescueDialog({
  gameId,
  baseId,
  baseHidden,
  onClose,
}: RescueDialogProps) {
  const { data: teams = [] } = useTeams(gameId)
  const { data: bases = [] } = useBases(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: assignments = [] } = useAssignments(gameId)

  const manualCheckIn = useManualCheckIn(gameId)
  const markCompleted = useMarkCompleted(gameId)
  const unlockOverride = useUnlockOverride(gameId)

  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [action, setAction] = useState<'checkin' | 'completed' | 'unlock'>(
    'checkin',
  )
  const [selectedChallengeId, setSelectedChallengeId] = useState('')
  const [reason, setReason] = useState('')
  const [pointsOverride, setPointsOverride] = useState<number | null>(null)

  const base = bases.find((b) => b.id === baseId)

  // Challenges assigned at this base
  const baseChallenges = useMemo(() => {
    const challengeIds = new Set(
      assignments.filter((a) => a.baseId === baseId).map((a) => a.challengeId),
    )
    return challenges.filter((c) => challengeIds.has(c.id))
  }, [assignments, challenges, baseId])

  // Pre-fill points when challenge selection changes
  useEffect(() => {
    if (selectedChallengeId) {
      const ch = challenges.find((c) => c.id === selectedChallengeId)
      setPointsOverride(ch?.points ?? null)
    } else {
      setPointsOverride(null)
    }
  }, [selectedChallengeId, challenges])

  // Escape key closes dialog (capture phase to block other handlers)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const isPending =
    manualCheckIn.isPending ||
    markCompleted.isPending ||
    unlockOverride.isPending

  function handleConfirm() {
    if (!selectedTeamId) return
    switch (action) {
      case 'checkin':
        manualCheckIn.mutate(
          {
            teamId: selectedTeamId,
            baseId,
            body: reason ? { reason } : undefined,
          },
          { onSuccess: onClose },
        )
        break
      case 'completed':
        if (!selectedChallengeId) return
        markCompleted.mutate(
          {
            teamId: selectedTeamId,
            baseId,
            request: {
              challengeId: selectedChallengeId,
              reason: reason || undefined,
              pointsOverride: pointsOverride ?? undefined,
            },
          },
          { onSuccess: onClose },
        )
        break
      case 'unlock':
        unlockOverride.mutate(
          {
            teamId: selectedTeamId,
            baseId,
            body: reason ? { reason } : undefined,
          },
          { onSuccess: onClose },
        )
        break
    }
  }

  const confirmDisabled =
    isPending ||
    !selectedTeamId ||
    (action === 'completed' && !selectedChallengeId)

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl max-w-md mx-auto mt-[20vh] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">
            Rescue — {base?.name ?? 'Base'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Team selector */}
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Team
        </label>
        <select
          data-testid="rescue-team-select"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
        >
          <option value="">Select team...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {/* Action selector */}
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Action
        </label>
        <div className="space-y-2 mb-4">
          <ActionCard
            selected={action === 'checkin'}
            onClick={() => setAction('checkin')}
            title="Manual Check-in"
            description="Bypass NFC scan for this team"
          />
          <ActionCard
            selected={action === 'completed'}
            onClick={() => setAction('completed')}
            title="Mark Completed"
            description="Award points without submission"
          />
          {baseHidden && (
            <ActionCard
              selected={action === 'unlock'}
              onClick={() => setAction('unlock')}
              title="Unlock Override"
              description="Make base visible for team"
            />
          )}
        </div>

        {/* Challenge selector (only for 'completed') */}
        {action === 'completed' && (
          <>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Challenge
            </label>
            <select
              data-testid="rescue-challenge-select"
              value={selectedChallengeId}
              onChange={(e) => setSelectedChallengeId(e.target.value)}
              className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">Select challenge...</option>
              {baseChallenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.points} pts)
                </option>
              ))}
            </select>

            {/* Points override */}
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Points override (optional)
            </label>
            <input
              data-testid="rescue-points-override"
              type="number"
              value={pointsOverride ?? ''}
              onChange={(e) =>
                setPointsOverride(
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
              placeholder="Default challenge points"
            />
          </>
        )}

        {/* Reason */}
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Reason
        </label>
        <input
          data-testid="rescue-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="e.g. NFC reader broken"
          className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
        />

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            data-testid="rescue-confirm"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-success text-success-foreground hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Sending...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Action card radio ── */

function ActionCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean
  onClick: () => void
  title: string
  description: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/50 bg-muted/50 text-muted-foreground hover:bg-muted'
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs opacity-75">{description}</div>
    </button>
  )
}
