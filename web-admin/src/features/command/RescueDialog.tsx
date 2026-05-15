import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
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
  const { t } = useTranslation()
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <SurfacePanel
        elevation="panel"
        className="mx-auto mt-[20vh] max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">
            {t('command.rescue.title')} — {base?.name ?? t('command.rescue.fallbackBase')}
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
          {t('command.rescue.teamLabel')}
        </label>
        <select
          data-testid="rescue-team-select"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
        >
          <option value="">{t('command.rescue.selectTeam')}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>

        {/* Action selector */}
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('command.rescue.actionLabel')}
        </label>
        <div className="space-y-2 mb-4">
          <ActionCard
            selected={action === 'checkin'}
            onClick={() => setAction('checkin')}
            title={t('command.rescue.action.manualCheckIn')}
            description={t('command.rescue.action.manualCheckInDesc')}
          />
          <ActionCard
            selected={action === 'completed'}
            onClick={() => setAction('completed')}
            title={t('command.rescue.action.markCompleted')}
            description={t('command.rescue.action.markCompletedDesc')}
          />
          {baseHidden && (
            <ActionCard
              selected={action === 'unlock'}
              onClick={() => setAction('unlock')}
              title={t('command.rescue.action.unlockOverride')}
              description={t('command.rescue.action.unlockOverrideDesc')}
            />
          )}
        </div>

        {/* Challenge selector (only for 'completed') */}
        {action === 'completed' && (
          <>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t('command.rescue.challengeLabel')}
            </label>
            <select
              data-testid="rescue-challenge-select"
              value={selectedChallengeId}
              onChange={(e) => setSelectedChallengeId(e.target.value)}
              className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">{t('command.rescue.selectChallenge')}</option>
              {baseChallenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.points} {t('common.pts')})
                </option>
              ))}
            </select>

            {/* Points override */}
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t('command.rescue.pointsOverrideLabel')}
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
              placeholder={t('command.rescue.pointsOverridePlaceholder')}
            />
          </>
        )}

        {/* Reason */}
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('command.rescue.reasonLabel')}
        </label>
        <input
          data-testid="rescue-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={t('command.rescue.reasonPlaceholder')}
          className="w-full bg-muted border border-border/50 rounded-lg px-3 py-2 text-sm mb-4"
        />

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {t('command.rescue.cancel')}
          </button>
          <button
            data-testid="rescue-confirm"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-success text-success-foreground hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? t('command.rescue.sending') : t('command.rescue.confirm')}
          </button>
        </div>
      </SurfacePanel>
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
