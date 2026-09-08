import { useCallback, useEffect, useRef, useState } from 'react'
import { isForeground, onAppVisibility } from '@/platform/lifecycle'

/** Reading time after a chapter's hold pose is on screen before the next chapter starts. */
export const AUTOPLAY_READING_PAUSE_MS = 2500

export interface ChapterAutoplayOptions {
  /** Identity of the scene the renderer is asked to hold (branch, renderer attempt and target frame). */
  scene: string
  /** A chapter is on screen with live animation; the choice, gate, landing, previews, reduced motion and failed renderers stay manual. */
  active: boolean
  /** The user's Pause / Resume choice. */
  playing: boolean
  /** Changing this restarts a pending reading pause (the language, so new copy gets its full time). */
  restartKey: string
  onAdvance: () => void
}

/**
 * Advances a chapter once its hold pose has actually been drawn and the reader has had
 * AUTOPLAY_READING_PAUSE_MS with it. The hold is remembered by scene identity, so a report
 * for an old target is ignored, any scene change discards it, and a hold drawn on the
 * organizer gate still counts for the first chapter that shares its frame. Backgrounding
 * cancels the wait; returning starts a fresh one. Nothing here reads the DOM.
 */
export function useChapterAutoplay({ scene, active, playing, restartKey, onAdvance }: ChapterAutoplayOptions) {
  const [held, setHeld] = useState<string | null>(null)
  const [heldScene, setHeldScene] = useState(scene)
  if (heldScene !== scene) {
    setHeldScene(scene)
    if (held !== null) setHeld(null)
  }
  const [foreground, setForeground] = useState(isForeground)
  useEffect(() => onAppVisibility(setForeground), [])
  const latest = useRef({ scene, onAdvance })
  useEffect(() => { latest.current = { scene, onAdvance } }, [scene, onAdvance])

  /** The renderer drew the hold for `key`; only the scene currently requested counts. */
  const settle = useCallback((key: string) => {
    if (key === latest.current.scene) setHeld(key)
  }, [])

  const waiting = active && playing && foreground && held === scene
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => latest.current.onAdvance(), AUTOPLAY_READING_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [waiting, restartKey])

  return { settle, waiting }
}
