export type AnswerType = 'text' | 'file' | 'none' | 'single_choice' | 'multiple_choice'

/** Choice challenges are graded by the server, all-or-nothing, one attempt per team and base. */
export const CHOICE_ANSWER_TYPES = ['single_choice', 'multiple_choice'] as const

export function isChoiceAnswerType(type: AnswerType | null | undefined): type is 'single_choice' | 'multiple_choice' {
  return type === 'single_choice' || type === 'multiple_choice'
}

/**
 * One option of a choice challenge as the operator edits it, answer key
 * included. A new option has no id; the server assigns one and keeps it
 * across edits so earlier submissions still resolve.
 */
export interface ChoiceOption {
  id?: string
  text: string
  correct: boolean
}

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
  /** Operator-only options of a choice challenge; absent on other types. */
  choiceOptions?: ChoiceOption[] | null
  points: number
  locationBound: boolean
  requirePresenceToSubmit: boolean
  unlocksBaseIds?: string[]
  fixedBaseId?: string
  operatorNotes?: string
  tagIds?: string[]
}
