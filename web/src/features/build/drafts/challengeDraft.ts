import type { Challenge } from '@/types'
import type { AnswerType } from '@/types/v2'

/** The editable part of a challenge, as the operator types it. */
export interface ChallengeDraftFields {
  title: string
  answerType: AnswerType
  autoValidate: boolean
  description: string
  content: string
  correctAnswer: string[]
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
    points: challenge.points.toString(),
    operatorNotes: challenge.operatorNotes ?? '',
    locationBound: challenge.locationBound,
    unlocks: challenge.unlocksBaseIds ?? [],
    completionContent: challenge.completionContent,
  }
}

export function challengeDraftIsValid(fields: ChallengeDraftFields): boolean {
  const points = Number(fields.points)
  return fields.title.trim().length > 0 && Number.isInteger(points) && points >= 0 && points <= 100000 && fields.operatorNotes.length <= 5000
}
