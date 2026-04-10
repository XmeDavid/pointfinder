import type { Stage, GameStatus } from '@/types/v2'

const STAGE_COLOR_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f59e0b', // amber
]

function getStageColor(orderIndex: number): string {
  return STAGE_COLOR_PALETTE[orderIndex % STAGE_COLOR_PALETTE.length]
}

function TransitionArrow({ type }: { type: Stage['transitionType'] }) {
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs shrink-0 select-none">
      {type === 'scheduled' && <span title="Scheduled">&#9201;</span>}
      {type === 'trigger' && <span title="Trigger">&#127937;</span>}
      <span>&rarr;</span>
    </span>
  )
}

export interface StageStripProps {
  stages: Stage[]
  selectedStageId: string | null
  onSelectStage: (id: string | null) => void
  gameStatus: GameStatus
}

export function StageStrip({ stages, selectedStageId, onSelectStage, gameStatus }: StageStripProps) {
  if (stages.length < 2) return null

  const sorted = [...stages].sort((a, b) => a.orderIndex - b.orderIndex)
  const isLive = gameStatus === 'live'
  const isAllSelected = selectedStageId === null

  // During live games: stages before the first active stage are "completed",
  // stages after the last active stage are "locked"
  const activeIndex = isLive
    ? sorted.findIndex((s) => s.isActive)
    : -1

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
      {/* "All" button */}
      <button
        onClick={() => onSelectStage(null)}
        className={`
          inline-flex items-center px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0
          ${
            isAllSelected
              ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          }
        `}
      >
        All
      </button>

      {sorted.map((stage, i) => {
        const isSelected = selectedStageId === stage.id
        const color = getStageColor(stage.orderIndex)
        const isCompleted = isLive && activeIndex >= 0 && stage.orderIndex < sorted[activeIndex].orderIndex
        const isLocked = isLive && activeIndex >= 0 && stage.orderIndex > sorted[activeIndex].orderIndex

        return (
          <div key={stage.id} className="flex items-center gap-1.5 shrink-0">
            {i > 0 && <TransitionArrow type={stage.transitionType} />}

            <button
              onClick={() => onSelectStage(stage.id)}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0
                ${
                  isSelected
                    ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }
              `}
            >
              {isCompleted && <span className="text-primary">&#10003;</span>}
              {isLocked && <span>&#128274;</span>}
              <span
                className="rounded-full shrink-0"
                style={{ width: 6, height: 6, backgroundColor: color }}
              />
              <span>{stage.name}</span>
            </button>
          </div>
        )
      })}

      {/* "+ Stage" placeholder */}
      <button
        className="inline-flex items-center px-2 py-1 text-xs rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        + Stage
      </button>
    </div>
  )
}
