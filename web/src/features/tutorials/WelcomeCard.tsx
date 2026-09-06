/**
 * First-run offer for the guided `first-game` tutorial.
 *
 * Shown only on an empty personal dashboard with no progress row for the
 * scenario. Skip writes a `skipped` row so the card never comes back; the
 * scenario stays reachable from the tutorials library.
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import type { Game } from '@/types'
import { useTourStore } from './store'

export function WelcomeCard({ games }: { games: Game[] | undefined }) {
  const { t } = useTranslation()
  const active = useWorkspaceContext((s) => s.active)
  const progress = useTourStore((s) => s.progress['first-game'])
  const running = useTourStore((s) => s.activeScenario === 'first-game')
  const start = useTourStore((s) => s.start)
  const skip = useTourStore((s) => s.skip)

  if (active.type !== 'personal') return null
  if (!games || games.length > 0) return null
  if (progress || running) return null

  return (
    <SurfacePanel
      padding="md"
      elevation="panel"
      data-testid="tutorial-welcome-card"
      className="mb-6"
    >
      <h2 className="text-base font-semibold text-foreground">{t('tutorials.welcome.title')}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t('tutorials.welcome.body')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('tutorials.welcome.duration')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          data-testid="tutorial-welcome-start"
          onClick={() => start('first-game', { gamesAtStart: games.map((g) => g.id) })}
        >
          {t('tutorials.welcome.start')}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-welcome-skip"
          onClick={() => skip('first-game')}
        >
          {t('tutorials.welcome.skip')}
        </Button>
      </div>
    </SurfacePanel>
  )
}
