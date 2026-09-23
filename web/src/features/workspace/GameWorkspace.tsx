import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useGame } from '@/hooks/queries/useGames'
import { useStages } from '@/hooks/queries/useStages'
import { anyRouteEnforced } from '@/features/build/baseRoutes'
import { BuildShortcuts } from '@/features/build/BuildShortcuts'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import { useTeamLocations } from '@/hooks/queries/useTeamLocations'
import { useProgress } from '@/hooks/queries/useMonitoring'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceStore } from '@/stores/workspace'
import type { MapMouseEvent, MapRef } from 'react-map-gl/maplibre'
import { GameMap } from '@/components/map/GameMap'
import { getStyleUrl } from '@/lib/tile-sources'
import { BaseMarkers } from '@/components/map/BaseMarkers'
import { MapActionMenu } from '@/components/map/MapActionMenu'
import { TeamMarkers } from '@/components/map/TeamMarkers'
import { TopBar } from './TopBar'
import { Spinner } from '@/components/feedback/Spinner'
import { ContentDrawer } from '@/features/build/ContentDrawer'
import ReadinessIndicator from '@/features/build/ReadinessIndicator'
import GameSettingsPanel from '@/features/build/GameSettingsPanel'
import { CommandOverlay } from '@/features/command/CommandOverlay'
import ReviewOverlay from '@/features/review/ReviewOverlay'
import ResultsOverlay from '@/features/results/ResultsOverlay'
import { Button } from '@/components/ui/button'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { useCreateBase } from '@/hooks/mutations/useBaseMutations'
import { recordOrganizedGame } from '@/features/dashboard/organizingRecency'
import {
  applyWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  workspacePersistenceEnabled,
} from '@/stores/workspacePersistence'

interface PendingMapAction {
  position: { x: number; y: number }
  location: { lat: number; lng: number }
}

