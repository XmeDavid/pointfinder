import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Base } from '@/types'
import { ALL_TEAMS, baseMode, cellChallenge } from './plan'
import { GridCell, type GridContext } from './GridCell'

/**
 * The phone shape of the assignment grid: one row per base with what it
 * holds, and a sheet per base with a picker for "All teams" and for each
 * team. Same rules and same cell test ids as the table.
 */
export function AssignmentList({ ctx }: { ctx: GridContext }) {
  const { t } = useTranslation()
  const [openBaseId, setOpenBaseId] = useState<string | null>(null)
  const openBase = openBaseId ? ctx.bases.find((base) => base.id === openBaseId) ?? null : null

  const summary = (base: Base): string => {
    const mode = baseMode(ctx.assignments, base.id)
    if (mode === 'all') return ctx.challengeTitle(cellChallenge(ctx.assignments, base.id, ALL_TEAMS) ?? '')
    if (mode === 'teams') {
      const set = ctx.teams.filter((team) => cellChallenge(ctx.assignments, base.id, team.id) !== null).length
      return t('build.assignments.perTeamCount', { set, total: ctx.teams.length })
    }
    if (base.fixedChallengeId) return ctx.challengeTitle(base.fixedChallengeId)
    return t('build.assignments.unassigned')
  }

  return (
    <>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" data-testid="assignment-list">
        {ctx.bases.map((base, index) => (
          <li key={base.id}>
            <button
              type="button"
              onClick={() => setOpenBaseId(base.id)}
              data-testid={`assignment-base-${base.id}`}
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/50 cursor-pointer"
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{base.sequenceNumber ?? index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{base.name}</span>
                <span className="block truncate text-xs text-muted-foreground" data-testid={`assignment-base-summary-${base.id}`}>
                  {summary(base)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={openBase !== null} onOpenChange={(open) => { if (!open) setOpenBaseId(null) }}>
        {openBase && (
          <DialogContent
            onClose={() => setOpenBaseId(null)}
            className="flex max-h-[90dvh] w-full flex-col self-end overflow-hidden rounded-b-none p-0 sm:max-w-lg sm:self-center sm:rounded-lg"
            data-testid="assignment-base-dialog"
          >
            <DialogHeader className="mb-0 shrink-0 border-b border-border px-4 pb-3 pt-4 pr-12 text-left">
              <DialogTitle className="text-base">{openBase.name}</DialogTitle>
              <DialogDescription>
                {openBase.fixedChallengeId
                  ? t('build.assignments.pinned', { title: ctx.challengeTitle(openBase.fixedChallengeId) })
                  : t('build.assignments.baseHint')}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {ctx.columns.map((column) => {
                const pinnedAll = column.id === ALL_TEAMS && !!openBase.fixedChallengeId
                return (
                  <div key={column.id} className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {column.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} aria-hidden="true" />}
                      {column.label}
                    </span>
                    {pinnedAll ? (
                      <p className="text-sm text-muted-foreground" data-testid={`assignment-cell-${openBase.id}-all`}>
                        {ctx.challengeTitle(openBase.fixedChallengeId!)}
                      </p>
                    ) : (
                      <GridCell ctx={ctx} base={openBase} column={column} />
                    )}
                  </div>
                )
              })}
              {ctx.teams.length === 0 && <p className="text-xs text-muted-foreground">{t('build.assignments.noTeams')}</p>}
            </div>

            <div className="shrink-0 border-t border-border p-3">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setOpenBaseId(null)} data-testid="assignment-base-done">
                {t('build.assignments.close')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
