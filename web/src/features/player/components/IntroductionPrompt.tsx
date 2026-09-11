import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { kv } from '@/platform'

/** Once dismissed or opened, the map never asks again; guidance stays available under Settings. */
export const INTRODUCTION_PROMPT_KEY = 'player.introduction.prompt.v2'

/**
 * A quiet, one-time offer on the map after joining: see how a game works, or
 * not. It never blocks the map, a pending tag, or a queued action, and a
 * player who already dismissed this tour offer on this device never sees it.
 */
export function IntroductionPrompt({onStart}: {onStart:()=>void}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const [show, setShow] = useState(false)

  useEffect(() => {
    let alive = true
    void kv.get(INTRODUCTION_PROMPT_KEY).then(prompt => {
      if (alive && !prompt) setShow(true)
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
        <Button size="sm" onClick={() => { dismiss(); onStart(); }} data-testid="player-intro-prompt-open">{t('map.introPrompt.open')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} data-testid="player-intro-prompt-dismiss">{t('map.introPrompt.dismiss')}</Button>
      </div>
    </SurfacePanel>
  )
}
