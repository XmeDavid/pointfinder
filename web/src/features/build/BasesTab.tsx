import { ListDetailLayout } from '@/components/layout/ListDetailLayout'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { Button } from '@/components/ui/button'
import { BaseRouteEditor } from './BaseRouteEditor'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { SearchInput } from '@/components/data/SearchInput'
import { Spinner } from '@/components/feedback/Spinner'
import { BaseDetail } from './BaseDetail'
import type { Base, Assignment } from '@/types'

interface BasesTabProps {
  gameId: string
}

function BaseStatusDot({ base }: { base: Base }) {
  if (base.hidden) {
    const color = base.nfcLinked
      ? 'border-primary/60 bg-primary/20'
      : 'border-destructive/60 bg-destructive/20'
    const title = base.nfcLinked ? 'Hidden (NFC linked)' : 'Hidden (missing NFC)'
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full border border-dashed shrink-0 ${color}`}
        title={title}
      />
    )
  }
  if (!base.nfcLinked) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0"
        title="Missing NFC"
      />
    )
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-primary shrink-0"
      title="Ready"
    />
  )
}

function getBaseSubtitle(base: Base, assignments: Assignment[]): string {
  const baseAssignments = assignments.filter((a) => a.baseId === base.id)
  const uniqueChallenges = new Set(baseAssignments.map((a) => a.challengeId))
  const challengeCount = uniqueChallenges.size

  if (baseAssignments.length === 0) return ''

  const challengeText =
    challengeCount === 1 ? '1 challenge' : `${challengeCount} challenges`

  const allGlobal = baseAssignments.every((a) => !a.teamId)
  if (allGlobal) return `${challengeText} \u00B7 All teams`

  const teamSpecificCount = new Set(
    baseAssignments.filter((a) => a.teamId).map((a) => a.teamId),
  ).size

  return `${challengeText} \u00B7 ${teamSpecificCount} team-specific`
}

interface BaseListItemProps {
  base: Base
  isSelected: boolean
  onSelect: () => void
  subtitle: string
  numbered: boolean
}

function BaseListItem({ base, isSelected, onSelect, subtitle, numbered }: BaseListItemProps) {
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
      <div className="mt-0.5 ml-4 text-xs text-muted-foreground">{subtitle}</div>
    </button>
  )
}

export function BasesTab({ gameId }: BasesTabProps) {
  const { t } = useTranslation()
  const selectedBaseId = useWorkspaceStore((s) => s.selectedBaseId)
  const selectBase = useWorkspaceStore((s) => s.selectBase)

  const { data: game } = useGame(gameId)
  const [arranging, setArranging] = useState(false)
  const { data: bases = [], isLoading, isError, refetch } = useBases(gameId)
  const { data: assignments = [] } = useAssignments(gameId)

  const [search, setSearch] = useState('')

  const orderedBases = useMemo(() => game?.enforceBaseOrder
    ? [...bases].sort((a, b) => (a.sequenceNumber ?? Number.MAX_SAFE_INTEGER) - (b.sequenceNumber ?? Number.MAX_SAFE_INTEGER))
    : bases, [bases, game?.enforceBaseOrder])

  const filteredBases = useMemo(() => {
    if (!search.trim()) return orderedBases
    const q = search.toLowerCase()
    return orderedBases.filter((b) => b.name.toLowerCase().includes(q))
  }, [orderedBases, search])

  const routeEditorOpen = arranging && !!game?.enforceBaseOrder

  if (routeEditorOpen) {
    return <BaseRouteEditor gameId={gameId} bases={orderedBases}
      editable={game?.status === 'setup'} onClose={() => setArranging(false)} />
  }

  return (
    <ListDetailLayout selected={!!selectedBaseId} onBack={() => selectBase(null)} list={<>
        {game?.enforceBaseOrder && <div className="space-y-2 border-b border-border p-3">
          <p className="text-xs text-muted-foreground">{t('baseOrder.description', { defaultValue: 'Teams must check in at bases in the configured order.' })}</p>
          <Button variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" disabled={game.status !== 'setup' || isLoading || isError || bases.length < 2}
            onClick={() => { selectBase(null); setArranging(true) }}>
            {t('baseOrder.arrange', { defaultValue: 'Arrange route' })}
          </Button>
          {game.status !== 'setup' && <p className="text-xs text-muted-foreground">{t('baseOrder.setupOnly', { defaultValue: 'Base order can only be changed during setup.' })}</p>}
        </div>}
        {/* Search */}
        <div className="p-2 border-b border-border">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('build.searchBases')}
            debounceMs={150}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5" data-testid="base-list">
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
          {!isLoading && !isError && filteredBases.map((base) => (
            <BaseListItem
              key={base.id}
              base={base}
              isSelected={selectedBaseId === base.id}
              onSelect={() => selectBase(base.id)}
              subtitle={getBaseSubtitle(base, assignments)}
              numbered={!!game?.enforceBaseOrder}
            />
          ))}
          {!isLoading && !isError && filteredBases.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              {search ? t('build.searchBasesEmpty') : t('build.noBasesYet')}
            </div>
          )}
        </div>
    </>}>

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
