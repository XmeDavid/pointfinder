import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlideDrawer } from '@/components/layout/SlideDrawer'
import { useGame } from '@/hooks/queries/useGames'
import { useUpdateGame, useUpdateGameStatus, useDeleteGame } from '@/hooks/mutations/useGameMutations'
import { useGameOperators, useGameInvites } from '@/hooks/queries/useOperators'
import { useInviteOperator, useRevokeInvite, useRemoveOperator } from '@/hooks/mutations/useOperatorMutations'
import { useAuthStore } from '@/hooks/useAuth'
import { gamesApi } from '@/lib/api/games'
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

  // Operators
  const { data: operators } = useGameOperators(gameId)
  const { data: invites } = useGameInvites(gameId)
  const inviteOperator = useInviteOperator(gameId)
  const revokeInvite = useRevokeInvite(gameId)
  const removeOperator = useRemoveOperator(gameId)
  const currentUser = useAuthStore((s) => s.user)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Export
  const [exporting, setExporting] = useState(false)

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

  // Game details (name/description)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [draftDesc, setDraftDesc] = useState('')

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
        {/* Game Details */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Game Details
          </h3>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Name</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  data-testid="game-name-input"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-muted text-sm text-foreground focus:outline-none focus:border-ring"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draftName.trim()) {
                      updateGame.mutate({ name: draftName.trim() }, {
                        onSuccess: () => setEditingName(false),
                      })
                    }
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                />
                <button
                  onClick={() => {
                    if (draftName.trim()) {
                      updateGame.mutate({ name: draftName.trim() }, {
                        onSuccess: () => setEditingName(false),
                      })
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:bg-primary/90 transition-colors"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setDraftName(game.name)
                  setEditingName(true)
                }}
                data-testid="edit-game-name-btn"
                className="w-full text-left px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {game.name}
              </button>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Description</label>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  rows={3}
                  data-testid="game-description-input"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-sm text-foreground focus:outline-none focus:border-ring resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingDesc(false)
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingDesc(false)}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground cursor-pointer hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      updateGame.mutate({ description: draftDesc }, {
                        onSuccess: () => setEditingDesc(false),
                      })
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:bg-primary/90 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setDraftDesc(game.description)
                  setEditingDesc(true)
                }}
                data-testid="edit-game-desc-btn"
                className="w-full text-left px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors cursor-pointer min-h-[40px]"
              >
                {game.description || (
                  <span className="text-muted-foreground italic">
                    No description
                  </span>
                )}
              </button>
            )}
          </div>
        </section>

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

          {/* Current operators */}
          <div className="space-y-1.5">
            {operators?.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-border"
                data-testid={`operator-${op.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{op.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {op.email}
                  </p>
                </div>
                {op.id === game.createdBy ? (
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted shrink-0">
                    Owner
                  </span>
                ) : op.id !== currentUser?.id ? (
                  <button
                    onClick={() => removeOperator.mutate(op.id)}
                    data-testid={`remove-operator-${op.id}`}
                    className="text-xs text-destructive hover:text-destructive/80 shrink-0 cursor-pointer"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {/* Pending invites */}
          {invites && invites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground px-1">
                Pending Invitations
              </p>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-border"
                  data-testid={`invite-${inv.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground truncate">
                      {inv.email}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeInvite.mutate(inv.id)}
                    data-testid={`revoke-invite-${inv.id}`}
                    className="text-xs text-destructive hover:text-destructive/80 shrink-0 cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Invite form */}
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value)
                setInviteError(null)
              }}
              placeholder="operator@example.com"
              data-testid="invite-email-input"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
            <button
              onClick={() => {
                if (!inviteEmail.trim()) return
                setInviteError(null)
                inviteOperator.mutate(inviteEmail.trim(), {
                  onSuccess: () => setInviteEmail(''),
                  onError: () =>
                    setInviteError('Failed to send invitation.'),
                })
              }}
              disabled={!inviteEmail.trim() || inviteOperator.isPending}
              data-testid="send-invite-btn"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                inviteEmail.trim() && !inviteOperator.isPending
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {inviteOperator.isPending ? 'Sending...' : 'Invite'}
            </button>
          </div>
          {inviteError && (
            <p className="text-xs text-destructive px-1">{inviteError}</p>
          )}
        </section>

        {/* Export */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Export
          </h3>
          <div>
            <button
              onClick={async () => {
                setExporting(true)
                try {
                  const blob = await gamesApi.exportGame(gameId)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${game.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-export.json`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                } catch {
                  // silent — blob error already handled in gamesApi
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting}
              data-testid="export-game-btn"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm text-foreground font-medium cursor-pointer hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Export Game'}
            </button>
            <p className="text-xs text-muted-foreground mt-1.5 px-1">
              Download a JSON file with all game configuration that can be
              imported into a new game.
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
