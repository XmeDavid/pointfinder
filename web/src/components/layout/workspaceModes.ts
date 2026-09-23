import { ClipboardCheck, Hammer, RadioTower, type LucideIcon } from 'lucide-react'
import type { GameMode } from '@/stores/workspace'

/** The three operator modes shown in navigation (OW-32). Results lives inside Monitor. */
export type NavMode = Exclude<GameMode, 'results'>

/** Icons follow the semantic catalog (`design-system/icons.json`): setup, command, review. */
export const NAV_MODES: ReadonlyArray<{ mode: NavMode; Icon: LucideIcon; labelKey: string }> = [
  { mode: 'build', Icon: Hammer, labelKey: 'workspace.modes.build' },
  { mode: 'command', Icon: RadioTower, labelKey: 'workspace.modes.monitor' },
  { mode: 'review', Icon: ClipboardCheck, labelKey: 'workspace.modes.review' },
]

/** The navigation entry a workspace mode belongs to: results are part of Monitor. */
export function navModeOf(mode: GameMode): NavMode {
  return mode === 'results' ? 'command' : mode
}
