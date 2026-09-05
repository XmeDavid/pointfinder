import { FloatingBar } from '@/components/layout/FloatingBar'
import { GameStatusBadge } from '@/components/status'
import { useElapsedTimer } from '@/hooks/ui/useElapsedTimer'
import { useWorkspaceStore, type GameMode } from '@/stores/workspace'
import { useCreateStage } from '@/hooks/mutations/useStageMutations'
import { cn } from '@/lib/utils'
import type { Game, Stage } from '@/types/v2'
import { StageStrip } from './StageStrip'

const modeLabels: Array<{ mode: GameMode; label: string }> = [
  { mode: 'build', label: 'Build' },
  { mode: 'command', label: 'Command' },
  { mode: 'review', label: 'Review' },
  { mode: 'results', label: 'Results' },
]

export interface TopBarProps {
  game: Game
  stages: Stage[]
}

export function TopBar({ game, stages }: TopBarProps) {
  const elapsed = useElapsedTimer(game.status === 'live' ? game.startDate : null)
  const selectedStageId = useWorkspaceStore((s) => s.selectedStageId)
  const selectStage = useWorkspaceStore((s) => s.selectStage)
  const mode = useWorkspaceStore((s) => s.mode)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const createStage = useCreateStage(game.id)

  const hasStages = stages.length >= 2
  const useMobileStageRow = game.status === 'live' && hasStages

  const handleCreateStage = () => {
    const nextIndex = stages.length
    createStage.mutate({
      name: `Stage ${nextIndex + 1}`,
      transitionType: 'manual',
    })
  }

  return (
    <FloatingBar>
      <div className={cn('flex w-full min-w-0 items-center gap-2', useMobileStageRow && 'max-md:flex-wrap max-md:gap-y-1')}>
        {/* Left: Game name + status badge */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0 min-w-0" data-testid="top-bar-primary">
          <span className="font-bold text-foreground text-sm truncate max-w-[120px] md:max-w-none">{game.name}</span>
          <GameStatusBadge
            status={game.status}
            elapsed={elapsed}
            labelCase="upper"
          />
        </div>

        {/* Divider — only when stage strip is visible */}
        {hasStages && <div className={cn('w-px h-5 bg-border shrink-0', useMobileStageRow && 'max-md:hidden')} />}

        {/* Stage strip */}
        <StageStrip
          stages={stages}
          selectedStageId={selectedStageId}
          onSelectStage={selectStage}
          gameStatus={game.status}
          onCreateStage={handleCreateStage}
          className={useMobileStageRow ? 'max-md:order-last max-md:basis-full max-md:w-full max-md:pt-1' : undefined}
        />

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Mode tabs — xl only */}
        <div className="hidden xl:flex items-center gap-1 shrink-0">
          {modeLabels.map(({ mode: m, label }) => {
            const isActive = mode === m
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </FloatingBar>
  )
}
