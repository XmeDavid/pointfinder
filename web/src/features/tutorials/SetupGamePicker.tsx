import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateGameDialog } from '@/features/dashboard/CreateGameDialog'
import { useGames } from '@/hooks/queries/useGames'

/**
 * Which game a `setup-game` scenario should run on.
 *
 * Only games in `setup` qualify: the scenarios teach setup-time controls, and a
 * live game would refuse most of them. Creating a game from here binds the new
 * game to the scenario instead of navigating, so the tour starts on the game
 * the operator just made.
 */
export function SetupGamePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (gameId: string) => void
}) {
  const { t } = useTranslation()
  const { data: games, isLoading } = useGames()
  const [createOpen, setCreateOpen] = useState(false)

  const setupGames = (games ?? []).filter((game) => game.status === 'setup')

  return (
    <>
      <Dialog
        open={open && !createOpen}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent className="max-w-md" data-testid="setup-game-picker" onClose={onClose}>
          <DialogHeader>
            <DialogTitle>{t('tutorials.library.pickGame.title')}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : setupGames.length === 0 ? (
            <EmptyState density="compact" title={t('tutorials.library.pickGame.empty')} />
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {setupGames.map((game) => (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => onPick(game.id)}
                    data-testid={`setup-game-option-${game.id}`}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                  >
                    <span className="block truncate font-medium">{game.name}</span>
                    {game.description && (
                      <span className="block truncate text-xs text-muted-foreground">{game.description}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => setCreateOpen(true)} data-testid="setup-game-create">
              {t('tutorials.library.pickGame.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateGameDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(game) => {
          setCreateOpen(false)
          onPick(game.id)
        }}
      />
    </>
  )
}
