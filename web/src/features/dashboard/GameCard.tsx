import type { Game } from '@/types'
import { GameStatusBadge } from '@/components/status'
import { cn } from '@/lib/utils'

export function GameCard({
  game,
  onClick,
}: {
  game: Game
  onClick: () => void
}) {
  return (
    <div
      role="article"
      data-testid={`game-card-${game.id}`}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground truncate">
          {game.name}
        </h3>
        <GameStatusBadge status={game.status} labelCase="lower" />
      </div>
      {game.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {game.description}
        </p>
      )}
    </div>
  )
}
