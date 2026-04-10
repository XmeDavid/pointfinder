import { useMemo } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import type { TeamLocation, Team } from '@/types'

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

interface TeamMarkersProps {
  locations: TeamLocation[]
  teams: Team[]
  onTeamClick?: (teamId: string) => void
}

export function TeamMarkers({ locations, teams, onTeamClick }: TeamMarkersProps) {
  const teamMap = useMemo(() => {
    const map = new Map<string, Team>()
    teams.forEach((t) => map.set(t.id, t))
    return map
  }, [teams])

  const now = Date.now()

  return (
    <>
      {locations.map((loc) => {
        const team = teamMap.get(loc.teamId)
        if (!team) return null

        const updatedAt = new Date(loc.updatedAt).getTime()
        const isStale = now - updatedAt > STALE_THRESHOLD_MS
        const color = team.color || '#3b82f6'
        const size = 20

        return (
          <Marker
            key={`${loc.teamId}-${loc.playerId}`}
            longitude={loc.lng}
            latitude={loc.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              onTeamClick?.(loc.teamId)
            }}
          >
            <div
              data-testid={`team-marker-${loc.teamId}`}
              data-stale={isStale || undefined}
              style={{ cursor: 'pointer' }}
              title={`${team.name}${loc.displayName ? ` - ${loc.displayName}` : ''}`}
            >
              <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ display: 'block' }}
              >
                {/* Glow for active teams */}
                {!isStale && (
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={size / 2 - 1}
                    fill={color}
                    fillOpacity={0.25}
                  />
                )}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={size / 2 - 3}
                  fill={color}
                  fillOpacity={isStale ? 0.3 : 0.9}
                  stroke={isStale ? '#9ca3af' : color}
                  strokeWidth={isStale ? 1 : 2}
                />
              </svg>
            </div>
          </Marker>
        )
      })}
    </>
  )
}
