import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Info, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useUpdateGameStatus } from '@/hooks/mutations/useGameMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { useReadinessChecks } from './useReadinessChecks'

export default function ReadinessIndicator({
  gameId,
  gameStatus,
}: {
  gameId: string
  gameStatus?: string
}) {
  const { t } = useTranslation()
  const { checks, legacyNote, allPassed } = useReadinessChecks(gameId)
  const expanded = useWorkspaceStore((s) => s.readinessExpanded)
  const setReadinessExpanded = useWorkspaceStore((s) => s.setReadinessExpanded)
  const updateStatus = useUpdateGameStatus(gameId)
  const setMode = useWorkspaceStore((s) => s.setMode)

  // Only show in setup mode -- hide when game is live or ended
  if (gameStatus && gameStatus !== 'setup') return null

  const passed = checks.filter((c) => c.passed).length
  const total = checks.length

  // SVG ring calculations
  const size = 44
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? passed / total : 0
  const dashOffset = circumference * (1 - progress)

  return (
    <div
      className="w-full min-w-0 md:w-auto md:max-w-sm"
      data-testid="readiness-indicator"
    >
      <GlassPanel>
        <motion.div
          layout
          className="w-full rounded-xl overflow-hidden md:w-72"
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          {/* Collapsed header -- always visible */}
          <button
            type="button"
            aria-expanded={expanded}
            className="flex w-full items-center gap-3 px-3 py-3 text-left"
            onClick={() => setReadinessExpanded(!expanded)}
            data-testid="readiness-toggle"
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="shrink-0"
              data-testid="readiness-ring"
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-muted"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--pf-color-status-completed)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
              <text
                x={size / 2}
                y={size / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-sm font-semibold fill-foreground"
                data-testid="readiness-count"
              >
                {passed}/{total}
              </text>
            </svg>
            <span className="text-sm text-muted-foreground leading-tight">
              {allPassed
                ? t('readiness.ready')
                : t('readiness.remaining', { count: total - passed })}
            </span>
          </button>

          {/* Expanded checklist */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="checklist"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div
                  className="px-3 pb-3 space-y-1.5"
                  data-testid="readiness-checklist"
                >
                  {checks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center gap-2"
                      data-testid={`check-${check.passed ? 'pass' : 'fail'}`}
                    >
                      {check.passed ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <span
                        className={`text-xs ${
                          check.passed
                            ? 'text-muted-foreground'
                            : 'text-destructive font-medium'
                        }`}
                      >
                        {check.label}
                      </span>
                    </div>
                  ))}

                  {legacyNote && (
                    <div
                      className="flex items-start gap-2 pt-1"
                      data-testid="readiness-legacy-note"
                    >
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">
                        {t('readiness.legacyAppsNote')}
                      </span>
                    </div>
                  )}

                  {allPassed && (
                    <button
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold w-full mt-2 cursor-pointer hover:bg-primary/90 transition-colors"
                      data-testid="go-live-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        updateStatus.mutate({ status: 'live' })
                        setMode('command')
                      }}
                    >
                      Go Live
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </GlassPanel>
    </div>
  )
}
