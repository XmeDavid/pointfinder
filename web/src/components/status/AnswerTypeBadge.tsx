import { useTranslation } from 'react-i18next'
import type { AnswerType } from '@/types'
import { StatusBadge, type StatusBadgeProps, type StatusBadgeTone } from './StatusBadge'

/** Challenge type is a category, not a state: text and choice read as info, media as override, check-in only as muted. */
const answerTypeTone: Record<AnswerType, StatusBadgeTone> = {
  text: 'info',
  file: 'override',
  none: 'muted',
  single_choice: 'info',
  multiple_choice: 'info',
}

export interface AnswerTypeBadgeProps extends Omit<StatusBadgeProps, 'label' | 'tone'> {
  answerType: AnswerType
}

/** The localized challenge type, shared by the builder list, the command inspector and statistics. */
export function AnswerTypeBadge({ answerType, size = 'sm', ...props }: AnswerTypeBadgeProps) {
  const { t } = useTranslation()
  return (
    <StatusBadge
      tone={answerTypeTone[answerType] ?? 'muted'}
      size={size}
      label={t(`build.editor.${answerType}`, { defaultValue: answerType })}
      data-testid="answer-type-badge"
      {...props}
    />
  )
}
