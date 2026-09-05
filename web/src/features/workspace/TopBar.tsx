import { FloatingBar } from '@/components/layout/FloatingBar'
import { GameStatusBadge } from '@/components/status'
import { useElapsedTimer } from '@/hooks/ui/useElapsedTimer'
import { useWorkspaceStore, type GameMode } from '@/stores/workspace'
import { useCreateStage } from '@/hooks/mutations/useStageMutations'
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

  const handleCreateStage = () => {
    const nextIndex = stages.length
    createStage.mutate({
      name: `Stage ${nextIndex + 1}`,
      transitionType: 'manual',
    })
  }

  return (
    <FloatingBar>
      {/* Left: Game name + status badge */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0 min-w-0">
        <span className="font-bold text-foreground text-sm truncate max-w-[120px] md:max-w-none">{game.name}</span>
        <GameStatusBadge
          status={game.status}
          elapsed={elapsed}
          labelCase="upper"
        />
      </div>

      {/* Divider — only when stage strip is visible */}
      {hasStages && <div className="w-px h-5 bg-border shrink-0" />}

      {/* Stage strip */}
      <StageStrip
        stages={stages}
        selectedStageId={selectedStageId}
        onSelectStage={selectStage}
        gameStatus={game.status}
        onCreateStage={handleCreateStage}
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
    </FloatingBar>
  )
}
