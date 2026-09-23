import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { AlertCircle, ChevronRight, Circle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { Button } from '@/components/ui/button'
import type { ReadinessCheck, ReadinessStatus } from './useReadinessChecks'

export interface ReadinessPanelProps {
  status: ReadinessStatus
  /** The checks that still block going live; empty means ready once `status` is `ready`. */
  blockers: ReadinessCheck[]
  /** How many checks exist in total, for the progress ring. */
  total: number
  /** A non-blocking note: some base uses a method the legacy apps cannot play. */
  legacyNote: boolean
  /** A non-blocking note: a linked challenge is a choice question the legacy apps cannot answer. */
  legacyChoiceNote?: boolean
  expanded: boolean
  onToggle: (expanded: boolean) => void
  onOpenCheck: (check: ReadinessCheck) => void
  onRetry: () => void
  onGoLive: () => void
  launching: boolean
  /** What stopped the last launch, as the operator should read it. */
  launchError?: string | null
}

const RING_SIZE = 44
const RING_STROKE = 3
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function Ring({ passed, total, reduced }: { passed: number; total: number; reduced: boolean }) {
  const progress = total > 0 ? passed / total : 0
  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="shrink-0"
      data-testid="readiness-ring"
      aria-hidden="true"
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE}
        className="text-muted"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="var(--pf-color-status-completed)"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        style={reduced ? undefined : { transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text
        x={RING_SIZE / 2}
        y={RING_SIZE / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-sm font-semibold fill-foreground"
        data-testid="readiness-count"
      >
        {passed}/{total}
      </text>
    </svg>
  )
}

/**
 * The go-live pill for a game in setup. It shows only what still blocks the
 * launch, each blocker opening the editor that fixes it; once nothing does,
 * the checklist disappears and Go live is offered directly. Loading and
 * failed checks are their own states: neither ever looks ready.
 */
export function ReadinessPanel({
  status,
  blockers,
  total,
  legacyNote,
  legacyChoiceNote = false,
  expanded,
  onToggle,
  onOpenCheck,
  onRetry,
  onGoLive,
  launching,
  launchError,
}: ReadinessPanelProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const ready = status === 'ready' && blockers.length === 0
  const passed = Math.max(0, total - blockers.length)
  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: 'easeInOut' as const }

  const note = legacyNote || legacyChoiceNote ? (
    <>
      {legacyNote && (
        <div className="flex items-start gap-2 pt-1" data-testid="readiness-legacy-note">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">{t('readiness.legacyAppsNote')}</span>
        </div>
      )}
      {legacyChoiceNote && (
        <div className="flex items-start gap-2 pt-1" data-testid="readiness-legacy-choice-note">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">{t('readiness.legacyChoiceNote')}</span>
        </div>
      )}
    </>
  ) : null

  return (
    <div className="w-full min-w-0 md:w-auto md:max-w-sm" data-testid="readiness-indicator">
      <GlassPanel>
        <motion.div
          layout={!reduced}
          className="w-full rounded-xl overflow-hidden md:w-72"
          transition={transition}
        >
          {status === 'loading' && (
            <div
              className="flex w-full items-center gap-3 px-3 py-3"
              role="status"
              aria-live="polite"
              data-testid="readiness-loading"
            >
              <Ring passed={0} total={total} reduced={reduced} />
              <span className="text-sm text-muted-foreground leading-tight">{t('readiness.checking')}</span>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2 px-3 py-3" role="alert" data-testid="readiness-error">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <span className="text-sm leading-tight">{t('readiness.unavailable')}</span>
              </div>
              <Button variant="outline" size="sm" onClick={onRetry} data-testid="readiness-retry">
                {t('readiness.retry')}
              </Button>
            </div>
          )}

          {status === 'ready' && ready && (
            <div className="space-y-2 px-3 py-3" data-testid="readiness-ready">
              {note}
              {launchError && (
                <p role="alert" className="text-sm text-destructive" data-testid="readiness-launch-error">
                  {launchError}
                </p>
              )}
              <Button
                className="w-full"
                data-testid="go-live-btn"
                loading={launching}
                disabled={launching}
                onClick={onGoLive}
              >
                {t(launching ? 'build.compose.launching' : 'build.compose.goLive')}
              </Button>
            </div>
          )}

          {status === 'ready' && !ready && (
            <>
              <button
                type="button"
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-3 py-3 text-left"
                onClick={() => onToggle(!expanded)}
                data-testid="readiness-toggle"
              >
                <Ring passed={passed} total={total} reduced={reduced} />
                <span className="text-sm text-muted-foreground leading-tight">
                  {t('readiness.remaining', { count: blockers.length })}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="checklist"
                    initial={reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduced ? undefined : { height: 0, opacity: 0 }}
                    transition={transition}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-1.5" data-testid="readiness-checklist">
                      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t('readiness.blockersTitle')}
                      </p>
                      {blockers.map((check) => (
                        <button
                          type="button"
                          onClick={() => onOpenCheck(check)}
                          key={check.label}
                          className="flex w-full min-h-11 items-center gap-2 text-left rounded-md px-1 hover:bg-muted"
                          data-testid="check-fail"
                        >
                          <Circle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          <span className="text-xs text-foreground font-medium">{check.label}</span>
                          <ChevronRight size={14} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
                        </button>
                      ))}
                      {note}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          {launchError && !ready && (
            <p role="alert" className="px-3 pb-3 text-sm text-destructive" data-testid="readiness-launch-error">{launchError}</p>
          )}
        </motion.div>
      </GlassPanel>
    </div>
  )
}
