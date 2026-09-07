import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { Assignment, Base, Team } from '@/types/v2'
import { ALL_TEAMS, baseOfChallenge, clearChallenge, setCell, splitToTeams, type AssignmentRow } from './assignments/plan'

interface ChallengeAssignmentSectionProps {
  gameId: string
  challengeId: string
  assignments: Assignment[]
  bases: Base[]
  teams: Team[]
  onNavigateToBase: (baseId: string) => void
}

/**
 * Where one challenge waits, from the challenge's side: at one base for all
 * teams, or at one base per team (Falcons at A, Lions at C). Every change
 * sends the complete assignment list, so a move never conflicts half-way.
 */
export function ChallengeAssignmentSection({
  gameId,
  challengeId,
  assignments,
  bases,
  teams,
  onNavigateToBase,
}: ChallengeAssignmentSectionProps) {
  const { t } = useTranslation()
  const setAssignments = useSetAssignments(gameId)
  const [error, setError] = useState<string | null>(null)
  const [perTeamDraft, setPerTeamDraft] = useState(false)

  const own = useMemo(() => assignments.filter((a) => a.challengeId === challengeId), [assignments, challengeId])
  const allTeamsBaseId = baseOfChallenge(assignments, challengeId, ALL_TEAMS)
  const perTeam = own.some((a) => a.teamId)
  const mode: 'none' | 'all' | 'teams' = allTeamsBaseId ? 'all' : perTeam || perTeamDraft ? 'teams' : 'none'
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams])
  const baseName = (id: string) => bases.find((b) => b.id === id)?.name ?? id

  function write(next: AssignmentRow[]) {
    setError(null)
    setAssignments.mutate(next, {
      onError: (err) => setError(getApiErrorMessage(err, t('common.unknownError'))),
    })
  }

  function assignAll(baseId: string) {
    if (!baseId) {
      write(clearChallenge(assignments, challengeId))
      return
    }
    write(setCell(clearChallenge(assignments, challengeId), gameId, baseId, ALL_TEAMS, challengeId, teamIds))
  }

  function assignTeam(teamId: string, baseId: string) {
    const without = assignments.filter((a) => !(a.challengeId === challengeId && a.teamId === teamId))
    if (!baseId) {
      write(without)
      return
    }
    write(setCell(without, gameId, baseId, teamId, challengeId, teamIds))
  }

  function switchToTeams() {
    if (allTeamsBaseId) {
      write(splitToTeams(assignments, gameId, allTeamsBaseId, teamIds))
    }
    setPerTeamDraft(true)
  }

  function switchToAll() {
    const first = own.find((a) => a.teamId)
    setPerTeamDraft(false)
    if (first) assignAll(first.baseId)
  }

  const baseOptions = (current: string | null) => (
    <>
      <option value="">{current ? t('build.assignments.unassign') : t('build.assignments.assignToBase')}</option>
      {bases.map((base) => (
        <option key={base.id} value={base.id}>{base.name}</option>
      ))}
    </>
  )

  return (
    <section className="border-t border-border pt-4 mt-4" data-testid="challenge-assignment-section">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('build.assignments.title')}
        </h3>
        {teams.length > 0 && mode !== 'teams' && (
          <Button type="button" variant="ghost" size="sm" onClick={switchToTeams} data-testid="assign-per-team-btn" className="h-auto min-h-8 text-xs">
            {t('build.assignments.switchToTeams')}
          </Button>
        )}
        {mode === 'teams' && (
          <Button type="button" variant="ghost" size="sm" onClick={switchToAll} data-testid="assign-all-teams-btn" className="h-auto min-h-8 text-xs">
            {t('build.assignments.switchToAll')}
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert" data-testid="assignment-error">{error}</p>
      )}

      {mode !== 'teams' ? (
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground" htmlFor={`assign-base-${challengeId}`}>
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
              onChange={(event) => assignAll(event.target.value)}
              disabled={bases.length === 0 || setAssignments.isPending}
              data-testid="assign-to-base-btn"
              className="h-9"
            >
              {baseOptions(allTeamsBaseId)}
            </Select>
          </div>
          {allTeamsBaseId && (
            <p className="text-xs text-muted-foreground">{t('build.assignments.allTeams')}</p>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5" data-testid="challenge-team-rows">
          {teams.map((team) => {
            const current = baseOfChallenge(assignments, challengeId, team.id)
            return (
              <li key={team.id} className="flex items-center gap-2">
                <span className="flex w-28 shrink-0 items-center gap-1.5 truncate text-xs font-medium text-foreground">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                  <span className="truncate">{team.name}</span>
                </span>
                <Select
                  value={current ?? ''}
                  onChange={(event) => assignTeam(team.id, event.target.value)}
                  disabled={bases.length === 0 || setAssignments.isPending}
                  aria-label={t('build.assignments.teamAt', { team: team.name })}
                  data-testid={`challenge-team-base-${team.id}`}
                  className="h-9"
                >
                  {baseOptions(current)}
                </Select>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
