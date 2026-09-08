import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Compass, RotateCcw, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { useMediaQuery } from '@/hooks/ui/useMediaQuery'
import {
  CHOICE_FRAME, COMPASS_STEP, ONBOARDING_CHAPTERS, STEP_FRAMES, stillFor, useOnboarding,
  type OnboardingBranch, type OnboardingOptions, type OnboardingOutcome, type OnboardingRole,
} from './useOnboarding'
import type { OnboardingScene } from './OnboardingScene'
import { isNativeEntry } from '@/platform/runtime'
import { appStoreUrl, GOOGLE_PLAY_URL } from '@/lib/appDownloads'
import './onboarding.css'

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

/**
 * Who is watching. Anonymous visitors choose a role and are offered an account;
 * a signed-in operator sees the organizer story with their own dashboard behind
 * it; a joined player sees the participant story with their game one tap away.
 */
export type OnboardingMode = 'anonymous' | 'operator' | 'player'

export interface OnboardingOperatorActions {
  /** The gate's "Go to my dashboard": the tour was declined. */
  onSkipTour: () => void
  /** Leaves for the dashboard from a chapter or the landing without deciding anything more. */
  onDashboard: () => void
  /** Present only while the guided first game can start; the landing then leads with it. */
  onCreateFirstGame?: () => void
}

export interface OnboardingExperienceProps {
  /** Fixture step (0–6) for the visual harness; never reads or writes completion. */
  previewStep?: number
  /** Fixture branch for the visual harness; `choice` shows the role screen. */
  previewRole?: OnboardingBranch
  /** Fixture gate for the visual harness: the organizer's account choice, or the signed-in tour offer. */
  previewGate?: boolean
  mode?: OnboardingMode
  /** Open straight on this role's first chapter: after registration, a replay, or the player's explanation. */
  play?: OnboardingRole
  /** Anonymous only: open on the organizer's account choice instead of the role choice. */
  organizerGate?: boolean
  /** The story was watched to the end, or skipped. */
  onFinish?: (role: OnboardingRole, outcome: OnboardingOutcome) => void
  operator?: OnboardingOperatorActions
}

function hookOptions({ previewStep, previewRole, previewGate, mode, play, organizerGate, onFinish }: OnboardingExperienceProps): OnboardingOptions {
  if (previewStep !== undefined || previewRole !== undefined || previewGate) return { preview: { step: previewStep, role: previewRole, gate: previewGate } }
  if (mode === 'operator') return { start: play ? { branch: 'organizer' } : { branch: 'organizer', gate: true }, roleChoice: false, onFinish }
  if (mode === 'player') return { start: { branch: 'participant' }, roleChoice: false, remember: true, onFinish }
  const start = play ? { branch: play } : organizerGate ? { branch: 'organizer' as const, gate: true } : undefined
  return { start, roleChoice: true, resume: start === undefined, remember: true, onFinish }
}

/** Text remains accessible, localized DOM above the decorative full-screen world.
 * The role choice only picks which story is told; joining and signing in stay one tap away,
 * and nobody has to register before they can watch. */
