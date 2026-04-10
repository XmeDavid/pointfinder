import { useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useGame } from '@/hooks/queries/useGames'
import { useStages } from '@/hooks/queries/useStages'
import { useBases } from '@/hooks/queries/useBases'
import { useTeamLocations } from '@/hooks/queries/useTeamLocations'
import { useWorkspaceStore } from '@/stores/workspace'
import { GameMap } from '@/components/map/GameMap'
import { getStyleUrl } from '@/lib/tile-sources'
import { BaseMarkers } from '@/components/map/BaseMarkers'
import { TeamMarkers } from '@/components/map/TeamMarkers'
import { TopBar } from './TopBar'
import { Spinner } from '@/components/feedback/Spinner'
import { ContentDrawer } from '@/features/build/ContentDrawer'
import ReadinessIndicator from '@/features/build/ReadinessIndicator'
import GameSettingsPanel from '@/features/build/GameSettingsPanel'
import { CommandOverlay } from '@/features/command/CommandOverlay'
import ReviewOverlay from '@/features/review/ReviewOverlay'
import ResultsOverlay from '@/features/results/ResultsOverlay'

export function GameWorkspace() {
  const { id: gameId } = useParams<{ id: string }>()

  // --- Data queries ---
  const { data: game, isLoading: gameLoading, error: gameError } = useGame(gameId)
  const { data: stages = [] } = useStages(gameId)
  const { data: bases = [] } = useBases(gameId)

  // --- Workspace store ---
  const mode = useWorkspaceStore((s) => s.mode)
  const selectedBaseId = useWorkspaceStore((s) => s.selectedBaseId)
  const selectedStageId = useWorkspaceStore((s) => s.selectedStageId)
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const openDrawer = useWorkspaceStore((s) => s.openDrawer)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const inspectTeam = useWorkspaceStore((s) => s.inspectTeam)
  const settingsPanelOpen = useWorkspaceStore((s) => s.settingsPanelOpen)
  const reset = useWorkspaceStore((s) => s.reset)

  // Fetch team locations only in command mode (perf optimization)
  const { data: locations = [] } = useTeamLocations(
    mode === 'command' ? gameId : undefined,
  )

  // Reset workspace store on unmount
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // --- Loading / error states ---
  if (gameLoading) {
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
          {gameError?.message ?? 'Game not found'}
        </p>
      </div>
    )
  }

  // --- Handlers ---
  const handleBaseClick = (baseId: string) => {
    if (mode === 'build') {
      selectBase(baseId)
    }
  }

  const handleTeamClick = (teamId: string) => {
    if (mode === 'command') {
      inspectTeam(teamId)
    }
  }

  return (
    <div className="h-screen w-full relative overflow-hidden">
      <GameMap
        mapStyle={getStyleUrl(game.tileSource)}
        fitPoints={bases.length > 0 ? bases.map(b => [b.lng, b.lat] as [number, number]) : undefined}
      >
        <BaseMarkers
          bases={bases}
          mode={mode}
          selectedBaseId={selectedBaseId}
          selectedStageId={selectedStageId}
          onBaseClick={handleBaseClick}
        />
        {mode === 'command' && (
          <TeamMarkers
            locations={locations}
            teams={[]}
            onTeamClick={handleTeamClick}
          />
        )}
      </GameMap>

      {/* TopBar floating above the map */}
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
            <ContentDrawer gameId={gameId!} />
            <ReadinessIndicator gameId={gameId!} gameStatus={game.status} />
            {!drawerOpen && (
              <button
                onClick={() => openDrawer()}
                data-testid="open-content-panel"
                className="absolute bottom-4 right-4 z-20 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Open Content Panel
              </button>
            )}
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
  )
}
