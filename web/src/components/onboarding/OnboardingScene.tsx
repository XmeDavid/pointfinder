import { useEffect, useRef } from 'react'
import { createSceneRuntime, type SceneRuntime } from './sceneRuntime'

export interface OnboardingSceneProps {
  branch?: 'choice' | 'participant' | 'organizer'
  targetFrame: number
  reducedMotion: boolean
  className?: string
  onReady?: () => void
  onError?: () => void
}

/** Blender geometry, real-time animation, and sensors; all copy stays in React. */
export function OnboardingScene({ branch = 'participant', targetFrame, reducedMotion, className, onReady, onError }: OnboardingSceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const runtime = useRef<SceneRuntime | null>(null)
  const latest = useRef({ targetFrame, reducedMotion, onReady, onError })

  useEffect(() => {
    latest.current = { targetFrame, reducedMotion, onReady, onError }
    runtime.current?.setTarget(targetFrame, reducedMotion)
  }, [targetFrame, reducedMotion, onReady, onError])

  useEffect(() => {
    if (!host.current) return
    try {
      const instance = createSceneRuntime(host.current, {
        branch,
        targetFrame: latest.current.targetFrame,
        reducedMotion: latest.current.reducedMotion,
        onReady: () => latest.current.onReady?.(),
        onError: () => latest.current.onError?.(),
      })
      runtime.current = instance
      return () => { instance.dispose(); runtime.current = null }
    } catch {
      latest.current.onError?.()
    }
  }, [branch])

  return <div ref={host} className={className} aria-hidden="true" data-testid="onboarding-scene" />
}
