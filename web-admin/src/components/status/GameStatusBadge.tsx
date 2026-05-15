import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'
import type { GameStatus } from '@/types'

export type GameStatusLabelCase = 'title' | 'upper' | 'lower'

const gameStatusTone: Record<GameStatus, StatusBadgeTone> = {
  setup: 'info',
  live: 'success',
  ended: 'muted',
}

const titleLabels: Record<GameStatus, string> = {
  setup: 'Setup',
  live: 'Live',
  ended: 'Ended',
}

function formatGameStatusLabel(status: GameStatus, labelCase: GameStatusLabelCase) {
  const label = titleLabels[status]

  if (labelCase === 'upper') return label.toUpperCase()
  if (labelCase === 'lower') return label.toLowerCase()
  return label
}

export interface GameStatusBadgeProps {
  status: GameStatus
  elapsed?: string | null
  labelCase?: GameStatusLabelCase
  className?: string
}

export function GameStatusBadge({
  status,
  elapsed,
  labelCase = 'title',
  className,
}: GameStatusBadgeProps) {
  const label = formatGameStatusLabel(status, labelCase)
  const fullLabel = status === 'live' && elapsed ? `${label} · ${elapsed}` : label

  return (
    <StatusBadge
      tone={gameStatusTone[status]}
      label={fullLabel}
      pulse={status === 'live'}
      className={className}
      aria-label={
        status === 'live' && elapsed
          ? `Game is live, elapsed time ${elapsed}`
          : `Game status: ${label}`
      }
    />
  )
}
