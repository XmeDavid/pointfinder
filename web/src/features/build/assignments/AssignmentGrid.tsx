import { useMemo, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useTeams } from '@/hooks/queries/useTeams'
import { useTags } from '@/hooks/queries/useTags'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useMediaQuery } from '@/hooks/ui/useMediaQuery'
import { useSetAssignments } from '@/hooks/mutations/useAssignmentMutations'
import { getApiErrorMessage } from '@/lib/api/errors'
import type { Base } from '@/types'
import { ALL_TEAMS, baseMode, setCell } from './plan'
import { AssignmentList } from './AssignmentList'
import { GridCell, type GridColumn, type GridContext } from './GridCell'

/**
 * The per-team assignment grid: rows are bases in route order, columns are
 * "All teams" plus one per team, each cell a challenge. Every change sends
 * the complete next list, so the server never sees a half-made route. On a
 * desktop it is a table; on a phone it is a base list that opens one base at
 * a time, because a table with a column per team does not fit.
 */
export function AssignmentGrid({
  gameId,
  bases,
  editable,
  onClose,
}: {
  gameId: string
  /** Bases in the order they should be listed (route order when enforced). */
  bases: Base[]
  editable: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: tags = [] } = useTags(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const setAssignments = useSetAssignments(gameId)
  const writing = useIsMutating({ mutationKey: ['assignments', 'set'] }) > 0
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [error, setError] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState<{ baseId: string; challengeId: string } | null>(null)

  const teamIds = useMemo(() => teams.map((team) => team.id), [teams])
  const challengeTitle = (id: string) => challenges.find((c) => c.id === id)?.title ?? id

  function write(next: ReturnType<typeof setCell>) {
    setError(null)
    setAssignments.mutate(next, {
      onError: (err) => setError(getApiErrorMessage(err, t('common.unknownError'))),
    })
  }

  function change(baseId: string, column: string, challengeId: string | null) {
    if (column === ALL_TEAMS && challengeId && baseMode(assignments, baseId) === 'teams') {
      setConfirmAll({ baseId, challengeId })
      return
    }
    write(setCell(assignments, gameId, baseId, column, challengeId, teamIds))
  }

  const columns: GridColumn[] = [
    { id: ALL_TEAMS, label: t('build.assignments.allTeams'), color: null },
    ...teams.map((team) => ({ id: team.id, label: team.name, color: team.color })),
  ]
  const ctx: GridContext = { gameId, bases, assignments, challenges, teams, tags, columns, editable, writing, change, challengeTitle }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('build.assignments.title')} data-testid="assignment-grid">
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{t('build.assignments.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{isDesktop ? t('build.assignments.hint') : t('build.assignments.phoneHint')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} data-testid="assignment-grid-close" className="shrink-0">
          <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t('build.assignments.close')}
        </Button>
      </div>

      {!editable && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground" data-testid="assignment-grid-readonly">
          {t('build.assignments.readOnly')}
        </p>
      )}
      {error && (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive" role="alert" data-testid="assignment-grid-error">
          {error}
        </p>
      )}

      {bases.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">{t('build.assignments.noBases')}</p>
      ) : challenges.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">{t('build.assignments.noChallenges')}</p>
      ) : isDesktop ? (
        <AssignmentTable ctx={ctx} />
      ) : (
        <AssignmentList ctx={ctx} />
      )}

      <ConfirmDeleteDialog
        open={confirmAll !== null}
        onCancel={() => setConfirmAll(null)}
        onConfirm={() => {
          const target = confirmAll
          setConfirmAll(null)
          if (target) write(setCell(assignments, gameId, target.baseId, ALL_TEAMS, target.challengeId, teamIds))
        }}
        title={t('build.assignments.confirmAllTitle')}
        description={t('build.assignments.confirmAllBody')}
        confirmLabel={t('build.assignments.confirmAllAction')}
        variant="default"
      />
    </section>
  )
}

function AssignmentTable({ ctx }: { ctx: GridContext }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-card">
          <tr>
            <th scope="col" className="sticky left-0 z-30 bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('build.assignments.base')}
            </th>
            {ctx.columns.map((column) => (
              <th key={column.id} scope="col" className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {column.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} aria-hidden="true" />}
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ctx.bases.map((base, index) => (
            <tr key={base.id} className="border-t border-border" data-testid={`assignment-row-${base.id}`}>
              <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-foreground">
                <span className="mr-1.5 text-xs text-muted-foreground">{base.sequenceNumber ?? index + 1}</span>
                {base.name}
                {base.fixedChallengeId && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {t('build.assignments.pinned', { title: ctx.challengeTitle(base.fixedChallengeId) })}
                  </span>
                )}
              </th>
              {ctx.columns.map((column) => {
                if (column.id === ALL_TEAMS && base.fixedChallengeId) {
                  // A pinned base already has its challenge for everyone; per-team cells may still override it.
                  return (
                    <td key={column.id} className="px-2 py-1.5 align-top text-sm text-muted-foreground" data-testid={`assignment-cell-${base.id}-all`}>
                      {ctx.challengeTitle(base.fixedChallengeId)}
                    </td>
                  )
                }
                return (
                  <td key={column.id} className="px-2 py-1.5 align-top">
                    <GridCell ctx={ctx} base={base} column={column} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
