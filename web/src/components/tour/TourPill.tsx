import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface TourPillProps {
  step: number
  total: number
  /** Runs the step's `prepare` and un-pauses. */
  onResume: () => void
  /** Render in flow instead of portalling — for stories and the visual harness. */
  inline?: boolean
}

/**
 * The collapsed tour: shown while paused, or while the current anchor is off
 * screen or not rendered. Bottom centre, clear of the mobile tab bar.
 */
export function TourPill({ step, total, onResume, inline = false }: TourPillProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  const content = (
    <motion.div
      data-testid="tour-pill"
      className={cn(
        inline ? 'relative inline-block' : 'fixed left-1/2 z-[70] -translate-x-1/2',
      )}
      style={inline ? undefined : { bottom: 'calc(var(--safe-bottom) + 56px)' }}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <OverlayPanel padding="sm" shape="pill" className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            {t('tutorials.common.pill')}
            <span
              role="progressbar"
              aria-label={t('tutorials.common.progress', { n: step, total })}
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={step}
              className="inline-block h-1 w-16 overflow-hidden rounded-full bg-muted"
            >
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((step / Math.max(total, 1)) * 100)}%` }} />
            </span>
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={onResume} data-testid="tour-pill-resume" className="h-auto min-h-8">
          {t('tutorials.common.resume')}
        </Button>
      </OverlayPanel>
    </motion.div>
  )

  if (inline || typeof document === 'undefined') return content
  return createPortal(content, document.body)
}
