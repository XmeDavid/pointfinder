import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Route position is independent of the base's NFC or team progress status. */
export function BaseSequenceBadge({ sequenceNumber, className }: {
  sequenceNumber?: number | null
  className?: string
}) {
  const { t } = useTranslation()
  if (sequenceNumber == null) return null
  return (
    <Badge variant="secondary" className={cn('shrink-0 self-start tabular-nums', className)}
      aria-label={t('baseOrder.baseNumber', { number: sequenceNumber, defaultValue: 'Base {{number}}' })}>
      {sequenceNumber}
    </Badge>
  )
}
