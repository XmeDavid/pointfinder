import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button, buttonVariants, cn } from '@/components'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { kv } from '@/platform'
import { ONBOARDING_SEEN_KEY, parseCompletedRole } from '@/components/onboarding/useOnboarding'

/** Once dismissed or opened, the map never asks again; the story stays under Settings. */
export const INTRODUCTION_PROMPT_KEY = 'player.introduction.prompt.v1'
export const PARTICIPANT_STORY_ROUTE = '/welcome?play=participant'

/**
 * A quiet, one-time offer on the map after joining: see how a game works, or
 * not. It never blocks the map, a pending tag, or a queued action, and a
 * player who already watched the participant story on this device never sees it.
 */
export function IntroductionPrompt() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const [show, setShow] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([kv.get(INTRODUCTION_PROMPT_KEY), kv.get(ONBOARDING_SEEN_KEY)]).then(([prompt, seen]) => {
      if (alive && !prompt && parseCompletedRole(seen) !== 'participant') setShow(true)
    }).catch(() => { /* Without preferences there is no way to promise "once"; stay quiet. */ })
    return () => { alive = false }
  }, [])

  const dismiss = () => {
    setShow(false)
    void kv.set(INTRODUCTION_PROMPT_KEY, new Date().toISOString()).catch(() => { /* Nonessential preference. */ })
  }

  if (!show) return null
  return (
    <SurfacePanel padding="sm" elevation="panel" aria-label={t('map.introPrompt.title')} className="pointer-events-auto" data-testid="player-intro-prompt">
      <p className="text-sm font-semibold leading-tight">{t('map.introPrompt.title')}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('map.introPrompt.body')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link to={PARTICIPANT_STORY_ROUTE} onClick={dismiss} className={cn(buttonVariants({ size: 'sm' }))} data-testid="player-intro-prompt-open">{t('map.introPrompt.open')}</Link>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} data-testid="player-intro-prompt-dismiss">{t('map.introPrompt.dismiss')}</Button>
      </div>
    </SurfacePanel>
  )
}
