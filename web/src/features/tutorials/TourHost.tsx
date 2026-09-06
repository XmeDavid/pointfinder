import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CoachBubble } from '@/components/tour/CoachBubble'
import { Spotlight } from '@/components/tour/Spotlight'
import { TourPill } from '@/components/tour/TourPill'
import { useAnchorRect } from '@/components/tour/useAnchorRect'
import { useAuthStore } from '@/lib/auth/store'
import { advance, effectiveSteps, isStepDone, resolveAnchor, resolveBody, stepIndexOf } from './engine'
import { getScenario } from './scenarios'
import { useTourStore } from './store'
import { useTourActions } from './useTourActions'
import { useTourState } from './useTourState'
import { useProgressHydration, useProgressWriteThrough } from './progressSync'
import type { Scenario, TourActions, TourState } from './types'

/** Typing settles for this long before DOM-reading predicates re-run, so the bubble never jumps mid-word. */
export const INPUT_SETTLE_MS = 500

/**
 * Mounted once in the pathless root route so it has router context everywhere.
 * It renders — and mounts query hooks — only while a scenario is actually
 * running for an operator, so it costs nothing on every other route.
 */
export function TourHost() {
  const activeScenario = useTourStore((s) => s.activeScenario)
  const role = useAuthStore((s) => s.user?.role)
  const scenario = activeScenario ? getScenario(activeScenario) : undefined

  // Both sync hooks live here, above the early returns: progress is written
  // when no run is active too (the welcome card's Skip, a completed row).
  useProgressHydration()
  useProgressWriteThrough()

  if (!scenario) return null
  if (role !== 'operator' && role !== 'admin') return null
  return <TourRunner scenario={scenario} />
}

