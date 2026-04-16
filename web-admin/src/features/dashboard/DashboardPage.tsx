import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGames } from '@/hooks/queries/useGames'
import { SearchInput } from '@/components/data/SearchInput'
import { GameCard } from './GameCard'
import { CreateGameDialog } from './CreateGameDialog'
import { ImportGameDialog } from './ImportGameDialog'
import { Spinner } from '@/components/feedback/Spinner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { useQuota } from '@/hooks/queries/useQuota'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/tooltip'
import { PendingOrgInvites } from './PendingOrgInvites'
import { PendingGameInvites } from './PendingGameInvites'
export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: games, isLoading, isError, error } = useGames()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const { active } = useWorkspaceContext()
  const { data: quota } = useQuota()

  const atGameLimit =
    quota != null &&
    quota.limits.maxActiveGames !== null &&
    quota.usage.currentActiveGames >= quota.limits.maxActiveGames

  const filtered = useMemo(() => {
    if (!games) return []
    let result = games

    // Filter by workspace
    if (active.type === 'personal') {
      result = result.filter((g) => !g.orgId)
    } else {
      result = result.filter((g) => g.orgId === active.orgId)
    }

    // Then apply search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((g) => g.name.toLowerCase().includes(q))
    }
    return result
  }, [games, search, active])

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      {/* Pending invites */}
      <PendingOrgInvites />
      <PendingGameInvites />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PointFinder</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('dashboard.yourGames')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            data-testid="import-game-btn"
            className="px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            {t('dashboard.importBtn')}
          </button>
          <Tooltip content={atGameLimit ? t('quota.gameLimit', 'Game limit reached. Upgrade your plan.') : null}>
            <button
              onClick={() => !atGameLimit && setDialogOpen(true)}
              data-testid="create-game-btn"
              disabled={atGameLimit}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('games.newGame')}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Search — only show when there are games */}
      {!isLoading && !isError && games && games.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('dashboard.searchPlaceholder')}
          className="mb-6 max-w-sm"
        />
      )}

      {/* Loading */}
      {isLoading && <Spinner />}

      {/* Error */}
      {isError && (
        <p className="text-sm text-destructive">
          {t('dashboard.loadFailed', {
            err: (error as Error)?.message ?? t('common.unknownError'),
          })}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && games && games.length === 0 && (
        <EmptyState
          title={t('dashboard.noGamesYet')}
          description={t('dashboard.createYourFirst')}
          action={
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('games.newGame')}
            </button>
          }
        />
      )}

      {/* No search results */}
      {!isLoading &&
        !isError &&
        games &&
        games.length > 0 &&
        filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('dashboard.noMatches', { query: search })}
          </p>
        )}

      {/* Game grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onClick={() => navigate(`/game/${game.id}`)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <CreateGameDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      {/* Import dialog */}
      <ImportGameDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />

    </div>
  )
}
