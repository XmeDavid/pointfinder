import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { Assignment, Challenge, Team } from '@/types/v2'
import { ALL_TEAMS, baseMode, cellChallenge, optionsFor, setCell, splitToTeams, type AssignmentRow } from './plan'

/**
 * What waits at one base, from the base's side: one challenge for all
 * teams, or one per team. Mirrors the challenge section and the grid.
 */
export function BaseAssignmentSection({
  gameId,
  baseId,
  assignments,
  challenges,
  teams,
  onOpenChallenge,
}: {
  gameId: string
  baseId: string
  assignments: Assignment[]
  challenges: Challenge[]
  teams: Team[]
  onOpenChallenge: (challengeId: string) => void
}) {
  const { t } = useTranslation()
  const setAssignments = useSetAssignments(gameId)
  const [error, setError] = useState<string | null>(null)
  const [perTeamDraft, setPerTeamDraft] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState(false)

  const stored = baseMode(assignments, baseId)
  const mode: 'none' | 'all' | 'teams' = stored === 'none' && perTeamDraft ? 'teams' : stored
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams])
  const allChallengeId = cellChallenge(assignments, baseId, ALL_TEAMS)
  const linkedCount = new Set(assignments.filter((a) => a.baseId === baseId).map((a) => a.challengeId)).size

  function write(next: AssignmentRow[]) {
    setError(null)
    setAssignments.mutate(next, {
      onError: (err) => setError(getApiErrorMessage(err, t('common.unknownError'))),
    })
  }

  function pick(column: string, value: string) {
    write(setCell(assignments, gameId, baseId, column, value === '' ? null : value, teamIds))
  }

  function switchToTeams() {
    if (allChallengeId) write(splitToTeams(assignments, gameId, baseId, teamIds))
    setPerTeamDraft(true)
  }

  function mergeToAll() {
    const first = assignments.find((a) => a.baseId === baseId && a.teamId)
    setPerTeamDraft(false)
    if (first) write(setCell(assignments, gameId, baseId, ALL_TEAMS, first.challengeId, teamIds))
  }

  /** Merging keeps the first team's choice; when the teams differ, ask first. */
  function switchToAll() {
    const distinct = new Set(assignments.filter((a) => a.baseId === baseId && a.teamId).map((a) => a.challengeId))
    if (distinct.size > 1) {
      setConfirmMerge(true)
      return
    }
    mergeToAll()
  }

  const challengeOptions = (column: string, current: string | null) => (
    <>
      <option value="">{current ? t('build.assignments.unassign') : t('build.assignments.none')}</option>
      {optionsFor(assignments, challenges, baseId, column).map((challenge) => (
        <option key={challenge.id} value={challenge.id}>{challenge.title}</option>
      ))}
    </>
  )

  return (
    <section className="border-t border-border pt-4 mt-4" data-testid="base-assignment-section">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('build.assignments.title')} <span className="font-normal">({linkedCount})</span>
        </h3>
        {teams.length > 0 && mode !== 'teams' && (
          <Button type="button" variant="ghost" size="sm" onClick={switchToTeams} data-testid="base-assign-per-team-btn" className="h-auto min-h-8 text-xs">
            {t('build.assignments.switchToTeams')}
          </Button>
        )}
        {mode === 'teams' && (
          <Button type="button" variant="ghost" size="sm" onClick={switchToAll} data-testid="base-assign-all-teams-btn" className="h-auto min-h-8 text-xs">
            {t('build.assignments.switchToAll')}
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert" data-testid="assignment-error">{error}</p>
      )}

      {mode !== 'teams' ? (
        <div className="space-y-1.5" data-testid="challenges-at-base">
          <div className="flex items-center gap-2">
            <Select
              value={allChallengeId ?? ''}
              onChange={(event) => pick(ALL_TEAMS, event.target.value)}
              disabled={setAssignments.isPending || challenges.length === 0}
              aria-label={t('build.assignments.allTeams')}
              data-testid="link-challenge-btn"
              className="h-9"
            >
              {challengeOptions(ALL_TEAMS, allChallengeId)}
            </Select>
            {allChallengeId && (
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChallenge(allChallengeId)} data-testid="open-linked-challenge-btn" className="h-9 shrink-0">
                {t('common.edit')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {challenges.length === 0
              ? t('build.assignments.noChallenges')
              : teams.length === 0
                ? t('build.assignments.noTeams')
                : t('build.assignments.allTeams')}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5" data-testid="challenges-at-base">
          {teams.map((team) => {
            const current = cellChallenge(assignments, baseId, team.id)
            return (
              <li key={team.id} className="flex items-center gap-2">
                <span className="flex w-28 shrink-0 items-center gap-1.5 truncate text-xs font-medium text-foreground">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                  <span className="truncate">{team.name}</span>
                </span>
                <Select
                  value={current ?? ''}
                  onChange={(event) => pick(team.id, event.target.value)}
                  disabled={setAssignments.isPending}
                  aria-label={team.name}
                  data-testid={`base-team-challenge-${team.id}`}
                  className="h-9"
                >
                  {challengeOptions(team.id, current)}
                </Select>
                {current && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChallenge(current)} className="h-9 shrink-0 text-xs">
                    {t('common.edit')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={confirmMerge}
        onCancel={() => setConfirmMerge(false)}
        onConfirm={() => {
          setConfirmMerge(false)
          mergeToAll()
        }}
        title={t('build.assignments.confirmAllTitle')}
        description={t('build.assignments.confirmMergeBody')}
        confirmLabel={t('build.assignments.confirmAllAction')}
        variant="default"
      />
    </section>
  )
}
