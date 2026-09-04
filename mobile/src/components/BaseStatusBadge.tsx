import { useTranslation } from 'react-i18next'
import type { BaseStatus } from '@pointfinder/api'
import { Badge } from '@pointfinder/core'

const VARIANT: Record<BaseStatus, 'outline' | 'info' | 'warning' | 'success' | 'destructive'> = {
  not_visited: 'outline',
  checked_in: 'info',
  submitted: 'warning',
  completed: 'success',
  rejected: 'destructive',
}

/** Status color rule: blue checked in, amber submitted, green done, red rejected, gray not visited. */
export function BaseStatusBadge({ status, pendingSync }: { status: BaseStatus; pendingSync?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={VARIANT[status]}>{t(`status.${status}`)}</Badge>
      {pendingSync && <Badge variant="warning" aria-label={t('sync.syncing')}>…</Badge>}
    </span>
  )
}
