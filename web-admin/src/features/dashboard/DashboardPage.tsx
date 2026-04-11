import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGames } from '@/hooks/queries/useGames'
import { SearchInput } from '@/components/data/SearchInput'
import { GameCard } from './GameCard'
import { CreateGameDialog } from './CreateGameDialog'
import { Spinner } from '@/components/feedback/Spinner'
import { EmptyState } from '@/components/feedback/EmptyState'

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: games, isLoading, isError, error } = useGames()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!games) return []
    if (!search.trim()) return games
    const q = search.toLowerCase()
    return games.filter((g) => g.name.toLowerCase().includes(q))
  }, [games, search])

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PointFinder</h1>
          <p className="text-sm text-muted-foreground mt-1">Your Games</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          data-testid="create-game-btn"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + New Game
        </button>
      </div>

      {/* Search — only show when there are games */}
      {!isLoading && !isError && games && games.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search games..."
          className="mb-6 max-w-sm"
        />
      )}

      {/* Loading */}
      {isLoading && <Spinner />}

      {/* Error */}
      {isError && (
        <p className="text-sm text-destructive">
          Failed to load games: {(error as Error)?.message ?? 'Unknown error'}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && games && games.length === 0 && (
        <EmptyState
          title="No games yet"
          description="Create your first game to get started."
          action={
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + New Game
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
            No games match &ldquo;{search}&rdquo;
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
    </div>
  )
}
