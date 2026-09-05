export type TransitionType = 'scheduled' | 'trigger' | 'manual'

export interface Stage {
  id: string
  gameId: string
  name: string
  description: string | null
  orderIndex: number
  transitionType: TransitionType
  scheduledAt: string | null
  triggerBaseId: string | null
  isActive: boolean
  baseIds: string[]
  createdAt: string
  updatedAt: string
}
