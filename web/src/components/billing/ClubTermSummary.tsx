import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusBadgeTone } from '@/components/status'
import { formatClubDate } from '@/lib/clubBilling'
import type { SubscriptionStatus } from '@/types/organization'

const STATUS_TONES: Record<SubscriptionStatus, StatusBadgeTone> = {
  active: 'success',
  past_due: 'warning',
  grace_period: 'warning',
  frozen: 'destructive',
  cancelled: 'muted',
}

interface Props {
  status: SubscriptionStatus | undefined
  /** The date the club has paid through. Null when it has no term. */
  termEnd: string | null | undefined
  testId?: string
}

/**
 * What a club's members need to know about its standing: the status, and the
 * date it has paid through. The grace and frozen warnings themselves belong to
 * `BillingWarningBanner` and `FrozenBlocker`, which already render app-wide;
 * this only states the facts they act on.
 */
export function ClubTermSummary({ status, termEnd, testId = 'club-term' }: Props) {
  const { t, i18n } = useTranslation()
  if (!status) return null
  const paidUntil = formatClubDate(termEnd, i18n.language)

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <StatusBadge tone={STATUS_TONES[status] ?? 'muted'} label={t(`club.status.${status}`)} />
      <span className="text-sm text-muted-foreground">
        {paidUntil ? t('club.paidUntil', { date: paidUntil }) : t('club.noTerm')}
      </span>
    </div>
  )
}