export function OnboardingExperience(props: OnboardingExperienceProps) {
  const { mode = 'anonymous', operator } = props
  const { t, i18n } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const native = isNativeEntry()
  const { branch, step, stage, loaded, chooseRole, changeRole, openChapters, go, skip } = useOnboarding(hookOptions(props))
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [Scene, setScene] = useState<typeof OnboardingScene | null>(null)
  const ready = useCallback(() => setStatus('ready'), [])
  const failed = useCallback(() => setStatus('error'), [])
  const retry = useCallback(() => { setStatus('loading'); setAttempt((value) => value + 1) }, [])

  // A new branch means new geometry: show its still until the renderer reports ready again,
  // and give a failed renderer a fresh attempt instead of carrying the error across roles.
  const [sceneBranch, setSceneBranch] = useState(branch)
  if (sceneBranch !== branch) {
    setSceneBranch(branch)
    if (status === 'error') setAttempt((value) => value + 1)
    setStatus('loading')
  }

  useEffect(() => {
    if (!loaded || reducedMotion) return
    let active = true
    void import('./OnboardingScene').then((module) => {
      if (active) {
        // Restoring motion mounts a fresh renderer; keep its still until ready.
        setStatus('loading')
        setScene(() => module.OnboardingScene)
      }
    }).catch(() => { if (active) failed() })
    return () => { active = false }
  }, [attempt, loaded, reducedMotion, failed])

  const choice = stage === 'choice'
  const gate = stage === 'gate'
  const landing = stage === 'landing'
  const chapter = branch === 'choice' ? 'choice' : gate ? 'gate' : ONBOARDING_CHAPTERS[branch][step]
  const targetFrame = choice ? CHOICE_FRAME : STEP_FRAMES[step]
  const copy = (key: string) => (branch === 'organizer' ? t(`onboarding.organizerSteps.${chapter}.${key}`) : t(`onboarding.steps.${chapter}.${key}`))
  const heading = useRef<HTMLHeadingElement>(null)
  const layout = `${branch}:${stage}`
  const previousLayout = useRef(layout)
  useEffect(() => {
    // Controls disappear at these boundaries (role choice, gate, chapters, landing); move focus to the new title.
    if (previousLayout.current !== layout) heading.current?.focus({ preventScroll: true })
    previousLayout.current = layout
  }, [layout])
  const staticWorld = reducedMotion || status !== 'ready'
  const language = i18n.resolvedLanguage?.split('-')[0] ?? 'en'
  const nextLabel = step === COMPASS_STEP - 1 ? t('onboarding.finish') : branch === 'organizer' ? copy('next') : t('onboarding.next')
  const anonymous = mode === 'anonymous'

  const action = (variant: 'default' | 'outline' | 'link') =>
    cn(buttonVariants({ variant, size: variant === 'link' ? undefined : 'lg' }), 'onboarding-action', variant === 'link' && 'px-0')
  const joinLink = (variant: 'default' | 'outline' | 'link') => <Link to="/join" className={action(variant)}>{t('welcome.joinGame')}</Link>
  const loginLink = (variant: 'default' | 'outline' | 'link', label = t('welcome.operatorLogin')) => <Link to="/login" className={action(variant)}>{label}</Link>
  const registerLink = (variant: 'default' | 'outline', testId?: string) => (
    <Link to="/register" className={action(variant)} data-testid={testId}>{t('onboarding.gate.createAccount')}</Link>
  )
  const gameLink = (variant: 'default' | 'link', testId?: string) => (
    <Link to="/" className={action(variant)} data-testid={testId}>{t('onboarding.player.back')}</Link>
  )
  const dashboardButton = (variant: 'default' | 'outline' | 'link', testId: string) => (
    <Button variant={variant} size={variant === 'link' ? 'sm' : 'lg'} className={cn('onboarding-action', variant === 'link' && 'px-0')} onClick={operator?.onDashboard} data-testid={testId}>{t('onboarding.account.dashboard')}</Button>
  )
  const roleButton = (role: OnboardingRole, icon: ReactNode, onClick: () => void) => (
    <Button variant="outline" size="lg" className="onboarding-role" onClick={onClick} data-testid={`onboarding-role-${role}`}>
      <span className="onboarding-role-icon text-primary" aria-hidden="true">{icon}</span>
      <span className="text-base font-semibold">{t(`onboarding.roles.${role}.label`)}</span>
      <span className="onboarding-role-description text-muted-foreground">{t(`onboarding.roles.${role}.description`)}</span>
    </Button>
  )
  /** The quiet way out under the chapters: joining or signing in, back to the game, or the dashboard. */
  const escapeRow = anonymous ? (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
      {native && joinLink('link')}
      {loginLink('link')}
    </div>
  ) : (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
      {mode === 'player' ? gameLink('link', 'onboarding-player-back') : dashboardButton('link', 'onboarding-dashboard-link')}
    </div>
  )

  const eyebrow = choice ? (
    <span>{t('onboarding.choice.eyebrow')}</span>
  ) : landing ? (
    <span>{t(branch === 'organizer' ? 'onboarding.organizerLanding' : 'onboarding.landing')}</span>
  ) : (
    <>
      {gate ? <span>{t(anonymous ? 'onboarding.gate.eyebrow' : 'onboarding.account.eyebrow')}</span> : <span aria-live="polite">{t('onboarding.progress', { current: step + 1, total: COMPASS_STEP })}</span>}
      {anonymous && (
        <>
          <span aria-hidden="true">·</span>
          <span>{t(`onboarding.roles.${branch}.short`)}</span>
          <Button variant="link" size="sm" className="onboarding-inline-action" onClick={changeRole} data-testid="onboarding-change-role">{t('onboarding.changeRole')}</Button>
        </>
      )}
    </>
  )
  const title = choice ? t('onboarding.choice.title') : gate ? t(anonymous ? 'onboarding.gate.title' : 'onboarding.account.title') : copy('title')
  const body = choice ? t('onboarding.choice.body') : gate ? t(anonymous ? 'onboarding.gate.body' : 'onboarding.account.body')
    : landing && mode === 'operator' ? t('onboarding.account.landingBody')
    : landing && anonymous && branch === 'participant' && !native ? t('onboarding.download.body') : copy('body')

  let controls: ReactNode
  if (choice) {
    controls = (
      <>
        <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label={t('onboarding.choice.title')}>
          {roleButton('participant', <Users size={22} />, () => chooseRole('participant'))}
          {roleButton('organizer', <Compass size={22} />, () => chooseRole('organizer', { gate: true }))}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1">
          {native && joinLink('link')}
          {loginLink('link')}
        </div>
      </>
    )
  } else if (gate) {
    controls = anonymous ? (
      <div className="mt-5 grid gap-3">
        {registerLink('default', 'onboarding-gate-create-account')}
        {loginLink('outline', t('onboarding.gate.signIn'))}
        <Button variant="ghost" size="lg" className="onboarding-action" onClick={openChapters} data-testid="onboarding-gate-watch">{t('onboarding.gate.watchFirst')}</Button>
      </div>
    ) : (
      <div className="mt-5 grid gap-3">
        <Button size="lg" className="onboarding-action" onClick={openChapters} data-testid="onboarding-tour-start">{t('onboarding.account.tour')}</Button>
        <Button variant="outline" size="lg" className="onboarding-action" onClick={operator?.onSkipTour} data-testid="onboarding-tour-skip">{t('onboarding.account.dashboard')}</Button>
      </div>
    )
  } else if (landing) {
    let primary: ReactNode
    let secondary: ReactNode = null
    if (mode === 'operator') {
      if (operator?.onCreateFirstGame) {
        primary = <Button size="lg" className="onboarding-action" onClick={operator.onCreateFirstGame} data-testid="onboarding-first-game">{t('onboarding.account.createFirstGame')}</Button>
        secondary = dashboardButton('outline', 'onboarding-dashboard')
      } else {
        primary = dashboardButton('default', 'onboarding-dashboard')
      }
    } else if (mode === 'player') {
      primary = gameLink('default', 'onboarding-player-back')
    } else if (branch === 'organizer') {
      primary = registerLink('default', 'onboarding-landing-create-account')
      secondary = loginLink('outline', t('onboarding.gate.signIn'))
    } else if (!native) {
      primary = <a href={appStoreUrl()} className={action('default')} data-testid="onboarding-download-ios">{t('onboarding.download.ios')}</a>
      secondary = <a href={GOOGLE_PLAY_URL} className={action('outline')} data-testid="onboarding-download-android">{t('onboarding.download.android')}</a>
    } else {
      primary = joinLink('default')
      secondary = loginLink('outline')
    }
    controls = (
      <div className="mt-5 grid gap-3">
        {primary}
        {secondary}
        <Button variant="ghost" size="lg" className="onboarding-action" onClick={changeRole} data-testid="onboarding-replay"><RotateCcw aria-hidden="true" size={16} />{t('onboarding.replay')}</Button>
      </div>
    )
  } else {
    const canGoBack = anonymous || step > 0
    controls = (
      <>
        <div className={cn('mt-5 grid gap-3', canGoBack && 'grid-cols-2')}>
          {canGoBack && <Button variant="outline" size="lg" className="onboarding-action" onClick={() => go(step - 1)} data-testid="onboarding-back"><ArrowLeft aria-hidden="true" size={18} />{t('onboarding.back')}</Button>}
          <Button size="lg" className="onboarding-action" onClick={() => go(step + 1)} data-testid="onboarding-next">{nextLabel}<ArrowRight aria-hidden="true" size={18} /></Button>
        </div>
        <Button variant="ghost" size="lg" className="onboarding-action mt-1 w-full" onClick={skip} data-testid="onboarding-skip">{t('onboarding.skip')}</Button>
        {escapeRow}
      </>
    )
  }

  return (
    <main className="onboarding-experience bg-background text-foreground" data-testid="onboarding-experience" data-step={chapter} data-role={branch} data-mode={mode} data-motion={reducedMotion ? 'reduced' : 'active'}>
      <div className="onboarding-art" aria-hidden="true">
        {staticWorld && <img className="onboarding-still" src={stillFor(branch, step)} alt="" />}
        {loaded && Scene && !reducedMotion && status !== 'error' && (
          <SceneBoundary key={attempt} onError={failed}>
            <Scene branch={branch} targetFrame={targetFrame} reducedMotion={reducedMotion} className={cn('onboarding-scene', status !== 'ready' && 'invisible')} onReady={ready} onError={failed} />
          </SceneBoundary>
        )}
      </div>
      <header className="onboarding-header">
        <span className="text-base font-semibold tracking-tight">{t('app.name')}</span>
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="sr-only">{t('onboarding.language')}</span>
          <select aria-label={t('onboarding.language')} value={language} onChange={(event) => void i18n.changeLanguage(event.target.value)} className="min-h-11 max-w-full rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="en" lang="en">English</option>
            <option value="pt" lang="pt">Português</option>
            <option value="de" lang="de">Deutsch</option>
          </select>
        </label>
      </header>
      <section className="onboarding-overlay" aria-labelledby="onboarding-title">
        <div className="onboarding-copy">
          <div className="onboarding-eyebrow text-xs font-medium tracking-wide text-muted-foreground">{eyebrow}</div>
          <div aria-live="polite" aria-atomic="true">
            <h1 ref={heading} tabIndex={-1} id="onboarding-title" className="mt-2 text-3xl font-semibold tracking-tight focus-visible:outline-none sm:text-4xl">{title}</h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
        {controls}
        <div className="onboarding-status text-center text-xs text-muted-foreground" role="status">
          {reducedMotion ? t('onboarding.reduced') : status === 'error' ? <>{t('onboarding.unavailable')} <Button variant="link" size="sm" className="onboarding-action" onClick={retry}>{t('onboarding.retry')}</Button></> : status === 'loading' ? t('onboarding.loading') : null}
        </div>
      </section>
    </main>
  )
}
