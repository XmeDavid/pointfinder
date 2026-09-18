import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth, useAccountSession } from '@/app/player/services'
import { useAuthStore } from '@/lib/auth/store'
import { clearResumeLocation, consumeResumeTarget, recordResumeLocation } from './resume'

/**
 * Keeps the resume record in step with the router: every authorized screen
 * is remembered, and losing the session that owned it (sign-out, auth expiry,
 * leaving the game) forgets it so the next launch opens Home instead.
 */
export function ResumeRecorder() {
  const location = useLocation()
  const player = useAuth()
  const account = useAccountSession()
  const userId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.id ?? null) : null))
  const playerId = player.kind === 'player' ? player.playerId : null
  const accountId = account.kind === 'operator' ? account.userId : null
  const previous = useRef({ userId, playerId, accountId })

  useEffect(() => {
    const before = previous.current
    previous.current = { userId, playerId, accountId }
    if ((before.userId && before.userId !== userId) || (before.playerId && before.playerId !== playerId) || (before.accountId && before.accountId !== accountId)) clearResumeLocation()
  }, [userId, playerId, accountId])

  useEffect(() => {
    // Any explicit route/deep link takes precedence over a pending cold-start target.
    if (location.pathname !== '/') consumeResumeTarget()
    recordResumeLocation(`${location.pathname}${location.search}`, { userId, playerId, accountId })
  }, [location.pathname, location.search, userId, playerId, accountId])

  return null
}
