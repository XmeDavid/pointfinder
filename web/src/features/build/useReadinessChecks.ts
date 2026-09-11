import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { distanceM } from '@pointfinder/game-core'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useGame } from '@/hooks/queries/useGames'
import { useTeams } from '@/hooks/queries/useTeams'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useVariableCompleteness } from '@/hooks/queries/useVariables'
import {
  isLocationCheckInAllowed,
  isValidCheckInRadiusM,
  resolveCheckInMethod,
  resolveCheckInRadiusM,
} from '@/types/checkIn'

export interface ReadinessCheck {
  label: string
  passed: boolean
  target?: "bases" | "challenges" | "teams" | "nfc"
}

export interface ReadinessSummary {
  checks: ReadinessCheck[]
  /** True when any base uses a method the legacy Swift/Compose apps cannot play. */
  legacyNote: boolean
  /** Every check passes — the go-live gate. */
  allPassed: boolean
}

export function useReadinessChecks(gameId: string): ReadinessSummary {
  const { t } = useTranslation()
  const { data: game } = useGame(gameId)
  const { data: bases } = useBases(gameId)
  const { data: challenges } = useChallenges(gameId)
  const { data: teams } = useTeams(gameId)
  const { data: assignments } = useAssignments(gameId)
  const { data: completeness } = useVariableCompleteness(gameId)

  const defaultRadius = game?.defaultCheckInRadiusM
  const locationAllowed = isLocationCheckInAllowed(game)

  return useMemo(() => {
    const baseList = bases ?? []
    const challengeList = challenges ?? []
    const teamList = teams ?? []
    const assignmentList = assignments ?? []

    const baseIds = new Set(baseList.map((b) => b.id))
    const challengeIds = new Set(challengeList.map((c) => c.id))

    // Every NFC base must carry a written tag, hidden ones included, exactly as
    // the server's go-live check counts them. QR bases always pass — the code is
    // generated, not provisioned.
    const nfcBases = baseList.filter((b) => resolveCheckInMethod(b.checkInMethod) === 'NFC')
    const nfcLinkedCount = nfcBases.filter((b) => b.nfcLinked).length

    const locationBases = baseList.filter((b) => resolveCheckInMethod(b.checkInMethod) === 'LOCATION')
    const locatedCount = locationBases.filter((b) => b.lat !== 0 || b.lng !== 0).length
    const radiusOkCount = locationBases.filter((b) =>
      isValidCheckInRadiusM(resolveCheckInRadiusM(b.checkInRadiusM, defaultRadius)),
    ).length

    // Two rings overlap when the bases are closer than the sum of their radii;
    // a player standing in the overlap could unlock either base.
    let overlapping = false
    for (let i = 0; i < locationBases.length && !overlapping; i++) {
      for (let j = i + 1; j < locationBases.length; j++) {
        const a = locationBases[i]
        const b = locationBases[j]
        const ra = resolveCheckInRadiusM(a.checkInRadiusM, defaultRadius)
        const rb = resolveCheckInRadiusM(b.checkInRadiusM, defaultRadius)
        if (distanceM(a, b) < ra + rb) {
          overlapping = true
          break
        }
      }
    }

    // A location-bound challenge lives at one base: pinned to it, or named by an
    // assignment row. The server rejects go-live otherwise, and the go-live
    // auto-assign never picks location-bound challenges up, so this one cannot
    // be left for later.
    const fixedChallengeIds = new Set(baseList.map((b) => b.fixedChallengeId).filter(Boolean))
    const assignedChallengeIds = new Set(assignmentList.map((a) => a.challengeId))
    const locationBoundChallenges = challengeList.filter((c) => c.locationBound)
    const locationBoundAssignedCount = locationBoundChallenges.filter(
      (c) => fixedChallengeIds.has(c.id) || assignedChallengeIds.has(c.id),
    ).length

    const checks: ReadinessCheck[] = [
      { target: 'bases', label: t('readiness.atLeastOneBase'), passed: baseList.length > 0 },
      { target: 'challenges', label: t('readiness.atLeastOneChallenge'), passed: challengeList.length > 0 },
      { target: 'teams', label: t('readiness.atLeastOneTeam'), passed: teamList.length > 0 },
      {
        target: 'nfc', label: t('readiness.nfcLinked', { linked: nfcLinkedCount, total: nfcBases.length }),
        passed: nfcLinkedCount === nfcBases.length,
      },
      {
        target: 'challenges', label: t('readiness.assignmentsValid'),
        passed: assignmentList.every(
          (a) => baseIds.has(a.baseId) && challengeIds.has(a.challengeId),
        ),
      },
      {
        target: 'challenges', label: t('readiness.locationBoundAssigned', {
          ok: locationBoundAssignedCount,
          total: locationBoundChallenges.length,
        }),
        passed: locationBoundAssignedCount === locationBoundChallenges.length,
      },
      {
        label: t('readiness.locationCoords', { ok: locatedCount, total: locationBases.length }),
        passed: locatedCount === locationBases.length,
      },
      {
        label: t('readiness.locationRadius', { ok: radiusOkCount, total: locationBases.length }),
        passed: radiusOkCount === locationBases.length,
      },
      { label: t('readiness.locationOverlap'), passed: !overlapping },
      // Location check-in is a paid feature. The server refuses go-live for a
      // location base on a plan without it, so the checklist says so first.
      ...(locationBases.length > 0 && !locationAllowed
        ? [{ label: t('readiness.locationPlan'), passed: false }]
        : []),
      { target: 'teams', label: t('readiness.variablesComplete'), passed: completeness?.complete ?? true },
    ]

    return {
      checks,
      legacyNote: baseList.some((b) => resolveCheckInMethod(b.checkInMethod) !== 'NFC'),
      allPassed: checks.every((check) => check.passed),
    }
  }, [bases, challenges, teams, assignments, completeness, defaultRadius, locationAllowed, t])
}
