import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlideDrawer } from '@/components/layout/SlideDrawer'
import { useGame } from '@/hooks/queries/useGames'
import { useUpdateGame, useUpdateGameStatus, useDeleteGame } from '@/hooks/mutations/useGameMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import type { TileSource, UnlockTrigger } from '@/types/game'
import type { GameStatus } from '@/types'

const tileSources: Array<{ value: TileSource; label: string }> = [
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'voyager', label: 'Voyager' },
  { value: 'positron', label: 'Positron' },
  { value: 'swisstopo', label: 'Swisstopo' },
  { value: 'swisstopo-sat', label: 'Swisstopo Satellite' },
]

const unlockTriggers: Array<{
  value: UnlockTrigger
  label: string
  description: string
}> = [
  {
    value: 'CHECK_IN',
    label: 'Check-in',
    description: 'Base unlocks when team checks in',
  },
  {
    value: 'SUBMISSION',
    label: 'Submission',
    description: 'Base unlocks when team submits an answer',
  },
  {
    value: 'COMPLETED',
    label: 'Completed',
    description: 'Base unlocks when challenge is completed/approved',
  },
]

function Toggle({
  checked,
  onToggle,
  testId,
}: {
  checked: boolean
  onToggle: () => void
  testId?: string
}) {
  return (
    <button
      onClick={onToggle}
      data-testid={testId}
      className="cursor-pointer"
      type="button"
      role="switch"
      aria-checked={checked}
    >
      <div
        className={`w-9 h-5 rounded-full transition-colors flex items-center ${
          checked ? 'bg-primary justify-end' : 'bg-muted justify-start'
        }`}
      >
        <div className="w-4 h-4 rounded-full bg-white mx-0.5 shadow-sm" />
      </div>
    </button>
  )
}

