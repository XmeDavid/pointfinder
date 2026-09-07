import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChallengePicker } from '@/components/data/ChallengePicker'
import type { Base, Challenge, Tag, Team } from '@/types'
import { ALL_TEAMS, baseMode, baseOfChallenge, cellChallenge, optionsFor, type AssignmentRow } from './plan'

export interface GridColumn {
  id: string
  label: string
  color: string | null
}

/** Everything a cell needs, shared by the desktop table and the phone list. */
export interface GridContext {
  gameId: string
  bases: Base[]
  assignments: AssignmentRow[]
  challenges: Challenge[]
  teams: Team[]
  tags: Tag[]
  columns: GridColumn[]
  editable: boolean
  writing: boolean
  change: (baseId: string, column: string, challengeId: string | null) => void
  challengeTitle: (id: string) => string
}

/**
 * One cell: the picker for a base and column, with the column's rules. The
 * all-teams column of a pinned base is the pinned challenge, read-only.
 */
export function GridCell({ ctx, base, column }: { ctx: GridContext; base: Base; column: GridColumn }) {
  const { t } = useTranslation()
  const mode = baseMode(ctx.assignments, base.id)
  const value = cellChallenge(ctx.assignments, base.id, column.id)
  const allowed = useMemo(
    () => new Set(optionsFor(ctx.assignments, ctx.challenges, base.id, column.id).map((c) => c.id)),
    [ctx.assignments, ctx.challenges, base.id, column.id],
  )
  const dimmed = column.id === ALL_TEAMS ? mode === 'teams' : mode === 'all'
  const baseName = (id: string | null) => ctx.bases.find((b) => b.id === id)?.name ?? null
  // Why a challenge is off the menu: the base that holds it for this column,
  // or for everyone.
  const reasonFor = (challengeId: string) => {
    const at = baseOfChallenge(ctx.assignments, challengeId, column.id) ?? baseOfChallenge(ctx.assignments, challengeId, ALL_TEAMS)
    const name = baseName(at)
    return name ? t('build.assignments.pickerTakenAt', { base: name }) : null
  }
  return (
    <ChallengePicker
      value={value}
      challenges={ctx.challenges}
      allowedIds={allowed}
      reasonFor={reasonFor}
      tags={ctx.tags}
      onChange={(id) => ctx.change(base.id, column.id, id)}
      disabled={!ctx.editable || ctx.writing}
      label={`${base.name} · ${column.label}`}
      dimmed={dimmed}
      testId={`assignment-cell-${base.id}-${column.id}`}
    />
  )
}
