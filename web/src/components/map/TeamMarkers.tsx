import { useMemo, useEffect, useLayoutEffect, useState, useRef } from 'react'
import { Source, Layer, useMap } from 'react-map-gl/maplibre'
import type { LayerProps } from 'react-map-gl/maplibre'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import type { TeamLocation, Team } from '@/types'
import { lightColorValues } from '@/generated/colorValues'

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const STALE_TICK_MS = 30_000 // re-evaluate staleness every 30 s

/**
 * Cluster colors matching iOS/Android (MapLibreMapView.swift lines 241-246):
 *   small (1-4)  → statusCheckedIn  (blue)
 *   medium (5-9) → actionPrimaryStrong (green)
 *   large (10+)  → statusPending    (amber)
 */
const CLUSTER_COLOR_SMALL = lightColorValues['status.checkedIn']
const CLUSTER_COLOR_MEDIUM = lightColorValues['action.primaryStrong']
const CLUSTER_COLOR_LARGE = lightColorValues['status.pending']
const CLUSTER_STROKE = '#ffffff'
const STALE_STROKE = '#9ca3af' // dataColors.statusNotVisited

export const TEAM_LOCATIONS_SOURCE_ID = 'team-locations'
export const CLUSTER_CIRCLE_LAYER_ID = 'team-cluster-circle'
export const CLUSTER_COUNT_LAYER_ID = 'team-cluster-count'
export const INDIVIDUAL_POINT_LAYER_ID = 'team-individual-point'

const clusterCircleLayer: LayerProps = {
  id: CLUSTER_CIRCLE_LAYER_ID,
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-radius': ['step', ['get', 'point_count'], 14, 5, 20, 10, 26],
    'circle-color': [
      'step',
      ['get', 'point_count'],
      CLUSTER_COLOR_SMALL,
      5,
      CLUSTER_COLOR_MEDIUM,
      10,
      CLUSTER_COLOR_LARGE,
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': CLUSTER_STROKE,
  },
}

const clusterCountLayer: LayerProps = {
  id: CLUSTER_COUNT_LAYER_ID,
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-size': ['step', ['get', 'point_count'], 10, 5, 11, 10, 13],
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#ffffff',
  },
}

const individualPointLayer: LayerProps = {
  id: INDIVIDUAL_POINT_LAYER_ID,
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': 7,
    'circle-color': ['get', 'color'],
    'circle-opacity': ['case', ['==', ['get', 'stale'], true], 0.4, 0.9],
    'circle-stroke-width': 2,
    'circle-stroke-color': [
      'case',
      ['==', ['get', 'stale'], true],
      STALE_STROKE,
      CLUSTER_STROKE,
    ],
  },
}

interface TeamMarkersProps {
  locations: TeamLocation[]
  teams: Team[]
  onTeamClick?: (teamId: string) => void
  /** Disable cluster-tap-to-zoom and point click (e.g. for broadcast). */
  interactive?: boolean
}

export function TeamMarkers({
  locations,
  teams,
  onTeamClick,
  interactive = true,
}: TeamMarkersProps) {
  const { current: map } = useMap()
  const callbackRef = useRef(onTeamClick)
  useLayoutEffect(() => {
    callbackRef.current = onTeamClick
  })

  const teamMap = useMemo(() => {
    const m = new Map<string, Team>()
    teams.forEach((t) => m.set(t.id, t))
    return m
  }, [teams])

  // Tick-based timestamp so staleness updates every 30 s instead of every render
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), STALE_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = []
    for (const loc of locations) {
      const team = teamMap.get(loc.teamId)
      if (!team) continue
      const updatedAt = new Date(loc.updatedAt).getTime()
      const isStale = now - updatedAt > STALE_THRESHOLD_MS
      features.push({
        type: 'Feature',
        properties: {
          teamId: loc.teamId,
          playerId: loc.playerId,
          displayName: loc.displayName,
          teamName: team.name,
          color: team.color || CLUSTER_COLOR_SMALL,
          stale: isStale,
        },
        geometry: {
          type: 'Point',
          coordinates: [loc.lng, loc.lat],
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [locations, teamMap, now])

  // Register click handlers on the underlying MapLibre map for cluster expansion
  // and individual-point taps.
  useEffect(() => {
    if (!interactive || !map) return

    const mapInstance = map.getMap()

    const onClusterClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return

      const clusterId = feature.properties?.cluster_id as number
      const source = mapInstance.getSource(
        TEAM_LOCATIONS_SOURCE_ID,
      ) as GeoJSONSource | undefined
      if (!source) return

      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const coords = (feature.geometry as GeoJSON.Point).coordinates
        mapInstance.flyTo({
          center: [coords[0], coords[1]] as [number, number],
          zoom,
          duration: 500,
        })
      })
    }

    const onPointClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      const teamId = feature.properties?.teamId as string | undefined
      if (teamId) callbackRef.current?.(teamId)
    }

    const setCursor = () => {
      mapInstance.getCanvas().style.cursor = 'pointer'
    }
    const resetCursor = () => {
      mapInstance.getCanvas().style.cursor = ''
    }

    mapInstance.on('click', CLUSTER_CIRCLE_LAYER_ID, onClusterClick)
    mapInstance.on('click', INDIVIDUAL_POINT_LAYER_ID, onPointClick)
    mapInstance.on('mouseenter', CLUSTER_CIRCLE_LAYER_ID, setCursor)
    mapInstance.on('mouseleave', CLUSTER_CIRCLE_LAYER_ID, resetCursor)
    mapInstance.on('mouseenter', INDIVIDUAL_POINT_LAYER_ID, setCursor)
    mapInstance.on('mouseleave', INDIVIDUAL_POINT_LAYER_ID, resetCursor)

    return () => {
      mapInstance.off('click', CLUSTER_CIRCLE_LAYER_ID, onClusterClick)
      mapInstance.off('click', INDIVIDUAL_POINT_LAYER_ID, onPointClick)
      mapInstance.off('mouseenter', CLUSTER_CIRCLE_LAYER_ID, setCursor)
      mapInstance.off('mouseleave', CLUSTER_CIRCLE_LAYER_ID, resetCursor)
      mapInstance.off('mouseenter', INDIVIDUAL_POINT_LAYER_ID, setCursor)
      mapInstance.off('mouseleave', INDIVIDUAL_POINT_LAYER_ID, resetCursor)
    }
  }, [interactive, map])

  return (
    <Source
      id={TEAM_LOCATIONS_SOURCE_ID}
      type="geojson"
      data={geojson}
      cluster={true}
      clusterRadius={50}
      clusterMaxZoom={14}
    >
      <Layer {...clusterCircleLayer} />
      <Layer {...clusterCountLayer} />
      <Layer {...individualPointLayer} />
    </Source>
  )
}
