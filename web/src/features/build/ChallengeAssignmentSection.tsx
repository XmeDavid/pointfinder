import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { Assignment, Base, Challenge, Team } from '@/types/v2'
import {
  ALL_TEAMS,
  baseMode,
  baseOfChallenge,
  challengesAt,
  clearChallenge,
  setCell,
  splitToTeams,
  type AssignmentRow,
} from './assignments/plan'

interface ChallengeAssignmentSectionProps {
  gameId: string
  challengeId: string
  assignments: Assignment[]
  bases: Base[]
  teams: Team[]
  /** Titles for the occupancy hints; optional for callers that have none. */
  challenges?: Challenge[]
  onNavigateToBase: (baseId: string) => void
}

type Pending =
  { kind: 'assign-all'; baseId: string } | { kind: 'merge'; baseId: string }

/**
 * Where one challenge waits, from the challenge's side: at one base for all
 * teams, or at one base per team (Falcons at A, Lions at C). Every change
 * sends the complete assignment list, so a move never conflicts half-way.
 * Anything that would discard other rows asks first.
 */
export function ChallengeAssignmentSection({
  gameId,
  challengeId,
  assignments,
  bases,
  teams,
  challenges = [],
  onNavigateToBase,
}: ChallengeAssignmentSectionProps) {
  const { t } = useTranslation()
  const setAssignments = useSetAssignments(gameId)
  const [error, setError] = useState<string | null>(null)
  const [perTeamDraft, setPerTeamDraft] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

  const own = useMemo(
    () => assignments.filter((a) => a.challengeId === challengeId),
    [assignments, challengeId],
  )
  const allTeamsBaseId = baseOfChallenge(assignments, challengeId, ALL_TEAMS)
  const teamRows = own.filter((a) => a.teamId)
  const mode: 'none' | 'all' | 'teams' =
    teamRows.length > 0 || perTeamDraft
      ? 'teams'
      : allTeamsBaseId
        ? 'all'
        : 'none'
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams])
  const baseName = (id: string) => bases.find((b) => b.id === id)?.name ?? id
  const challengeTitle = (id: string) =>
    challenges.find((c) => c.id === id)?.title ?? id

  function write(next: AssignmentRow[]) {
    setError(null)
    setAssignments.mutate(next, {
      onError: (err) =>
        setError(getApiErrorMessage(err, t('common.unknownError'))),
    })
  }

  /** Rows at a base that belong to other challenges: what an all-teams pick there would discard. */
  function occupiedByOthers(baseId: string): boolean {
    return assignments.some(
      (a) => a.baseId === baseId && a.challengeId !== challengeId,
    )
  }

  function assignAll(baseId: string) {
    if (!baseId) {
      write(clearChallenge(assignments, challengeId))
      return
    }
    write(
      setCell(
        clearChallenge(assignments, challengeId),
        gameId,
        baseId,
        ALL_TEAMS,
        challengeId,
        teamIds,
      ),
    )
  }

  function requestAssignAll(baseId: string) {
    if (baseId && occupiedByOthers(baseId)) {
      setPending({ kind: 'assign-all', baseId })
      return
    }
    assignAll(baseId)
  }

  function assignTeam(teamId: string, baseId: string) {
    const without = assignments.filter(
      (a) => !(a.challengeId === challengeId && a.teamId === teamId),
    )
    if (!baseId) {
      write(without)
      return
    }
    write(setCell(without, gameId, baseId, teamId, challengeId, teamIds))
  }

  function switchToTeams() {
    if (allTeamsBaseId)
      write(splitToTeams(assignments, gameId, allTeamsBaseId, teamIds))
    setPerTeamDraft(true)
  }

  function requestSwitchToAll() {
    const first = teamRows[0]
    setPerTeamDraft(false)
    if (!first) return
    const basesUsed = new Set(teamRows.map((a) => a.baseId))
    if (basesUsed.size > 1 || occupiedByOthers(first.baseId)) {
      setPending({ kind: 'merge', baseId: first.baseId })
      return
    }
    assignAll(first.baseId)
  }

  const occupancy = (baseId: string): string => {
    const mode = baseMode(assignments, baseId)
    if (mode === 'none') return ''
    const others = challengesAt(assignments, baseId).filter(
      (id) => id !== challengeId,
    )
    if (others.length === 0) return ''
    return mode === 'all'
      ? t('build.assignments.occupiedAll', { title: challengeTitle(others[0]) })
      : t('build.assignments.occupiedTeams')
  }

  const baseOptions = (current: string | null) => (
    <>
      <option value="">
        {current
          ? t('build.assignments.unassign')
          : t('build.assignments.assignToBase')}
      </option>
      {bases.map((base) => {
        const note = occupancy(base.id)
        return (
          <option key={base.id} value={base.id}>
            {note ? `${base.name} · ${note}` : base.name}
          </option>
        )
      })}
    </>
  )

  return (
    <section
      className="border-t border-border pt-4 mt-4"
      data-testid="challenge-assignment-section"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('build.editor.appearsAt')}
        </h3>
        {teams.length > 0 && mode !== 'teams' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={switchToTeams}
            data-testid="assign-per-team-btn"
            className="h-auto min-h-8 text-xs"
          >
            {t('build.assignments.switchToTeams')}
          </Button>
        )}
        {mode === 'teams' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={requestSwitchToAll}
            data-testid="assign-all-teams-btn"
            className="h-auto min-h-8 text-xs"
          >
            {t('build.assignments.switchToAll')}
          </Button>
        )}
      </div>

      {error && (
        <p
          className="mb-2 text-xs text-destructive"
          role="alert"
          data-testid="assignment-error"
        >
          {error}
        </p>
      )}

      {mode !== 'teams' ? (
        <div className="space-y-1.5">
          <label
            className="block text-xs text-muted-foreground"
            htmlFor={`assign-base-${challengeId}`}
          >
            {t('build.assignments.assignedAt')}
          </label>
          <div className="flex items-center gap-2">
            {allTeamsBaseId && (
              <button
                type="button"
                onClick={() => onNavigateToBase(allTeamsBaseId)}
                data-testid="assigned-base-link"
                className="shrink-0 text-sm font-medium text-primary hover:underline cursor-pointer"
              >
                {baseName(allTeamsBaseId)}
              </button>
            )}
            <Select
              id={`assign-base-${challengeId}`}
              value={allTeamsBaseId ?? ''}
              onChange={(event) => requestAssignAll(event.target.value)}
              disabled={bases.length === 0 || setAssignments.isPending}
              data-testid="assign-to-base-btn"
              className="h-9"
            >
              {baseOptions(allTeamsBaseId)}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {allTeamsBaseId
              ? t('build.assignments.allTeams')
              : teams.length === 0
                ? t('build.assignments.noTeams')
                : null}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allTeamsBaseId && (
            <p
              className="text-xs text-muted-foreground"
              data-testid="challenge-also-all-teams"
            >
              {t('build.assignments.alsoAllTeamsAt', {
                base: baseName(allTeamsBaseId),
              })}{' '}
              <button
                type="button"
                className="text-primary hover:underline cursor-pointer"
                onClick={() =>
                  write(
                    assignments.filter(
                      (a) => !(a.challengeId === challengeId && !a.teamId),
                    ),
                  )
                }
              >
                {t('build.assignments.unassign')}
              </button>
            </p>
          )}
          <ul className="space-y-1.5" data-testid="challenge-team-rows">
            {teams.map((team) => {
              const current = baseOfChallenge(assignments, challengeId, team.id)
              return (
                <li key={team.id} className="flex items-center gap-2">
                  <span className="flex w-28 shrink-0 items-center gap-1.5 truncate text-xs font-medium text-foreground">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: team.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{team.name}</span>
                  </span>
                  <Select
                    value={current ?? ''}
                    onChange={(event) =>
                      assignTeam(team.id, event.target.value)
                    }
                    disabled={bases.length === 0 || setAssignments.isPending}
                    aria-label={t('build.assignments.teamAt', {
                      team: team.name,
                    })}
                    data-testid={`challenge-team-base-${team.id}`}
                    className="h-9"
                  >
                    {baseOptions(current)}
                  </Select>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <ConfirmDeleteDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending
          setPending(null)
          if (target) assignAll(target.baseId)
        }}
        title={
          pending?.kind === 'merge'
            ? t('build.assignments.confirmAllTitle')
            : t('build.assignments.confirmReplaceTitle', {
                base: pending ? baseName(pending.baseId) : '',
              })
        }
        description={
          pending?.kind === 'merge'
            ? t('build.assignments.confirmMergeBody')
            : t('build.assignments.confirmReplaceBody')
        }
        confirmLabel={t('build.assignments.confirmAllAction')}
        variant="default"
      />
    </section>
  )
}
