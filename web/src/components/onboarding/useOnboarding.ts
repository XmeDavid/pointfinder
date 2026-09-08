import { useCallback, useEffect, useRef, useState } from 'react'
import { kv } from '@/platform'

export type OnboardingRole = 'participant' | 'organizer'
export type OnboardingBranch = 'choice' | OnboardingRole
export type OnboardingOutcome = 'completed' | 'skipped'
/** What the overlay shows: the role choice, the organizer gate, a chapter, or the compass landing. */
export type OnboardingStage = 'choice' | 'gate' | 'chapter' | 'landing'
export const ONBOARDING_ROLES: readonly OnboardingRole[] = ['participant', 'organizer']

/** v2 stores the completed role; v1 visitors ("true" under the old key) see the role choice once. */
export const ONBOARDING_SEEN_KEY = 'player.onboarding.expanding-world.v2'
export const CHOICE_FRAME = 125
export const COMPASS_STEP = 6
export const STEP_FRAMES = [125, 301, 371, 465, 580, 765, 864] as const
export const ONBOARDING_CHAPTERS: Record<OnboardingRole, readonly string[]> = {
  participant: ['join', 'map', 'checkin', 'challenge', 'submit', 'explore', 'compass'],
  organizer: ['plan', 'bases', 'challenges', 'teams', 'live', 'review', 'compass'],
}

export interface OnboardingPreview { role?: OnboardingBranch; step?: number; gate?: boolean }
export interface OnboardingStart { branch: OnboardingBranch; step?: number; gate?: boolean }
export interface OnboardingOptions {
  /** Fixture position for the visual harness; never reads or writes anything. */
  preview?: OnboardingPreview
  /** Where to open; the role choice by default. */
  start?: OnboardingStart
  /** Whether a role choice exists to go back to. Without one, back and replay return to the first chapter. */
  roleChoice?: boolean
  /** Reopen a remembered completed role on its landing (the anonymous welcome). */
  resume?: boolean
  /** Remember completion or skip locally with the role. */
  remember?: boolean
  /** Fired once per arrival on a landing: the story was watched to the end, or skipped. */
  onFinish?: (role: OnboardingRole, outcome: OnboardingOutcome) => void
}
interface Position { branch: OnboardingBranch; step: number; gate: boolean }

export const isOnboardingRole = (value: unknown): value is OnboardingRole => ONBOARDING_ROLES.includes(value as OnboardingRole)

export function parseCompletedRole(raw: string | null): OnboardingRole | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === 2 && isOnboardingRole((parsed as { role?: unknown }).role)) {
      return (parsed as { role: OnboardingRole }).role
    }
  } catch { /* Unknown or older formats fall back to the role choice. */ }
  return null
}

/** Matching rendered stills stand in for the world while it loads or motion is reduced. */
export function stillFor(branch: OnboardingBranch, step: number): string {
  if (branch === 'choice') return '/onboarding/role-choice.webp'
  if (step === COMPASS_STEP) return '/onboarding/step-7.webp'
  return branch === 'organizer' ? `/onboarding/organizer-step-${step + 1}.webp` : `/onboarding/step-${step + 1}.webp`
}

const boundStep = (step: number) => Math.max(0, Math.min(COMPASS_STEP, Math.floor(step) || 0))

function startPosition(start: OnboardingStart | undefined): Position {
  if (!start || start.branch === 'choice') return { branch: 'choice', step: 0, gate: false }
  return { branch: start.branch, step: boundStep(start.step ?? 0), gate: start.gate === true }
}

/** Preferences never gate joining, and late reads cannot undo a user's choice.
 * The experience controls chapter timing; role and account choices remain manual. */
export function useOnboarding(options: OnboardingOptions = {}) {
  const { preview, start, roleChoice = true, resume = false, remember = false, onFinish } = options
  const previewing = preview !== undefined && (preview.role !== undefined || preview.step !== undefined || preview.gate === true)
  const [position, setPosition] = useState<Position>(() => {
    if (!previewing) return startPosition(start)
    const branch = preview.role ?? (preview.gate ? 'organizer' : 'participant')
    return { branch, step: branch === 'choice' ? 0 : boundStep(preview.step ?? 0), gate: branch !== 'choice' && preview.gate === true }
  })
  const [loaded, setLoaded] = useState(previewing || !resume)
  const touched = useRef(false)
  const latest = useRef(position)
  useEffect(() => { latest.current = position }, [position])
  const finish = useRef(onFinish)
  useEffect(() => { finish.current = onFinish }, [onFinish])

  useEffect(() => {
    if (previewing || !resume) return
    let active = true
    let expired = false
    const timeout = window.setTimeout(() => { expired = true; if (active) setLoaded(true) }, 1200)
    void kv.get(ONBOARDING_SEEN_KEY).then((raw) => {
      const role = parseCompletedRole(raw)
      if (active && !expired && !touched.current && role) setPosition({ branch: role, step: COMPASS_STEP, gate: false })
    }).catch(() => { /* The introduction is usable even when preferences fail. */ }).finally(() => {
      if (active) setLoaded(true)
      window.clearTimeout(timeout)
    })
    return () => { active = false; window.clearTimeout(timeout) }
  }, [previewing, resume])

  const move = useCallback((next: Position, outcome?: OnboardingOutcome) => {
    touched.current = true
    setPosition(next)
    setLoaded(true)
    if (outcome && next.step === COMPASS_STEP && next.branch !== 'choice' && !previewing) {
      // Completion or skip is remembered; merely choosing a role is not.
      if (remember) void kv.set(ONBOARDING_SEEN_KEY, JSON.stringify({ version: 2, role: next.branch })).catch(() => { /* Nonessential preference. */ })
      finish.current?.(next.branch, outcome)
    }
  }, [previewing, remember])

  const firstChapter = useCallback((): Position => {
    const { branch } = latest.current
    if (roleChoice || branch === 'choice') return { branch: 'choice', step: 0, gate: false }
    return { branch, step: 0, gate: false }
  }, [roleChoice])

  /** Opens a branch on its first chapter, or on its gate, without remembering anything. */
  const chooseRole = useCallback((role: OnboardingRole, opts?: { gate?: boolean }) => move({ branch: role, step: 0, gate: opts?.gate === true }), [move])
  /** Returns to the role choice from any chapter, gate or landing (or to the first chapter without one). */
  const changeRole = useCallback(() => move(firstChapter()), [move, firstChapter])
  /** Leaves the gate for the branch's first chapter. */
  const openChapters = useCallback(() => move({ branch: latest.current.branch === 'choice' ? 'participant' : latest.current.branch, step: 0, gate: false }), [move])
  /**
   * Moves to a chapter. Below the first chapter means back to the choice; the
   * compass means the landing, watched to the end unless `how` says skipped.
   */
  const go = useCallback((next: number, how: OnboardingOutcome = 'completed') => {
    if (next < 0) { move(firstChapter()); return }
    const { branch } = latest.current
    // Skipping straight from the choice explains the participant side, the app's default audience.
    const target = boundStep(next)
    move({ branch: branch === 'choice' ? 'participant' : branch, step: target, gate: false }, target === COMPASS_STEP ? how : undefined)
  }, [move, firstChapter])
  /** Jumps to the landing, remembered as a skip. */
  const skip = useCallback(() => go(COMPASS_STEP, 'skipped'), [go])

  const stage: OnboardingStage = position.branch === 'choice' ? 'choice' : position.gate ? 'gate' : position.step === COMPASS_STEP ? 'landing' : 'chapter'

  return { branch: position.branch, step: position.step, stage, loaded, preview: previewing, chooseRole, changeRole, openChapters, go, skip }
}
