import type { Game } from '@/types'
import { useTranslation } from 'react-i18next'
import { GameStatusBadge } from '@/components/status'
import { Badge } from '@/components/ui/badge'
import { isPracticeGame } from '@/features/tutorials/practiceGame'
import { cn } from '@/lib/utils'

export function GameCard({
  game,
  onClick,
}: {
  game: Game
  onClick: () => void
}) {
  const { t } = useTranslation()
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
        <div className="flex shrink-0 items-center gap-1">
          {isPracticeGame(game) && (
            <Badge variant="info" data-testid={`practice-badge-${game.id}`}>
              {t('tutorials.practice.badge')}
            </Badge>
          )}
          <GameStatusBadge status={game.status} labelCase="lower" />
        </div>
      </div>
      {game.orgName && (
        <p
          className="mt-1 text-xs text-muted-foreground truncate"
          data-testid={`game-org-${game.id}`}
        >
          {game.orgName}
        </p>
      )}
      {game.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {game.description}
        </p>
      )}
    </div>
  )
}
