import { useMemo } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import type { Base } from '@/types/base'
import type { GameMode } from '@/stores/workspace'

interface BaseMarkersProps {
  bases: Base[]
  mode: GameMode
  selectedBaseId: string | null
  selectedStageId: string | null
  onBaseClick?: (baseId: string) => void
}

function getBaseStyle(
  base: Base,
  mode: GameMode,
  selectedBaseId: string | null,
  selectedStageId: string | null,
) {
  if (mode === 'command') {
    return {
      fill: '#a1a1aa',
      stroke: '#71717a',
      opacity: 0.4,
      size: 10,
      dashArray: undefined as string | undefined,
      ringColor: undefined as string | undefined,
    }
  }

  // Build mode
  const isSelected = base.id === selectedBaseId
  const dimmedByStage = selectedStageId != null && base.stageId !== selectedStageId

  let fill: string
  let stroke: string
  let dashArray: string | undefined

  if (base.hidden) {
    fill = '#52525b'
    stroke = '#71717a'
  } else if (!base.nfcLinked) {
    fill = '#ef4444'
    stroke = '#ef4444'
    dashArray = '4 2'
  } else {
    fill = '#22c55e'
    stroke = '#16a34a'
  }

  const size = isSelected ? 18 : 14
  const opacity = dimmedByStage ? 0.3 : base.hidden ? 0.5 : 1
  const ringColor = isSelected ? '#ffffff' : undefined

  return { fill, stroke, opacity, size, dashArray, ringColor }
}

export function BaseMarkers({
  bases,
  mode,
  selectedBaseId,
  selectedStageId,
  onBaseClick,
}: BaseMarkersProps) {
  const validBases = useMemo(
    () => bases.filter((b) => b.lat != null && b.lng != null),
    [bases],
  )

  return (
    <>
      {validBases.map((base) => {
        const style = getBaseStyle(base, mode, selectedBaseId, selectedStageId)

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
                {style.ringColor && (
                  <circle
                    cx={(style.size + 8) / 2}
                    cy={(style.size + 8) / 2}
                    r={(style.size + 8) / 2 - 1}
                    fill="none"
                    stroke={style.ringColor}
                    strokeWidth={2}
                    strokeOpacity={0.8}
                  />
                )}
                {/* Base circle */}
                <circle
                  cx={(style.size + 8) / 2}
                  cy={(style.size + 8) / 2}
                  r={style.size / 2}
                  fill={style.fill}
                  stroke={style.stroke}
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
