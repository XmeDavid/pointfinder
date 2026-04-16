import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBases } from '@/hooks/queries/useBases'
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
}

function BaseListItem({ base, isSelected, onSelect, subtitle }: BaseListItemProps) {
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

  const { data: bases = [], isLoading, isError, refetch } = useBases(gameId)
  const { data: assignments = [] } = useAssignments(gameId)

  const [search, setSearch] = useState('')

  const filteredBases = useMemo(() => {
    if (!search.trim()) return bases
    const q = search.toLowerCase()
    return bases.filter((b) => b.name.toLowerCase().includes(q))
  }, [bases, search])

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left panel -- base list */}
      <div className="w-56 border-r border-border flex flex-col shrink-0">
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
            />
          ))}
          {!isLoading && !isError && filteredBases.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              {search ? t('build.searchBasesEmpty') : t('build.noBasesYet')}
            </div>
          )}
        </div>
      </div>

      {/* Right panel -- detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedBaseId ? (
          <BaseDetail baseId={selectedBaseId} gameId={gameId} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('build.selectBasePrompt')}
          </div>
        )}
      </div>
    </div>
  )
}
