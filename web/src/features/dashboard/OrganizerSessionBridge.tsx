import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@pointfinder/api'
import { useServices } from '@/app/player/services'
import { useAuthStore } from '@/lib/auth/store'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'

/**
 * OW-01: an organizer who signed in through the player entry has an account
 * session but no operator session. The server exchanges the account bearer
 * for an operator token pair after checking the role; the operator store is
 * then hydrated the same way a login hydrates it. Nothing is copied between
 * the stores on the device.
 */
export function OrganizerSessionBridge() {
  const { t } = useTranslation(undefined, { keyPrefix: 'experience' })
  const { account } = useServices()
  const [error, setError] = useState<'denied' | 'failed' | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let disposed = false
    let sessionChanged = false
    const origin = account.session.current
    const accountId = origin.kind === 'operator' ? origin.userId : null
    const unsubscribe = account.session.subscribe(next => {
      if (next.kind !== 'operator' || next.userId !== accountId) sessionChanged = true
    })
    ;(async () => {
      try {
        const token = await account.accessToken()
        if (!token) throw new Error('No account session')
        if (!accountId || disposed || sessionChanged) return
        await useAuthStore.getState().adoptOrganizerSession(token, accountId, () => !disposed && !sessionChanged)
        if (!disposed) setError(null)
      } catch (err) {
        if (disposed) return
        const status = err instanceof ApiError ? err.status : (err as { response?: { status?: number } })?.response?.status
        setError(status === 403 ? 'denied' : 'failed')
      }
    })()
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [account, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  if (error === 'denied') {
    return (
      <div data-testid="organizer-session-denied">
        <ErrorState title={t('organizerSessionDenied')} />
      </div>
    )
  }
  if (error === 'failed') {
    return (
      <div data-testid="organizer-session-error">
        <ErrorState title={t('organizerSessionError')} retryLabel={t('retry')} onRetry={retry} />
      </div>
    )
  }
  return (
    <div data-testid="organizer-session-loading">
      <LoadingState label={t('organizerSessionLoading')} />
    </div>
  )
}
