export type AnswerType = 'text' | 'file' | 'none'

export type ReviewMode = 'manual' | 'auto'

export interface Challenge {
  id: string
  gameId: string
  title: string
  description: string
  content: string
  completionContent: string
  answerType: AnswerType
  autoValidate: boolean
  correctAnswer?: string[]
  points: number
  locationBound: boolean
  requirePresenceToSubmit: boolean
  unlocksBaseIds?: string[]
  fixedBaseId?: string
  operatorNotes?: string
  tagIds?: string[]
}
