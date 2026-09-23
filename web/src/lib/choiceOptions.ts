import { isChoiceAnswerType, type AnswerType, type ChoiceOption } from '@/types/v2'

/** Mirrors the server's ChoiceGrading limits. */
export const MIN_CHOICE_OPTIONS = 2
export const MAX_CHOICE_OPTIONS = 12
export const MAX_CHOICE_OPTION_TEXT = 500

export type ChoiceOptionsProblem =
  | 'tooFew'
  | 'tooMany'
  | 'emptyText'
  | 'textTooLong'
  | 'duplicateText'
  | 'singleNeedsOneCorrect'
  | 'multipleNeedsCorrect'

/** The first reason the server would refuse these options, or null when they can be saved. */
export function choiceOptionsProblem(answerType: AnswerType, options: ChoiceOption[] | undefined): ChoiceOptionsProblem | null {
  if (!isChoiceAnswerType(answerType)) return null
  const list = options ?? []
  if (list.length < MIN_CHOICE_OPTIONS) return 'tooFew'
  if (list.length > MAX_CHOICE_OPTIONS) return 'tooMany'
  const texts = new Set<string>()
  for (const option of list) {
    const text = option.text.trim()
    if (!text) return 'emptyText'
    if (text.length > MAX_CHOICE_OPTION_TEXT) return 'textTooLong'
    const folded = text.toLowerCase()
    if (texts.has(folded)) return 'duplicateText'
    texts.add(folded)
  }
  const correct = list.filter((o) => o.correct).length
  if (answerType === 'single_choice' && correct !== 1) return 'singleNeedsOneCorrect'
  if (answerType === 'multiple_choice' && correct < 1) return 'multipleNeedsCorrect'
  return null
}

/**
 * Options to start from when a challenge becomes a choice challenge: its
 * earlier options when it had some, otherwise two empty ones. Single choice
 * keeps exactly one correct option, the first that was marked.
 */
export function choiceOptionsForType(answerType: AnswerType, current: ChoiceOption[] | undefined): ChoiceOption[] | undefined {
  if (!isChoiceAnswerType(answerType)) return current
  const options = current?.length ? current : [{ text: '', correct: true }, { text: '', correct: false }]
  if (answerType !== 'single_choice') return options
  const first = options.findIndex((o) => o.correct)
  return options.map((o, i) => ({ ...o, correct: first === -1 ? i === 0 : i === first }))
}

/** What the update request carries: trimmed texts, and the ids of options that already exist. */
export function choiceOptionsPayload(options: ChoiceOption[] | undefined): ChoiceOption[] {
  return (options ?? []).map((o) => (o.id ? { id: o.id, text: o.text.trim(), correct: o.correct } : { text: o.text.trim(), correct: o.correct }))
}
