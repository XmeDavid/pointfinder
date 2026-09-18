import { useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateChallenge } from '@/hooks/mutations/useChallengeMutations'
import { useCreateAssignment } from '@/hooks/mutations/useAssignmentMutations'
import { assignmentsApi } from '@/lib/api/assignments'
import { useAuthStore } from '@/lib/auth/store'
import {
  clearPendingCreation,
  loadPendingCreation,
  newPendingCreation,
  pendingCreationKey,
  savePendingCreation,
} from '../drafts/pendingCreation'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { Assignment, Challenge, Team } from '@/types/v2'
import {
  ALL_TEAMS,
  baseMode,
  cellChallenge,
  optionsFor,
  setCell,
  splitToTeams,
  type AssignmentRow,
} from './plan'

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
  beforeOpenChallenge,
  onOpenChallenge,
}: {
  gameId: string
  baseId: string
  assignments: Assignment[]
  challenges: Challenge[]
  teams: Team[]
  /**
   * Runs before a challenge is created, linked or opened; resolving false
   * keeps the operator here (typically: the base could not be saved yet).
   */
  beforeOpenChallenge?: () => Promise<boolean>
  onOpenChallenge: (challengeId: string) => void
}) {
  const { t } = useTranslation()
  const setAssignments = useSetAssignments(gameId)
  const createChallenge = useCreateChallenge(gameId)
  const createAssignment = useCreateAssignment(gameId)
  const accountId = useAuthStore((s) => s.user?.id)
  const [creating, setCreating] = useState(false)
  const [choosingExisting, setChoosingExisting] = useState(false)
  const busy = useRef(false)

  async function openChallenge(id: string) {
    if (beforeOpenChallenge && !(await beforeOpenChallenge())) return
    onOpenChallenge(id)
  }

  /**
   * Create and link are two requests. A durable record with a stable
   * idempotency key is written first, so an uncertain outcome (offline,
   * killed WebView, failed link) is finished on the next attempt instead of
   * leaving a second empty challenge behind.
   */
  async function createEmptyChallenge() {
    if (busy.current) return
    busy.current = true
    setCreating(true)
    setError(null)
    try {
      if (beforeOpenChallenge && !(await beforeOpenChallenge())) return
      const pendingKey = pendingCreationKey(accountId, gameId, baseId)
      const pending = (await loadPendingCreation(pendingKey)) ?? newPendingCreation()
      await savePendingCreation(pendingKey, pending)
      let id = pending.challengeId
      if (!id) {
        const challenge = await createChallenge.mutateAsync({
          title: t('build.editor.newChallenge'),
          description: '',
          content: '',
          completionContent: '',
          answerType: 'none',
          autoValidate: false,
          points: 0,
          locationBound: false,
          idempotencyKey: pending.idempotencyKey,
        })
        id = challenge.id
        await savePendingCreation(pendingKey, { ...pending, challengeId: id })
      }
      const current = await assignmentsApi.listByGame(gameId)
      if (
        !current.some(
          (row) =>
            row.baseId === baseId && row.challengeId === id && !row.teamId,
        )
      ) {
        try {
          await createAssignment.mutateAsync({ baseId, challengeId: id })
        } catch (err) {
          // The challenge is gone (deleted elsewhere): start over next time.
          if ((err as { response?: { status?: number } })?.response?.status === 404) await clearPendingCreation(pendingKey)
          throw err
        }
      }
      await clearPendingCreation(pendingKey)
      onOpenChallenge(id)
    } catch (err) {
      setError(getApiErrorMessage(err, t('common.unknownError')))
    } finally {
      busy.current = false
      setCreating(false)
    }
  }
  const [error, setError] = useState<string | null>(null)
  const [perTeamDraft, setPerTeamDraft] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState(false)

  const stored = baseMode(assignments, baseId)
  const mode: 'none' | 'all' | 'teams' =
    stored === 'none' && perTeamDraft ? 'teams' : stored
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams])
  const allChallengeId = cellChallenge(assignments, baseId, ALL_TEAMS)
  const linkedCount = new Set(
    assignments.filter((a) => a.baseId === baseId).map((a) => a.challengeId),
  ).size

  function write(next: AssignmentRow[]) {
    setError(null)
    setAssignments.mutate(next, {
      onError: (err) =>
        setError(getApiErrorMessage(err, t('common.unknownError'))),
    })
  }

  function pick(column: string, value: string) {
    write(
      setCell(
        assignments,
        gameId,
        baseId,
        column,
        value === '' ? null : value,
        teamIds,
      ),
    )
  }

  function switchToTeams() {
    if (allChallengeId)
      write(splitToTeams(assignments, gameId, baseId, teamIds))
    setPerTeamDraft(true)
  }

  function mergeToAll() {
    const first = assignments.find((a) => a.baseId === baseId && a.teamId)
    setPerTeamDraft(false)
    if (first)
      write(
        setCell(
          assignments,
          gameId,
          baseId,
          ALL_TEAMS,
          first.challengeId,
          teamIds,
        ),
      )
  }

  /** Merging keeps the first team's choice; when the teams differ, ask first. */
  function switchToAll() {
    const distinct = new Set(
      assignments
        .filter((a) => a.baseId === baseId && a.teamId)
        .map((a) => a.challengeId),
    )
    if (distinct.size > 1) {
      setConfirmMerge(true)
      return
    }
    mergeToAll()
  }

  const challengeOptions = (column: string, current: string | null) => (
    <>
      <option value="">
        {current
          ? t('build.assignments.unassign')
          : t('build.assignments.none')}
      </option>
      {optionsFor(assignments, challenges, baseId, column).map((challenge) => (
        <option key={challenge.id} value={challenge.id}>
          {challenge.title}
        </option>
      ))}
    </>
  )

  return (
    <section
      className="border-t border-border pt-4 mt-4"
      data-testid="base-assignment-section"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('build.editor.challengeHere')}
        </h3>
        {teams.length > 0 && linkedCount > 0 && mode !== 'teams' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={switchToTeams}
            data-testid="base-assign-per-team-btn"
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
            onClick={switchToAll}
            data-testid="base-assign-all-teams-btn"
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

      {mode === 'none' && !choosingExisting ? (
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            variant="outline"
            disabled={creating}
            onClick={() => void createEmptyChallenge()}
            data-testid="create-empty-challenge-btn"
          >
            {t(
              creating
                ? 'build.compose.saving'
                : 'build.editor.createEmptyChallenge',
            )}
          </Button>
          {challenges.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={creating}
              className="px-0 text-xs"
              onClick={() => setChoosingExisting(true)}
            >
              {t('build.editor.chooseExistingChallenge')}
            </Button>
          )}
        </div>
      ) : mode !== 'teams' ? (
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openChallenge(allChallengeId)}
                data-testid="open-linked-challenge-btn"
                className="h-9 shrink-0"
              >
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
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color }}
                    aria-hidden="true"
                  />
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void openChallenge(current)}
                    className="h-9 shrink-0 text-xs"
                  >
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
