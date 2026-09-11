import { ListDetailLayout } from '@/components/layout/ListDetailLayout'
import { useState, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { Button } from '@/components/ui/button'
import { BaseRouteEditor } from './BaseRouteEditor'
import { AssignmentGrid } from './assignments/AssignmentGrid'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { SearchInput } from '@/components/data/SearchInput'
import { QuickFilters } from '@/components/data/QuickFilters'
import { useStages } from '@/hooks/queries/useStages'
import { useTags } from '@/hooks/queries/useTags'
import { Spinner } from '@/components/feedback/Spinner'
import { BaseDetail } from './BaseDetail'
import type { Base, Assignment } from '@/types'
import { BaseStatusDot } from './BaseStatusDot'

interface BasesTabProps {
  autoLinkAction?: ReactNode
  autoLinkFeedback?: ReactNode
  gameId: string
}

function getBaseSubtitle(
  base: Base,
  assignments: Assignment[],
  t: TFunction,
): string {
  const baseAssignments = assignments.filter((a) => a.baseId === base.id)
  if (baseAssignments.length === 0) return ''

  const challenges = t('build.baseSubtitle.challenges', {
    count: new Set(baseAssignments.map((a) => a.challengeId)).size,
  })

  const allGlobal = baseAssignments.every((a) => !a.teamId)
  if (allGlobal) return t('build.baseSubtitle.allTeams', { challenges })

  const teamSpecificCount = new Set(
    baseAssignments.filter((a) => a.teamId).map((a) => a.teamId),
  ).size
  return t('build.baseSubtitle.teamSpecific', {
    challenges,
    count: teamSpecificCount,
  })
}

interface BaseListItemProps {
  base: Base
  isSelected: boolean
  onSelect: () => void
  subtitle: string
  numbered: boolean
}

function BaseListItem({
  base,
  isSelected,
  onSelect,
  subtitle,
  numbered,
}: BaseListItemProps) {
  return (
    <button
      onClick={onSelect}
      data-testid={`base-item-${base.id}`}
      className={`w-full text-left px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-muted border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        {numbered && <BaseSequenceBadge sequenceNumber={base.sequenceNumber} />}
        <BaseStatusDot base={base} />
        <span className="text-sm font-medium text-foreground truncate">
          {base.name}
        </span>
      </div>
      <div className="mt-0.5 ml-4 text-xs text-muted-foreground">
        {subtitle}
      </div>
    </button>
  )
}

export function BasesTab({
  gameId,
  autoLinkAction,
  autoLinkFeedback,
}: BasesTabProps) {
  const { t } = useTranslation()
  const selectedBaseId = useWorkspaceStore((s) => s.selectedBaseId)
  const selectBase = useWorkspaceStore((s) => s.selectBase)

  const { data: game } = useGame(gameId)
  const [arranging, setArranging] = useState(false)
  const [gridOpen, setGridOpen] = useState(false)
  const { data: bases = [], isLoading, isError, refetch } = useBases(gameId)
  const { data: assignments = [] } = useAssignments(gameId)

  const [search, setSearch] = useState('')
  const { data: stages = [] } = useStages(gameId)
  const { data: tags = [] } = useTags(gameId)
  // Quick filters: one stage (or "no stage") and any of the chosen tags.
  const [stageFilter, setStageFilter] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState<string[]>([])

  const orderedBases = useMemo(
    () =>
      game?.enforceBaseOrder
        ? [...bases].sort(
            (a, b) =>
              (a.sequenceNumber ?? Number.MAX_SAFE_INTEGER) -
              (b.sequenceNumber ?? Number.MAX_SAFE_INTEGER),
          )
        : bases,
    [bases, game?.enforceBaseOrder],
  )

  // Stage membership comes from the stage's own base list: the server derives
  // it from Base.stageId, and the stages query is the one a stage change
  // invalidates, so it cannot lag behind a stale bases cache.
  const stageOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const stage of stages)
      for (const id of stage.baseIds) map.set(id, stage.id)
    return map
  }, [stages])
  const stageOptions = useMemo(() => {
    if (stages.length === 0) return []
    const ordered = [...stages]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => ({ id: s.id, label: s.name }))
    const unstaged = bases.some((b) => !stageOf.has(b.id))
    return unstaged
      ? [...ordered, { id: 'none', label: t('build.filters.noStage') }]
      : ordered
  }, [stages, bases, stageOf, t])
  const tagOptions = useMemo(
    () =>
      tags.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color })),
    [tags],
  )
  // A chosen stage or tag that no longer exists (deleted, or the last unstaged
  // base got a stage) stops filtering instead of emptying the list with no
  // pressed chip to clear.
  const activeStage = useMemo(
    () => stageFilter.filter((id) => stageOptions.some((o) => o.id === id)),
    [stageFilter, stageOptions],
  )
  const activeTags = useMemo(
    () => tagFilter.filter((id) => tagOptions.some((o) => o.id === id)),
    [tagFilter, tagOptions],
  )
  const filtersActive = activeStage.length > 0 || activeTags.length > 0

  const filteredBases = useMemo(() => {
    const q = search.trim().toLowerCase()
    const stage = activeStage[0]
    return orderedBases.filter((b) => {
      if (q && !b.name.toLowerCase().includes(q)) return false
      if (stage === 'none' && stageOf.has(b.id)) return false
      if (stage && stage !== 'none' && stageOf.get(b.id) !== stage) return false
      if (
        activeTags.length > 0 &&
        !activeTags.some((id) => b.tagIds?.includes(id))
      )
        return false
      return true
    })
  }, [orderedBases, search, activeStage, stageOf, activeTags])

  const routeEditorOpen = arranging && !!game?.enforceBaseOrder

  if (routeEditorOpen) {
    return (
      <BaseRouteEditor
        gameId={gameId}
        bases={orderedBases}
        editable={game?.status === 'setup'}
        onClose={() => setArranging(false)}
      />
    )
  }
  if (gridOpen) {
    return (
      <AssignmentGrid
        gameId={gameId}
        bases={orderedBases}
        editable={game?.status !== 'ended'}
        onClose={() => setGridOpen(false)}
      />
    )
  }

  return (
    <ListDetailLayout
      selected={!!selectedBaseId}
      onBack={() => selectBase(null)}
      list={
        <>
          <div className="flex flex-wrap gap-2 border-b border-border p-2">
            {game?.enforceBaseOrder && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-9 flex-1"
                data-testid="arrange-route-btn"
                disabled={
                  game.status !== 'setup' ||
                  isLoading ||
                  isError ||
                  bases.length < 2
                }
                onClick={() => {
                  selectBase(null)
                  setArranging(true)
                }}
              >
                {t('baseOrder.route')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="min-h-9 flex-1"
              data-testid="assignment-grid-btn"
              disabled={isLoading || isError || bases.length === 0}
              onClick={() => {
                selectBase(null)
                setGridOpen(true)
              }}
            >
              {t('build.assignments.open')}
            </Button>
            {autoLinkAction}
            {game?.enforceBaseOrder && game.status !== 'setup' && (
              <p className="w-full text-xs text-muted-foreground">
                {t('baseOrder.setupOnly')}
              </p>
            )}
          </div>
          {autoLinkFeedback}
          {/* Search */}
          <div className="p-2 border-b border-border">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('build.searchBases')}
              debounceMs={150}
            />
            <QuickFilters
              className="mt-2"
              groups={[
                {
                  id: 'stage',
                  label: t('build.filters.stage'),
                  mode: 'single',
                  options: stageOptions,
                  value: activeStage,
                  onChange: setStageFilter,
                },
                {
                  id: 'tag',
                  label: t('build.filters.tags'),
                  mode: 'multi',
                  options: tagOptions,
                  value: activeTags,
                  onChange: setTagFilter,
                },
              ]}
            />
          </div>

          {/* List */}
          <div
            className="flex-1 overflow-y-auto p-1.5 space-y-0.5"
            data-testid="base-list"
          >
            {isLoading && <Spinner />}
            {!isLoading && isError && (
              <div className="px-3 py-6 text-xs text-destructive text-center space-y-2">
                <p>{t('common.error')}</p>
                <button
                  onClick={() => refetch()}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {t('common.retry')}
                </button>
              </div>
            )}
            {!isLoading &&
              !isError &&
              filteredBases.map((base) => (
                <BaseListItem
                  key={base.id}
                  base={base}
                  isSelected={selectedBaseId === base.id}
                  onSelect={() => selectBase(base.id)}
                  subtitle={getBaseSubtitle(base, assignments, t)}
                  numbered={!!game?.enforceBaseOrder}
                />
              ))}
            {!isLoading && !isError && filteredBases.length === 0 && (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                {bases.length === 0
                  ? t('build.noBasesYet')
                  : filtersActive
                    ? t('bases.noResults')
                    : t('build.searchBasesEmpty')}
              </div>
            )}
          </div>
        </>
      }
    >
      {selectedBaseId ? (
        <BaseDetail baseId={selectedBaseId} gameId={gameId} />
      ) : (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          {t('build.selectBasePrompt')}
        </div>
      )}
    </ListDetailLayout>
  )
}
