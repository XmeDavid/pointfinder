import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/ui/useMediaQuery'
import { cn } from '@/lib/utils'
import { placeBubble, readSafeInsets, type Placement } from './placement'

const BUBBLE_WIDTH = 320
const FALLBACK_HEIGHT = 200

export interface CoachBubbleProps {
  /** Already-translated title. */
  title: string
  /** Already-translated body. */
  body: string
  /** Already-translated quieter secondary paragraph. */
  aside?: string
  step: number
  total: number
  /** Present for `ack` steps; renders the primary Next / Got it button. */
  onAck?: () => void
  /** Present when the step offers an "I'll do it later" path. */
  onLater?: () => void
  /** Close control and Escape both call this; the host pauses. */
  onClose: () => void
  /** Null centres the bubble on desktop and renders no spotlight. */
  anchorRect: DOMRect | null
  isLast?: boolean
  /** Render in flow instead of portalling — for stories and the visual harness. */
  inline?: boolean
}

export function CoachBubble({
  title,
  body,
  aside,
  step,
  total,
  onAck,
  onLater,
  onClose,
  anchorRect,
  isLast = false,
  inline = false,
}: CoachBubbleProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0, side: 'below' })

  useLayoutEffect(() => {
    if (inline || !isDesktop || !anchorRect || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    setPlacement(
      placeBubble(
        { top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height },
        { width: box.width || BUBBLE_WIDTH, height: box.height || FALLBACK_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight },
        readSafeInsets(),
      ),
    )
  }, [anchorRect, body, inline, isDesktop, title])

  // Focus moves to the bubble when a step starts only if nothing else holds
  // it (or the bubble itself does): a control the operator just pressed and a
  // field they are typing in keep focus, and the live region below announces
  // the new step instead.
  useEffect(() => {
    const active = document.activeElement
    if (active && active !== document.body && !ref.current?.contains(active)) return
    ref.current?.focus()
  }, [title, step])

  // Escape pauses only while focus is inside the bubble, so it never fights the
  // drawer and dialogs that also close on Escape.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!ref.current?.contains(document.activeElement)) return
      onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const sheet = !inline && !isDesktop
  // On a phone the workspace keeps its controls at the bottom, so a sheet that
  // would cover the anchor — or the whole map — moves to the top instead.
  const sheetOnTop =
    sheet &&
    !!anchorRect &&
    typeof window !== 'undefined' &&
    (anchorRect.top + anchorRect.height / 2 > window.innerHeight / 2 || anchorRect.height > window.innerHeight / 2)

  const content = (
    <motion.div
      ref={ref}
      data-testid="tour-bubble"
      data-variant={inline ? 'inline' : isDesktop ? 'floating' : 'sheet'}
      data-side={sheet ? (sheetOnTop ? 'top' : 'bottom') : undefined}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        'outline-none',
        inline && 'relative w-full max-w-sm',
        !inline && 'fixed z-[70]',
        !inline && isDesktop && 'w-80',
        !inline && isDesktop && !anchorRect && 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        sheet && 'left-0 right-0',
      )}
      style={
        inline
          ? undefined
          : isDesktop
            ? anchorRect
              ? { left: placement.left, top: placement.top }
              : undefined
            : sheetOnTop
              ? { top: 'var(--safe-top)' }
              : { bottom: 'calc(var(--safe-bottom) + 56px)' }
      }
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <OverlayPanel
        padding="md"
        shape={sheet && !sheetOnTop ? 'sheet' : 'default'}
        className="max-h-[45dvh] overflow-y-auto md:max-h-[70dvh]"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1" aria-live="polite" data-testid="tour-bubble-live">
            <p className="text-xs text-muted-foreground">{t('tutorials.common.stepOf', { n: step, total })}</p>
            <h2 id={titleId} data-testid="tour-bubble-title" className="text-sm font-semibold text-foreground">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="tour-close"
            aria-label={t('tutorials.common.close')}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p data-testid="tour-bubble-body" className="mt-2 text-sm text-muted-foreground">
          {body}
        </p>
        {aside && (
          <p data-testid="tour-bubble-aside" className="mt-2 text-xs text-muted-foreground">
            {aside}
          </p>
        )}

        {(onLater || onAck) && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {onLater && (
              <Button variant="outline" size="sm" onClick={onLater} data-testid="tour-later" className="h-auto min-h-9 whitespace-normal">
                {t('tutorials.common.later')}
              </Button>
            )}
            {onAck && (
              <Button size="sm" onClick={onAck} data-testid="tour-next" className="h-auto min-h-9 whitespace-normal">
                {isLast ? t('tutorials.common.gotIt') : t('tutorials.common.next')}
              </Button>
            )}
          </div>
        )}
      </OverlayPanel>
    </motion.div>
  )

  if (inline || typeof document === 'undefined') return content
  return createPortal(content, document.body)
}