function TourRunner({ scenario }: { scenario: Scenario }) {
  const { t } = useTranslation()
  const state = useTourState()
  const actions = useTourActions()

  const currentStepId = useTourStore((s) => s.currentStepId)
  const paused = useTourStore((s) => s.paused)
  const gameId = useTourStore((s) => s.gameId)
  const clickedSteps = useTourStore((s) => s.clickedSteps)
  const tick = useTourStore((s) => s.tick)
  const ack = useTourStore((s) => s.ack)
  const later = useTourStore((s) => s.later)
  const clicked = useTourStore((s) => s.clicked)
  const pause = useTourStore((s) => s.pause)
  const resume = useTourStore((s) => s.resume)
  const bindGame = useTourStore((s) => s.bindGame)
  const bumpTick = useTourStore((s) => s.bumpTick)
  const setCurrentStep = useTourStore((s) => s.setCurrentStep)
  const markStepCompleted = useTourStore((s) => s.markStepCompleted)
  const complete = useTourStore((s) => s.complete)

  const steps = effectiveSteps(scenario, state)
  // Null means "at the first effective step"; a guard that turned false leaves the
  // id out of the list, and the resolve effect below moves the run on.
  const index = currentStepId ? stepIndexOf(scenario, state, currentStepId) : steps.length > 0 ? 0 : -1
  const step = index >= 0 ? steps[index] : undefined
  const anchorId = step ? resolveAnchor(step, state) : null
  const { element, rect, visible } = useAnchorRect(anchorId || null, tick)

  // Latest state/actions without making them effect dependencies. Declared
  // first so every effect below reads this render's values.
  const latest = useRef<{ state: TourState; actions: TourActions }>({ state, actions })
  useEffect(() => {
    latest.current = { state, actions }
  })

  // Pin the implicit first step so the run (and, later, the server) names a real step id.
  useEffect(() => {
    if (!currentStepId && steps.length > 0) setCurrentStep(steps[0].id)
  }, [currentStepId, setCurrentStep, steps])

  // A `new-game` scenario starts on the dashboard and follows the operator into
  // the workspace of the game they create. `Game` has no creation timestamp, so
  // "new" means "not in the snapshot taken when the run started".
  useEffect(() => {
    if (scenario.entry !== 'new-game') return
    if (gameId) return
    const routeGameId = state.routeGameId
    if (!routeGameId || state.gamesAtStart.includes(routeGameId)) return
    bindGame(routeGameId)
  }, [bindGame, gameId, scenario.entry, state.gamesAtStart, state.routeGameId])

  // Capture-phase listeners: record clicks inside the anchor, and nudge the
  // engine whenever anything in the app is pressed or typed, so predicates that
  // read unsaved form fields stay live. Typing settles before it counts.
  useEffect(() => {
    let frame = 0
    let typing: ReturnType<typeof setTimeout> | null = null
    const nudge = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        bumpTick()
      })
    }
    const onInput = () => {
      // Typing supersedes a pending immediate nudge: the field is read once it settles.
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      if (typing) clearTimeout(typing)
      typing = setTimeout(() => {
        typing = null
        bumpTick()
      }, INPUT_SETTLE_MS)
    }
    const onClick = (event: Event) => {
      const target = event.target
      if (step && element && target instanceof Node && element.contains(target)) clicked(step.id)
      nudge()
    }
    // New nodes (a drawer opening, a detail form mounting) are read without a
    // click. Attribute churn is deliberately excluded: the map repaints a lot.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(nudge)
    mutations?.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('change', nudge, true)
    document.addEventListener('input', onInput, true)
    return () => {
      mutations?.disconnect()
      if (frame) cancelAnimationFrame(frame)
      if (typing) clearTimeout(typing)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('change', nudge, true)
      document.removeEventListener('input', onInput, true)
    }
  }, [bumpTick, clicked, element, step])

  const done = step ? isStepDone(step, state, clickedSteps) : false

  // Advance when the current step completes, and resolve a step whose guard
  // dropped it out of the effective list. Past the last step the run is done.
  useEffect(() => {
    if (steps.length === 0) return
    if (!currentStepId) return
    if (step) {
      if (!done) return
      markStepCompleted(step.id, Date.now())
      const next = advance(scenario, latest.current.state, clickedSteps, step.id, true)
      if (next === null) complete()
      else setCurrentStep(next)
      return
    }
    const next = advance(scenario, latest.current.state, clickedSteps, currentStepId)
    if (next === null) complete()
    else setCurrentStep(next)
  }, [clickedSteps, complete, currentStepId, done, markStepCompleted, scenario, setCurrentStep, step, steps.length])

  // `prepare` reveals the anchor when the step starts. Idempotent per step id.
  const preparedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!step || paused) return
    if (preparedFor.current === step.id) return
    preparedFor.current = step.id
    step.prepare?.(latest.current.actions, latest.current.state)
  }, [paused, step])

  if (!step) return null

  const total = steps.length
  const handleClose = () => {
    pause()
    element?.focus?.()
  }
  const handleResume = () => {
    const { state: s, actions: a } = latest.current
    if (step.route === 'workspace' && gameId && s.routeGameId !== gameId) a.navigate(`/game/${gameId}`)
    else if (step.route === 'dashboard' && !s.isDashboard) a.navigate('/dashboard')
    step.prepare?.(a, s)
    resume()
  }

  const bubble = (anchorRect: DOMRect | null) => (
    <CoachBubble
      title={t(step.copy.title)}
      body={t(resolveBody(step, state))}
      aside={step.copy.aside ? t(step.copy.aside) : undefined}
      step={index + 1}
      total={total}
      anchorRect={anchorRect}
      isLast={index === total - 1}
      onAck={step.done.kind === 'ack' ? () => ack(step.id) : undefined}
      onLater={step.copy.later ? () => later(step.id) : undefined}
      onClose={handleClose}
    />
  )

  // A step with no anchor (the closing card) shows a centred bubble and dims nothing.
  if (anchorId === '') {
    return paused ? <TourPill step={index + 1} total={total} onResume={handleResume} /> : bubble(null)
  }

  if (paused || !visible || !rect) {
    return <TourPill step={index + 1} total={total} onResume={handleResume} />
  }

  return (
    <>
      <Spotlight rect={rect} />
      {bubble(rect)}
    </>
  )
}
