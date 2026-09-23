import { FileText, Layers, MapPin, Puzzle, QrCode, Users, type LucideIcon } from 'lucide-react'
import type { DrawerTab } from '@/stores/workspace'

/**
 * The content panel's sections (OW-36), in drawer order. Icons follow the
 * semantic catalog in `design-system/icons.json` (base, challenge, team,
 * stage, codes, document) and always travel with their label.
 */
export const CONTENT_SECTIONS: ReadonlyArray<{ key: DrawerTab; labelKey: string; newLabelKey: string | null; Icon: LucideIcon }> = [
  { key: 'bases', labelKey: 'build.drawer.bases', newLabelKey: 'build.drawer.newBase', Icon: MapPin },
  { key: 'challenges', labelKey: 'build.drawer.challenges', newLabelKey: 'build.drawer.newChallenge', Icon: Puzzle },
  { key: 'teams', labelKey: 'build.drawer.teams', newLabelKey: 'build.drawer.newTeam', Icon: Users },
  { key: 'stages', labelKey: 'build.drawer.stages', newLabelKey: 'build.drawer.newStage', Icon: Layers },
  { key: 'nfc', labelKey: 'build.drawer.nfcTags', newLabelKey: null, Icon: QrCode },
  { key: 'documents', labelKey: 'build.drawer.documents', newLabelKey: null, Icon: FileText },
]