export function GameWorkspace() {
  const { t } = useTranslation()
  const { id: gameId } = useParams<{ id: string }>()
  const accountId = useAuthStore(s => s.user?.id)

  // --- Data queries ---
  const {
    data: game,
    isLoading: gameLoading,
    isFetching: gameFetching,
    isFetchedAfterMount: gameFetched,
    error: gameError,
  } = useGame(gameId)
  const { data: stagesData } = useStages(gameId)
  const stages = useMemo(() => stagesData ?? [], [stagesData])
  const { data: bases = [], isLoading: basesLoading } = useBases(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const [placing, setPlacing] = useState(false)
  const createBase = useCreateBase(gameId ?? '')
  const creatingBase = useRef(false)
  const [pendingMapAction, setPendingMapAction] =
    useState<PendingMapAction | null>(null)

  // --- Map ref for programmatic control ---
  const mapRefInstance = useRef<MapRef | null>(null)

  // --- Workspace store ---
  const mode = useWorkspaceStore((s) => s.mode)
  const selectedBaseId = useWorkspaceStore((s) => s.selectedBaseId)
  const selectedStageId = useWorkspaceStore((s) => s.selectedStageId)
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const openDrawer = useWorkspaceStore((s) => s.openDrawer)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const inspectTeam = useWorkspaceStore((s) => s.inspectTeam)
  const inspectedBaseId = useWorkspaceStore((s) => s.inspectedBaseId)
  const inspectBase = useWorkspaceStore((s) => s.inspectBase)
  const saveMapView = useWorkspaceStore((s) => s.saveMapView)
  const preInspectMapView = useWorkspaceStore((s) => s.preInspectMapView)
  const teamLocationsVisible = useWorkspaceStore((s) => s.teamLocationsVisible)
  const impersonatedTeamId = useWorkspaceStore((s) => s.impersonatedTeamId)
  const settingsPanelOpen = useWorkspaceStore((s) => s.settingsPanelOpen)
  const reset = useWorkspaceStore((s) => s.reset)
  const closeMapActionMenu = useCallback(() => setPendingMapAction(null), [])

  // Fetch team locations only in command mode (perf optimization)
  const { data: locations = [] } = useTeamLocations(
    mode === 'command' ? gameId : undefined,
  )

  // Fetch progress for impersonation (only when impersonating in command mode)
  const { data: progress = [] } = useProgress(
    mode === 'command' && impersonatedTeamId ? gameId : undefined,
  )

  // Build base→status map for the impersonated team
  const impersonationMap = useMemo(() => {
    if (!impersonatedTeamId) return undefined
    const map = new Map<string, import('@/types').BaseStatus>()
    for (const p of progress) {
      if (p.teamId === impersonatedTeamId) {
        map.set(p.baseId, p.status)
      }
    }
    return map
  }, [impersonatedTeamId, progress])

  // Restore only after the game has passed its access check. A user action
  // while storage is loading wins over the older saved workspace.
  const authorizedGameId = game?.id
  const organizedOrgId = game?.orgId ?? null
  useEffect(() => {
    if (!accountId || !authorizedGameId || gameLoading || gameFetching || !gameFetched || gameError) return
    // Recency is a convenience; unavailable local storage cannot block editing.
    void recordOrganizedGame(accountId, authorizedGameId, organizedOrgId).catch(() => {})
  }, [accountId, authorizedGameId, organizedOrgId, gameLoading, gameFetching, gameFetched, gameError])
  useEffect(() => {
    if (!authorizedGameId || !accountId || !workspacePersistenceEnabled()) return
    let active = true
    let ready = false
    let changed = false
    const unsubscribe = useWorkspaceStore.subscribe((state) => {
      if (!active) return
      if (!ready) changed = true
      else saveWorkspaceSnapshot(accountId, authorizedGameId, state)
    })
    void loadWorkspaceSnapshot(accountId, authorizedGameId).then((snapshot) => {
      if (!active) return
      if (!changed && snapshot) applyWorkspaceSnapshot(snapshot)
      ready = true
      if (changed) saveWorkspaceSnapshot(accountId, authorizedGameId, useWorkspaceStore.getState())
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [accountId, authorizedGameId])

  // Reset workspace store on unmount
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Restore map view when base inspector closes
  useEffect(() => {
    if (!inspectedBaseId && preInspectMapView && mapRefInstance.current) {
      mapRefInstance.current.flyTo({
        center: preInspectMapView.center,
        zoom: preInspectMapView.zoom,
        duration: 600,
      })
    }
  }, [inspectedBaseId, preInspectMapView])

  // --- Loading / error states ---
  if (gameLoading || basesLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Spinner />
      </div>
    )
  }

  if (gameError || !game) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <p className="text-destructive" data-testid="workspace-error">
          {gameError?.message ?? t('build.gameNotFound')}
        </p>
      </div>
    )
  }

  // --- Handlers ---
  const handleBaseClick = (baseId: string) => {
    if (mode === 'build') {
      selectBase(baseId)
    } else if (mode === 'command') {
      const map = mapRefInstance.current
      if (map && !inspectedBaseId) {
        const center = map.getCenter()
        saveMapView([center.lng, center.lat], map.getZoom())
      }
      inspectBase(baseId)
      const base = bases.find((b) => b.id === baseId)
      if (base && map) {
        map.flyTo({
          center: [base.lng - 0.002, base.lat],
          zoom: Math.max(map.getZoom(), 15),
          duration: 600,
        })
      }
    }
  }

  async function placeBase(location: { lat: number; lng: number }) {
    if (creatingBase.current) return
    creatingBase.current = true
    try {
      const created = await createBase.mutateAsync({
        name: t('build.editor.newBase'),
        description: '',
        ...location,
      })
      setPlacing(false)
      selectBase(created.id)
    } catch {
      /* The mutation error stays visible on the map. */
    } finally {
      creatingBase.current = false
    }
  }

  const handleMapClick = (event: MapMouseEvent) => {
    if (
      mode === 'build' &&
      (game.status === 'setup' ||
        // Any enforced route (the game's or a stage's) freezes base structure once live.
        (game.status === 'live' && !anyRouteEnforced(game, stagesData)))
    ) {
      if (placing) {
        void placeBase({ lat: event.lngLat.lat, lng: event.lngLat.lng })
        return
      }
      setPendingMapAction({
        position: { x: event.point.x, y: event.point.y },
        location: { lat: event.lngLat.lat, lng: event.lngLat.lng },
      })
      return
    }
    if (mode === 'command' && inspectedBaseId) {
      inspectBase(null)
    }
  }

  const handlePlaceBase = () => {
    if (!pendingMapAction) return
    const { lat, lng } = pendingMapAction.location
    setPendingMapAction(null)
    void placeBase({ lat, lng })
  }

  const handleTeamClick = (teamId: string) => {
    if (mode === 'command') {
      inspectTeam(teamId)
    }
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      {(createBase.isPending || createBase.isError) && (
        <OverlayPanel
          className="absolute left-3 right-3 top-20 z-30 md:right-auto"
          padding="sm"
        >
          <p role={createBase.isError ? 'alert' : 'status'} className="text-sm">
            {t(
              createBase.isError
                ? 'build.editor.createBaseError'
                : 'build.compose.saving',
            )}
          </p>
        </OverlayPanel>
      )}
      <GameMap
        key={gameId}
        persistenceKey={accountId && gameId ? `operator:${accountId}:${gameId}` : undefined}
        className="workspace-map h-full w-full"
        mapStyle={getStyleUrl(game.tileSource)}
        initialCenter={
          bases.length > 0 ? [bases[0].lng, bases[0].lat] : undefined
        }
        initialZoom={bases.length > 0 ? 15 : 3}
        fitPoints={
          bases.length > 0
            ? bases.map((b) => [b.lng, b.lat] as [number, number])
            : undefined
        }
        onMapRef={(ref) => {
          mapRefInstance.current = ref
        }}
        onClick={handleMapClick}
      >
        <BaseMarkers
          bases={bases}
          mode={mode}
          selectedBaseId={mode === 'command' ? inspectedBaseId : selectedBaseId}
          selectedStageId={selectedStageId}
          onBaseClick={handleBaseClick}
          impersonation={impersonationMap}
        />
        {mode === 'command' && teamLocationsVisible && (
          <TeamMarkers
            locations={locations}
            teams={teams}
            onTeamClick={handleTeamClick}
          />
        )}
      </GameMap>

      {pendingMapAction && (
        <MapActionMenu
          position={pendingMapAction.position}
          onPlaceBase={handlePlaceBase}
          onClose={closeMapActionMenu}
        />
      )}

      {/* TopBar floating above the map */}
      <div className="workspace-controls">
        <TopBar game={game} stages={stages} />

        {/* Mode overlays */}
        <AnimatePresence>
          {mode === 'build' && (
            <motion.div
              key="build"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ContentDrawer
                gameId={gameId!}
                onCreateBase={() => setPlacing(true)}
              />
              {(!bases.length || placing) &&
                !drawerOpen &&
                !createBase.isPending && (
                  <OverlayPanel
                    padding="md"
                    className="absolute left-3 right-3 top-32 md:top-20 md:right-auto md:max-w-sm"
                  >
                    <p className="text-sm font-semibold">
                      {t('build.compose.firstBase')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('build.compose.firstBaseHint')}
                    </p>
                    {placing && (
                      <Button
                        className="mt-2"
                        variant="ghost"
                        onClick={() => setPlacing(false)}
                      >
                        {t('common.cancel')}
                      </Button>
                    )}
                  </OverlayPanel>
                )}
              <div className="absolute bottom-20 md:bottom-4 left-3 right-16 z-20 flex max-h-[calc(100%-5rem)] flex-col items-start gap-2 overflow-y-auto md:flex-row md:items-end md:justify-between">
                <ReadinessIndicator gameId={gameId!} gameStatus={game.status} />
                {!drawerOpen && (
                  <div className="flex w-full min-w-0 flex-col gap-2 md:ml-auto md:w-auto md:max-w-[min(100%,44rem)] md:items-end">
                    {/* OW-36: straight to a section, or back to the last one. */}
                    <BuildShortcuts />
                    <button
                      onClick={() => openDrawer()}
                      data-testid="open-content-panel"
                      className="w-full shrink-0 md:w-auto px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      {t('build.openContent')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {mode === 'command' && (
            <motion.div
              key="command"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <CommandOverlay gameId={gameId!} />
            </motion.div>
          )}
          {mode === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ReviewOverlay gameId={gameId!} />
            </motion.div>
          )}
          {mode === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ResultsOverlay gameId={gameId!} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings panel -- accessible in any mode */}
        {settingsPanelOpen && <GameSettingsPanel gameId={gameId!} />}
      </div>
    </div>
  )
}
