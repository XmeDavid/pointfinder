import { useMemo } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import { cn } from '@/lib/utils'
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

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <>
      {locations.map((loc) => {
        const team = teamMap.get(loc.teamId)
        if (!team) return null

        const updatedAt = new Date(loc.updatedAt).getTime()
        const isStale = now - updatedAt > STALE_THRESHOLD_MS
        const color = team.color || 'var(--color-info)'
        const size = 14

        // Triangle pointing up: smaller than base circles (which are 12-18px)
        const cx = size / 2
        const top = 1
        const bottom = size - 1
        const left = 1
        const right = size - 1
        const triangle = `${cx},${top} ${right},${bottom} ${left},${bottom}`

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
                  <polygon
                    points={triangle}
                    fill={color}
                    fillOpacity={0.25}
                  />
                )}
                <polygon
                  points={triangle}
                  fill={color}
                  fillOpacity={isStale ? 0.3 : 0.9}
                  stroke={isStale ? 'var(--color-muted-foreground)' : color}
                  className={cn(isStale && 'stroke-muted-foreground')}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Marker>
        )
      })}
    </>
  )
}
