import { useMemo } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import { cn } from '@/lib/utils'
import {
  baseStatusMarkerTone,
  markerToneClass,
  type MarkerTone,
} from './markerStyles'
import type { Base } from '@/types/base'
import type { BaseStatus } from '@/types'
import type { GameMode } from '@/stores/workspace'

interface BaseMarkersProps {
  bases: Base[]
  mode: GameMode
  selectedBaseId: string | null
  selectedStageId: string | null
  onBaseClick?: (baseId: string) => void
  /** When set, bases are colored by this team's progress */
  impersonation?: Map<string, BaseStatus>
}

function getBaseStyle(
  base: Base,
  mode: GameMode,
  selectedBaseId: string | null,
  selectedStageId: string | null,
  impersonation?: Map<string, BaseStatus>,
) {
  if (mode === 'command') {
    const isInspected = base.id === selectedBaseId
    const status = impersonation?.get(base.id)
    const tone: MarkerTone = status
      ? baseStatusMarkerTone[status]
      : base.nfcLinked
        ? 'success'
        : 'destructive'
    return {
      tone,
      opacity: impersonation ? (status === 'not_visited' ? 0.4 : 0.9) : 0.8,
      size: isInspected ? 18 : 12,
      dashArray: undefined as string | undefined,
      selected: isInspected,
    }
  }

  // Build mode
  const isSelected = base.id === selectedBaseId
  const dimmedByStage = selectedStageId != null && base.stageId !== selectedStageId

  let tone: MarkerTone
  let dashArray: string | undefined

  if (base.hidden) {
    tone = 'hidden'
  } else if (!base.nfcLinked) {
    tone = 'destructive'
    dashArray = '4 2'
  } else {
    tone = 'success'
  }

  const size = isSelected ? 18 : 14
  const opacity = dimmedByStage ? 0.3 : base.hidden ? 0.5 : 1

  return { tone, opacity, size, dashArray, selected: isSelected }
}

export function BaseMarkers({
  bases,
  mode,
  selectedBaseId,
  selectedStageId,
  onBaseClick,
  impersonation,
}: BaseMarkersProps) {
  const validBases = useMemo(
    () => bases.filter((b) => b.lat != null && b.lng != null),
    [bases],
  )

  return (
    <>
      {validBases.map((base) => {
        const style = getBaseStyle(base, mode, selectedBaseId, selectedStageId, impersonation)
        const markerClass = markerToneClass[style.tone]

        return (
          <Marker
            key={base.id}
            longitude={base.lng}
            latitude={base.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              onBaseClick?.(base.id)
            }}
          >
            <div
              data-testid={`base-marker-${base.id}`}
              data-mode={mode}
              data-selected={base.id === selectedBaseId || undefined}
              data-hidden={base.hidden || undefined}
              data-nfc={base.nfcLinked ? 'linked' : 'missing'}
              data-dimmed={
                (selectedStageId != null && base.stageId !== selectedStageId) || undefined
              }
              style={{ opacity: style.opacity, cursor: 'pointer' }}
              title={mode === 'build' ? base.name : undefined}
            >
              <svg
                width={style.size + 8}
                height={style.size + 8}
                viewBox={`0 0 ${style.size + 8} ${style.size + 8}`}
                style={{ display: 'block' }}
              >
                {/* Selection ring */}
                {style.selected && (
                  <circle
                    cx={(style.size + 8) / 2}
                    cy={(style.size + 8) / 2}
                    r={(style.size + 8) / 2 - 1}
                    fill="none"
                    className="stroke-background"
                    strokeWidth={2}
                    strokeOpacity={0.8}
                  />
                )}
                {/* Base circle */}
                <circle
                  cx={(style.size + 8) / 2}
                  cy={(style.size + 8) / 2}
                  r={style.size / 2}
                  className={cn(markerClass.fill, markerClass.stroke)}
                  strokeWidth={2}
                  strokeDasharray={style.dashArray}
                />
              </svg>
            </div>
          </Marker>
        )
      })}
    </>
  )
}
