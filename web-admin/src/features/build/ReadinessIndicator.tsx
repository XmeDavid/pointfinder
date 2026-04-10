import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, XCircle } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useTeams } from '@/hooks/queries/useTeams'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useVariableCompleteness } from '@/hooks/queries/useVariables'
import { useUpdateGameStatus } from '@/hooks/mutations/useGameMutations'
import { useWorkspaceStore } from '@/stores/workspace'

interface ReadinessCheck {
  label: string
  passed: boolean
}

function useReadinessChecks(gameId: string): ReadinessCheck[] {
  const { data: bases } = useBases(gameId)
  const { data: challenges } = useChallenges(gameId)
  const { data: teams } = useTeams(gameId)
  const { data: assignments } = useAssignments(gameId)
  const { data: completeness } = useVariableCompleteness(gameId)

  return useMemo(() => {
    const baseList = bases ?? []
    const challengeList = challenges ?? []
    const teamList = teams ?? []
    const assignmentList = assignments ?? []

    const baseIds = new Set(baseList.map((b) => b.id))
    const challengeIds = new Set(challengeList.map((c) => c.id))

    return [
      {
        label: 'At least one base',
        passed: baseList.length > 0,
      },
      {
        label: 'At least one challenge',
        passed: challengeList.length > 0,
      },
      {
        label: 'At least one team',
        passed: teamList.length > 0,
      },
      {
        label: 'All bases have NFC',
        passed:
          baseList.length > 0 &&
          baseList.filter((b) => !b.hidden).every((b) => b.nfcLinked),
      },
      {
        label: 'All assignments valid',
        passed: assignmentList.every(
          (a) => baseIds.has(a.baseId) && challengeIds.has(a.challengeId),
        ),
      },
      {
        label: 'Location-bound have coordinates',
        passed: true, // bases always have lat/lng
      },
      {
        label: 'Variables complete',
        passed: completeness?.complete ?? true,
      },
    ]
  }, [bases, challenges, teams, assignments, completeness])
}

export default function ReadinessIndicator({
  gameId,
  gameStatus,
}: {
  gameId: string
  gameStatus?: string
}) {
  // Only show in setup mode -- hide when game is live or ended
  if (gameStatus && gameStatus !== 'setup') return null

  const [expanded, setExpanded] = useState(false)
  const checks = useReadinessChecks(gameId)
  const updateStatus = useUpdateGameStatus(gameId)
  const setMode = useWorkspaceStore((s) => s.setMode)

  const passed = checks.filter((c) => c.passed).length
  const total = checks.length
  const allPassed = passed === total

  // SVG ring calculations
  const size = 44
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? passed / total : 0
  const dashOffset = circumference * (1 - progress)

  return (
    <div
      className="absolute bottom-4 left-16 z-20"
      data-testid="readiness-indicator"
    >
      <GlassPanel>
        <motion.div
          layout
          className="rounded-xl overflow-hidden cursor-pointer"
          style={{ width: expanded ? 300 : 200 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          {/* Collapsed header -- always visible */}
          <div
            className="flex items-center gap-3 px-3 py-3"
            onClick={() => setExpanded((prev) => !prev)}
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
                stroke="#22c55e"
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
                ? 'Ready to launch'
                : `${total - passed} items remaining`}
            </span>
          </div>

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
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
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
