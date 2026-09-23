import type { Challenge } from '@/types'
import type { AnswerType, ChoiceOption } from '@/types/v2'
import { choiceOptionsProblem } from '@/lib/choiceOptions'

/** The editable part of a challenge, as the operator types it. */
export interface ChallengeDraftFields {
  title: string
  answerType: AnswerType
  autoValidate: boolean
  description: string
  content: string
  correctAnswer: string[]
  /**
   * Options of a choice challenge. Absent (not empty) when the challenge has
   * none, so drafts saved before choice challenges existed still match.
   */
  choiceOptions?: ChoiceOption[]
  points: string
  operatorNotes: string
  locationBound: boolean
  unlocks: string[]
  completionContent: string
}

export function challengeDraftFields(challenge: Challenge): ChallengeDraftFields {
  return {
    title: challenge.title,
    answerType: challenge.answerType,
    autoValidate: challenge.autoValidate,
    description: challenge.description,
    content: challenge.content,
    correctAnswer: challenge.correctAnswer ?? [],
    choiceOptions: challenge.choiceOptions?.length
      ? challenge.choiceOptions.map((o) => ({ id: o.id, text: o.text, correct: o.correct }))
      : undefined,
    points: challenge.points.toString(),
    operatorNotes: challenge.operatorNotes ?? '',
    locationBound: challenge.locationBound,
    unlocks: challenge.unlocksBaseIds ?? [],
    completionContent: challenge.completionContent,
  }
}

export function challengeDraftIsValid(fields: ChallengeDraftFields): boolean {
  const points = Number(fields.points)
  return fields.title.trim().length > 0
    && Number.isInteger(points) && points >= 0 && points <= 100000
    && fields.operatorNotes.length <= 5000
    && choiceOptionsProblem(fields.answerType, fields.choiceOptions) === null
}
