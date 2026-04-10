import type { Game, GameStatus } from '@/types'
import { cn } from '@/lib/utils'

const statusStyles: Record<GameStatus, string> = {
  setup: 'bg-blue-500/20 text-blue-400',
  live: 'bg-emerald-500/20 text-emerald-400',
  ended: 'bg-zinc-500/20 text-zinc-400',
}

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
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground truncate">
          {game.name}
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
            statusStyles[game.status],
          )}
        >
          {game.status}
        </span>
      </div>
      {game.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {game.description}
        </p>
      )}
    </div>
  )
}
