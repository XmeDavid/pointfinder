import { FloatingBar } from '@/components/layout/FloatingBar'
import { useElapsedTimer } from '@/hooks/ui/useElapsedTimer'
import { useWorkspaceStore, type GameMode } from '@/stores/workspace'
import type { Game, Stage } from '@/types/v2'
import { StageStrip } from './StageStrip'

const modeLabels: Array<{ mode: GameMode; label: string }> = [
  { mode: 'build', label: 'Build' },
  { mode: 'command', label: 'Command' },
  { mode: 'review', label: 'Review' },
  { mode: 'results', label: 'Results' },
]

function StatusBadge({ game }: { game: Game }) {
  const elapsed = useElapsedTimer(
    game.status === 'live' ? game.startDate : null,
  )

  if (game.status === 'setup') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-info/20 text-info">
        SETUP
      </span>
    )
  }

  if (game.status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        LIVE {elapsed && `\u00B7 ${elapsed}`}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      ENDED
    </span>
  )
}

export interface TopBarProps {
  game: Game
  stages: Stage[]
}

export function TopBar({ game, stages }: TopBarProps) {
  const selectedStageId = useWorkspaceStore((s) => s.selectedStageId)
  const selectStage = useWorkspaceStore((s) => s.selectStage)
  const mode = useWorkspaceStore((s) => s.mode)
  const setMode = useWorkspaceStore((s) => s.setMode)

  const hasStages = stages.length >= 2

  return (
    <FloatingBar>
      {/* Left: Game name + status badge */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-bold text-foreground text-sm">{game.name}</span>
        <StatusBadge game={game} />
      </div>

      {/* Divider — only when stage strip is visible */}
      {hasStages && <div className="w-px h-5 bg-border shrink-0" />}

      {/* Stage strip */}
      <StageStrip
        stages={stages}
        selectedStageId={selectedStageId}
        onSelectStage={selectStage}
        gameStatus={game.status}
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
