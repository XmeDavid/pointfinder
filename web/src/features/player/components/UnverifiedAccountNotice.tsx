import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MailWarning } from 'lucide-react'
import { useAccountSession, useServices } from '@/app/player/services'

/** A quiet reminder under the map header until the signed-in account confirms its address. */
export function UnverifiedAccountNotice() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const session = useAccountSession()
  const { account } = useServices()
  const me = useQuery({ queryKey: ['account', 'me'], queryFn: () => account.api.account.me(), enabled: session.kind === 'operator', staleTime: 10 * 60_000 })
  if (session.kind !== 'operator' || !me.data || me.data.emailVerified) return null
  return (
    <Link to="/settings" className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-overlay backdrop-blur" data-testid="player-unverified-notice">
      <MailWarning className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      <span>{t('account.verifyBanner')}</span>
    </Link>
  )
}
