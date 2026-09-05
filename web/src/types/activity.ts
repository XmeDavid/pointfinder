export type ActivityEventType =
  | 'check_in'
  | 'submission'
  | 'approval'
  | 'rejection'

export interface ActivityEvent {
  id: string
  gameId: string
  type: ActivityEventType
  teamId: string
  baseId?: string
  challengeId?: string
  message: string
  timestamp: string
}