export default function GameSettingsPanel({
  gameId,
}: {
  gameId: string
}) {
  const settingsPanelOpen = useWorkspaceStore((s) => s.settingsPanelOpen)
  const toggleSettingsPanel = useWorkspaceStore((s) => s.toggleSettingsPanel)
  const navigate = useNavigate()
  const { data: game } = useGame(gameId)
  const updateGame = useUpdateGame(gameId)
  const updateStatus = useUpdateGameStatus(gameId)
  const deleteGame = useDeleteGame()

  // State change dialog
  const [stateTarget, setStateTarget] = useState<GameStatus | null>(null)
  const [progressChoice, setProgressChoice] = useState<'keep' | 'erase' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const currentTileSource = useMemo(
    () => (game?.tileSource as TileSource) ?? 'osm',
    [game?.tileSource],
  )

  const currentUnlockTrigger = useMemo(
    () => (game?.unlockTrigger as UnlockTrigger) ?? 'CHECK_IN',
    [game?.unlockTrigger],
  )

  // Optimistic local state for toggles
  const [localUniform, setLocalUniform] = useState<boolean | null>(null)
  const [localBroadcast, setLocalBroadcast] = useState<boolean | null>(null)

  const uniformValue = localUniform ?? game?.uniformAssignment ?? false
  const broadcastValue = localBroadcast ?? game?.broadcastEnabled ?? false

  if (!game) return null

  return (
    <SlideDrawer
      open={settingsPanelOpen}
      onClose={toggleSettingsPanel}
      width="w-[400px]"
      title="Game Settings"
    >
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
        data-testid="game-settings-panel"
      >
        {/* Map Settings */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Map Settings
          </h3>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              Tile Source
            </label>
            <div className="space-y-1.5">
              {tileSources.map((ts) => (
                <button
                  key={ts.value}
                  onClick={() =>
                    updateGame.mutate({ tileSource: ts.value })
                  }
                  data-testid={`tile-source-${ts.value}`}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                    currentTileSource === ts.value
                      ? 'bg-primary/10 border-primary/30 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {ts.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Progression */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Progression
          </h3>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              Unlock Trigger
            </label>
            <div className="space-y-1.5">
              {unlockTriggers.map((ut) => (
                <button
                  key={ut.value}
                  onClick={() =>
                    updateGame.mutate({ unlockTrigger: ut.value })
                  }
                  data-testid={`unlock-trigger-${ut.value}`}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    currentUnlockTrigger === ut.value
                      ? 'bg-primary/10 border-primary/30'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      currentUnlockTrigger === ut.value
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {ut.label}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ut.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Assignment Mode */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Assignment Mode
          </h3>
          <div className="space-y-2">
            <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border">
              <span className="text-sm text-muted-foreground">
                Uniform Assignment
              </span>
              <Toggle
                checked={uniformValue}
                onToggle={() => {
                  const newVal = !uniformValue
                  setLocalUniform(newVal)
                  updateGame.mutate(
                    { uniformAssignment: newVal },
                    { onSettled: () => setLocalUniform(null) },
                  )
                }}
                testId="toggle-uniform-assignment"
              />
            </div>
            <p className="text-xs text-muted-foreground px-1">
              When enabled, all teams get the same challenge at each base
            </p>
          </div>
        </section>

        {/* Broadcast */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Broadcast
          </h3>
          <div className="space-y-2">
            <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border">
              <span className="text-sm text-muted-foreground">
                Broadcast Enabled
              </span>
              <Toggle
                checked={broadcastValue}
                onToggle={() => {
                  const newVal = !broadcastValue
                  setLocalBroadcast(newVal)
                  updateGame.mutate(
                    { broadcastEnabled: newVal },
                    { onSettled: () => setLocalBroadcast(null) },
                  )
                }}
                testId="toggle-broadcast"
              />
            </div>
            {broadcastValue && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">
                  Broadcast Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={game.broadcastCode ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6)
                    if (val !== (game.broadcastCode ?? '')) {
                      updateGame.mutate({
                        broadcastEnabled: true,
                        broadcastCode: val,
                      })
                    }
                  }}
                  placeholder="ABC123"
                  data-testid="broadcast-code-input"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring font-mono tracking-widest"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground px-1">
              Share this code for spectators to watch live
            </p>
          </div>
        </section>

        {/* Operators */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Operators
          </h3>
          <div
            className="px-3 py-4 rounded-lg border border-dashed border-border text-center"
            data-testid="operators-placeholder"
          >
            <p className="text-xs text-muted-foreground">
              Operators panel coming soon
            </p>
          </div>
        </section>

        {/* Game State Override */}
        {(game.status === 'live' || game.status === 'ended') && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Game State
            </h3>
            <div className="rounded-lg border border-amber-500/30 p-3 space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground">
                  Current status:
                </span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    game.status === 'live'
                      ? 'bg-green-500/15 text-green-600'
                      : 'bg-red-500/15 text-red-600'
                  }`}
                >
                  {game.status}
                </span>
              </div>

              {game.status === 'ended' && (
                <div>
                  <button
                    onClick={() => {
                      setStateTarget('live')
                      setProgressChoice('keep')
                    }}
                    data-testid="revert-to-live-btn"
                    className="w-full px-3 py-2 rounded-lg border border-amber-500/40 text-sm text-amber-600 font-medium cursor-pointer hover:bg-amber-500/10 transition-colors"
                  >
                    Revert to Live
                  </button>
                  <p className="text-xs text-muted-foreground mt-1.5 px-1">
                    Resume the game. All progress is kept.
                  </p>
                </div>
              )}

              <div>
                <button
                  onClick={() => {
                    setStateTarget('setup')
                    setProgressChoice(null)
                  }}
                  data-testid="revert-to-setup-btn"
                  className="w-full px-3 py-2 rounded-lg border border-amber-500/40 text-sm text-amber-600 font-medium cursor-pointer hover:bg-amber-500/10 transition-colors"
                >
                  Revert to Setup
                </button>
                <p className="text-xs text-muted-foreground mt-1.5 px-1">
                  Return game to setup mode for editing.
                </p>
              </div>

              {/* State change confirmation */}
              {stateTarget && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Revert to {stateTarget}?
                  </p>

                  {stateTarget === 'setup' ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        What should happen to player progress?
                      </p>
                      <div className="space-y-2">
                        <button
                          onClick={() => setProgressChoice('keep')}
                          data-testid="progress-keep-btn"
                          className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors cursor-pointer ${
                            progressChoice === 'keep'
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <span className="font-medium">Keep progress</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Submissions, check-ins and scores are preserved
                          </p>
                        </button>
                        <button
                          onClick={() => setProgressChoice('erase')}
                          data-testid="progress-erase-btn"
                          className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors cursor-pointer ${
                            progressChoice === 'erase'
                              ? 'border-destructive bg-destructive/10 text-foreground'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <span className="font-medium">Erase progress</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            All submissions, check-ins and scores are deleted
                          </p>
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      The game will resume. All progress is kept.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setStateTarget(null)
                        setProgressChoice(null)
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground font-medium cursor-pointer hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!stateTarget) return
                        const resetProgress =
                          stateTarget === 'setup' &&
                          progressChoice === 'erase'
                        updateStatus.mutate(
                          {
                            status: stateTarget,
                            resetProgress,
                          },
                          {
                            onSuccess: () => {
                              setStateTarget(null)
                              setProgressChoice(null)
                            },
                          },
                        )
                      }}
                      disabled={
                        (stateTarget === 'setup' &&
                          progressChoice === null) ||
                        updateStatus.isPending
                      }
                      data-testid="confirm-state-change-btn"
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        stateTarget === 'setup' &&
                        progressChoice === null
                          ? 'bg-muted text-muted-foreground cursor-not-allowed'
                          : progressChoice === 'erase'
                            ? 'bg-destructive text-destructive-foreground cursor-pointer hover:bg-destructive/90'
                            : 'bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90'
                      }`}
                    >
                      {updateStatus.isPending ? 'Reverting…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Danger Zone */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Danger Zone
          </h3>
          <div className="rounded-lg border border-destructive/30 p-3 space-y-3">
            {!showDeleteConfirm ? (
              <div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="delete-game-btn"
                  className="w-full px-3 py-2 rounded-lg bg-destructive text-sm text-destructive-foreground font-medium cursor-pointer hover:bg-destructive/90 transition-colors"
                >
                  Delete Game
                </button>
                <p className="text-xs text-muted-foreground mt-1.5 px-1">
                  Permanently delete this game and all its data.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-destructive">
                  Are you sure?
                </p>
                <p className="text-xs text-muted-foreground">
                  This will permanently delete the game, all bases,
                  challenges, teams, and submissions. This cannot be
                  undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground font-medium cursor-pointer hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      deleteGame.mutate(gameId, {
                        onSuccess: () => navigate('/dashboard'),
                      })
                    }
                    disabled={deleteGame.isPending}
                    data-testid="confirm-delete-btn"
                    className="flex-1 px-3 py-2 rounded-lg bg-destructive text-sm text-destructive-foreground font-medium cursor-pointer hover:bg-destructive/90 transition-colors"
                  >
                    {deleteGame.isPending
                      ? 'Deleting…'
                      : 'Delete Forever'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </SlideDrawer>
  )
}
