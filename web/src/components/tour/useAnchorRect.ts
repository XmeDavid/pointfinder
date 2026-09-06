import { useCallback, useRef, useSyncExternalStore } from 'react'
import { anchorElement, isAnchorVisible } from '@/features/tutorials/dom'

export interface AnchorTracking {
  element: HTMLElement | null
  rect: DOMRect | null
  visible: boolean
}

/** How long to keep re-measuring after a trigger, so spring-animated anchors settle into place. */
export const SETTLE_MS = 600

const EMPTY: AnchorTracking = { element: null, rect: null, visible: false }

function sameRect(a: DOMRect | null, b: DOMRect): boolean {
  return (
    a !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
  )
}

/**
 * Tracks the element carrying `testId`: its live rect, whether it is on screen,
 * and the element itself so focus can return to it. The DOM is the external
 * store: it is re-read on resize, capture-phase scroll, the element's own
 * ResizeObserver, any DOM mutation (so an anchor that appears after a drawer
 * opens is found without a click), and whenever `tick` changes. Every trigger
 * also starts a short animation-frame loop, because a drawer that springs open
 * moves its children for a few hundred milliseconds without firing any of the
 * above.
 */
export function useAnchorRect(testId: string | null, tick = 0): AnchorTracking {
  const cache = useRef<AnchorTracking>(EMPTY)

  const getSnapshot = useCallback((): AnchorTracking => {
    const element = testId ? anchorElement(testId) : null
    const prev = cache.current
    if (!element) {
      if (prev.element !== null) cache.current = EMPTY
      return cache.current
    }
    const rect = element.getBoundingClientRect()
    const visible = isAnchorVisible(element)
    if (prev.element === element && prev.visible === visible && sameRect(prev.rect, rect)) return prev
    cache.current = { element, rect, visible }
    return cache.current
  }, [testId])

  const subscribe = useCallback(
    (onChange: () => void) => {
      let frame = 0
      let settleUntil = 0
      const hasFrames = typeof requestAnimationFrame !== 'undefined'

      // Notify now and keep notifying every frame until the settle window closes.
      const settle = () => {
        onChange()
        settleUntil = Date.now() + SETTLE_MS
        if (frame || !hasFrames) return
        const loop = () => {
          onChange()
          if (Date.now() < settleUntil) {
            frame = requestAnimationFrame(loop)
          } else {
            frame = 0
          }
        }
        frame = requestAnimationFrame(loop)
      }

      const element = testId ? anchorElement(testId) : null
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(settle)
      if (observer && element) observer.observe(element)

      let mutationFrame = 0
      const onMutation = () => {
        if (mutationFrame || !hasFrames) {
          if (!hasFrames) settle()
          return
        }
        mutationFrame = requestAnimationFrame(() => {
          mutationFrame = 0
          settle()
        })
      }
      const mutations =
        typeof MutationObserver === 'undefined' || typeof document === 'undefined'
          ? null
          : new MutationObserver(onMutation)
      mutations?.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-testid', 'hidden'],
      })

      window.addEventListener('resize', settle)
      window.addEventListener('scroll', settle, true)
      settle()

      return () => {
        observer?.disconnect()
        mutations?.disconnect()
        if (mutationFrame) cancelAnimationFrame(mutationFrame)
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        window.removeEventListener('resize', settle)
        window.removeEventListener('scroll', settle, true)
      }
    },
    // `tick` is a deliberate re-subscription trigger: a new subscription re-measures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [testId, tick],
  )

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
}
