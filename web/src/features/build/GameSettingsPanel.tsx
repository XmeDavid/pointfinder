import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PublicationSection } from './PublicationSection'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/feedback/ErrorState'
import { exportFile } from '@/lib/exportFile'
import { useNavigate } from 'react-router-dom'
import { SlideDrawer } from '@/components/layout/SlideDrawer'
import { useGame } from '@/hooks/queries/useGames'
import { useUpdateGame, useUpdateGameStatus, useDeleteGame } from '@/hooks/mutations/useGameMutations'
import { isPracticeGame, practiceHoursLeft } from '@/features/tutorials/practiceGame'
import { PracticeGameChoices } from '@/features/tutorials/PracticeGameChoices'
import { useGameOperators, useGameInvites } from '@/hooks/queries/useOperators'
import { useInviteOperator, useRevokeInvite, useRemoveOperator } from '@/hooks/mutations/useOperatorMutations'
import { useAuthStore } from '@/hooks/useAuth'
import { gamesApi } from '@/lib/api/games'
import { useWorkspaceStore } from '@/stores/workspace'
import type { TileSource, UnlockTrigger } from '@/types/game'
import type { GameStatus } from '@/types'
import { GameStatusBadge, useCheckInMethodLabel } from '@/components/status'
import { Input } from '@/components/ui/input'
import {
  CHECK_IN_METHODS,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  parseCheckInRadiusInput,
} from '@/types/checkIn'
import { isLocationCheckInAllowed, type CheckInMethod } from '@/types/checkIn'
import { Select } from '@/components/ui/select'
import { useStages } from '@/hooks/queries/useStages'
import { contentLanguageOptions, normalizeContentLanguage } from '@/lib/contentLanguage'

const tileSources: Array<{ value: TileSource; label: string }> = [
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'voyager', label: 'Voyager' },
  { value: 'positron', label: 'Positron' },
  { value: 'swisstopo', label: 'Swisstopo' },
  { value: 'swisstopo-sat', label: 'Swisstopo Satellite' },
]

const unlockTriggers: UnlockTrigger[] = ['CHECK_IN', 'SUBMISSION', 'COMPLETED']

function Toggle({
  checked,
  onToggle,
  testId,
  labelledBy,
}: {
  checked: boolean
  onToggle: () => void
  testId?: string
  labelledBy?: string
}) {
  return (
    <button
      onClick={onToggle}
      data-testid={testId}
      className="cursor-pointer"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
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
  const { t, i18n } = useTranslation()
  const [baseOrderError, setBaseOrderError] = useState(false)
  const [languageError, setLanguageError] = useState(false)
  const openRouteEditor = useWorkspaceStore((s) => s.openRouteEditor)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const settingsPanelOpen = useWorkspaceStore((s) => s.settingsPanelOpen)
  const toggleSettingsPanel = useWorkspaceStore((s) => s.toggleSettingsPanel)
  const navigate = useNavigate()
  const { data: game } = useGame(gameId)
  const { data: stages } = useStages(gameId)
  const updateGame = useUpdateGame(gameId)
  const languageOptions = useMemo(
    () => contentLanguageOptions(i18n.language, game?.contentLanguage),
    [i18n.language, game?.contentLanguage],
  )
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
  // Ending freezes results, so the operator sees what is still unreviewed before confirming.
  const [ending, setEnding] = useState(false)
  const endSummary = useQuery({ queryKey: ['game', gameId, 'end-summary'], queryFn: () => gamesApi.getEndSummary(gameId), enabled: ending })
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
  const methodLabel = useCheckInMethodLabel()
  const locationAllowed = isLocationCheckInAllowed(game)
  const [radiusDraft, setRadiusDraft] = useState<string | null>(null)
  const [radiusError, setRadiusError] = useState(false)

  const uniformValue = localUniform ?? game?.uniformAssignment ?? false
  const broadcastValue = localBroadcast ?? game?.broadcastEnabled ?? false
  const checkInLocked = game?.status !== 'setup'
  const defaultMethod: CheckInMethod = game?.defaultCheckInMethod ?? 'NFC'
  const defaultRadiusValue = radiusDraft ?? String(game?.defaultCheckInRadiusM ?? 15)

  if (!game) return null

  // OW-40: with stages, each stage is its own route; the game's switch only
  // governs the bases without a stage.
  const hasStages = (stages?.length ?? 0) > 0
  const orderedStages = (stages ?? []).filter((s) => s.enforceBaseOrder).map((s) => s.name)
  const routeEnforced = Boolean(game.enforceBaseOrder) || orderedStages.length > 0

  return (
    <SlideDrawer
      open={settingsPanelOpen}
      onClose={toggleSettingsPanel}
      width="md:w-[400px]"
      title={t('gameSettings.title')}
    >
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
        data-testid="game-settings-panel"
      >
        <PublicationSection game={game} />
        {/* Game Details */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.details')}
          </h3>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground" htmlFor="game-name">{t('gameSettings.name')}</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  id="game-name"
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
                  {t('common.save')}
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
            <label className="text-sm text-muted-foreground" htmlFor="game-description">{t('gameSettings.description')}</label>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  id="game-description"
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
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      updateGame.mutate({ description: draftDesc }, {
                        onSuccess: () => setEditingDesc(false),
                      })
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:bg-primary/90 transition-colors"
                  >
                    {t('common.save')}
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
                    {t('gameSettings.noDescription')}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* OW-33: the language of the game's own content, shown to players before they join. */}
          <div className="space-y-1" data-testid="game-content-language">
            <label className="text-sm text-muted-foreground" htmlFor="game-content-language">
              {t('gameSettings.contentLanguage')}
            </label>
            <Select
              id="game-content-language"
              value={normalizeContentLanguage(game.contentLanguage) ?? ''}
              disabled={updateGame.isPending}
              aria-describedby="game-content-language-hint"
              onChange={(e) => {
                setLanguageError(false)
                // An empty string clears the language back to unknown.
                updateGame.mutate({ contentLanguage: e.target.value }, { onError: () => setLanguageError(true) })
              }}
              data-testid="game-content-language-select"
              className="min-h-11 text-base sm:text-sm"
            >
              <option value="">{t('gameSettings.contentLanguageUnknown')}</option>
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>{option.name}</option>
              ))}
            </Select>
            <p id="game-content-language-hint" className="text-xs text-muted-foreground">
              {t('gameSettings.contentLanguageHint')}
            </p>
            {languageError && (
              <ErrorState className="h-auto p-2" title={t('gameSettings.contentLanguageError')} />
            )}
          </div>
        </section>

        {/* Map Settings */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.map')}
          </h3>
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              {t('gameSettings.tileSource')}
            </p>
            <div className="space-y-1.5">
              {tileSources.map((ts) => (
                <button
                  key={ts.value}
                  onClick={() =>
                    updateGame.mutate({ tileSource: ts.value })
                  }
                  aria-pressed={currentTileSource === ts.value}
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
            {t('gameSettings.progression')}
          </h3>
          <div className="space-y-2" data-testid="base-order-setting">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="enforce-base-order" className="text-sm font-medium text-foreground">
                {t(hasStages ? 'baseOrder.enforceUnstaged' : 'baseOrder.enforce')}
              </label>
              <Switch id="enforce-base-order" data-testid="enforce-base-order-switch" checked={game.enforceBaseOrder ?? false}
                disabled={game.status !== 'setup' || updateGame.isPending}
                onCheckedChange={(enforceBaseOrder) => {
                  setBaseOrderError(false)
                  updateGame.mutate({ enforceBaseOrder }, { onError: () => setBaseOrderError(true) })
                }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('baseOrder.description')}
            </p>
            {hasStages && (
              <p className="text-xs text-muted-foreground" data-testid="base-order-stages-note">
                {t('baseOrder.stagesHaveOwnOrder')}
                {orderedStages.length > 0 && <> {t('baseOrder.orderedStages', { stages: orderedStages.join(', ') })}</>}
              </p>
            )}
            {game.status !== 'setup' && <p className="text-xs text-muted-foreground">
              {t('baseOrder.setupOnly')}
            </p>}
            {baseOrderError && <ErrorState className="h-auto p-2"
              title={t('baseOrder.settingsError')} />}
            {routeEnforced && <Button variant="outline" size="sm" className="h-auto min-h-11 whitespace-normal"
              onClick={() => { selectBase(null); openRouteEditor() }}>
              {t('baseOrder.arrange')}
            </Button>}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              {t('gameSettings.unlockTrigger')}
            </p>
            <div className="space-y-1.5">
              {unlockTriggers.map((trigger) => (
                <button
                  key={trigger}
                  onClick={() =>
                    updateGame.mutate({ unlockTrigger: trigger })
                  }
                  aria-pressed={currentUnlockTrigger === trigger}
                  data-testid={`unlock-trigger-${trigger}`}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    currentUnlockTrigger === trigger
                      ? 'bg-primary/10 border-primary/30'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      currentUnlockTrigger === trigger
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {t(`gameSettings.unlockTriggers.${trigger}.label`)}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`gameSettings.unlockTriggers.${trigger}.description`)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Check-in */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('checkIn.group')}
          </h3>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground" id="checkin-default-method-label">
              {t('checkIn.defaultMethod')}
            </label>
            <div
              className="flex gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-labelledby="checkin-default-method-label"
              data-testid="checkin-default-method"
            >
              {CHECK_IN_METHODS.map((method) => {
                const isActive = defaultMethod === method
                const locked = method === 'LOCATION' && !locationAllowed && !isActive
                return (
                  <button
                    key={method}
                    type="button"
                    disabled={checkInLocked || updateGame.isPending}
                    aria-disabled={locked || undefined}
                    aria-describedby={locked ? 'checkin-location-plan' : undefined}
                    aria-pressed={isActive}
                    data-testid={`checkin-default-method-${method.toLowerCase()}`}
                    onClick={() => {
                      if (!locked) updateGame.mutate({ defaultCheckInMethod: method })
                    }}
                    className={`min-h-11 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {methodLabel(method)}
                  </button>
                )
              })}
            </div>
            {!locationAllowed && defaultMethod !== 'LOCATION' && (
              <p
                id="checkin-location-plan"
                data-testid="checkin-location-plan"
                className="text-xs text-muted-foreground"
              >
                {t('checkIn.locationPaid')}{' '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => navigate('/billing')}
                >
                  {t('checkIn.locationPaidCta')}
                </button>
              </p>
            )}
          </div>

          {defaultMethod === 'LOCATION' && (
            <div className="space-y-1.5">
              <label htmlFor="checkin-default-radius" className="text-sm text-muted-foreground">
                {t('checkIn.defaultRadius')}
              </label>
              <Input
                id="checkin-default-radius"
                data-testid="checkin-default-radius"
                type="number"
                inputMode="numeric"
                min={MIN_CHECK_IN_RADIUS_M}
                max={MAX_CHECK_IN_RADIUS_M}
                disabled={checkInLocked || updateGame.isPending}
                aria-invalid={radiusError}
                aria-describedby={radiusError ? 'checkin-default-radius-error' : undefined}
                value={defaultRadiusValue}
                onChange={(e) => {
                  setRadiusDraft(e.target.value)
                  setRadiusError(false)
                }}
                onBlur={() => {
                  if (radiusDraft === null) return
                  const parsed = parseCheckInRadiusInput(radiusDraft)
                  if (!parsed.ok || parsed.value === null) {
                    setRadiusError(true)
                    return
                  }
                  setRadiusError(false)
                  if (parsed.value === game?.defaultCheckInRadiusM) {
                    setRadiusDraft(null)
                    return
                  }
                  updateGame.mutate(
                    { defaultCheckInRadiusM: parsed.value },
                    { onSettled: () => setRadiusDraft(null) },
                  )
                }}
              />
              {radiusError ? (
                <p
                  id="checkin-default-radius-error"
                  data-testid="checkin-default-radius-error"
                  className="text-xs text-destructive"
                >
                  {t('checkIn.radiusInvalid')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('checkIn.radiusHint', { meters: game?.defaultCheckInRadiusM ?? 15 })}
                </p>
              )}
            </div>
          )}

          {checkInLocked && (
            <p className="text-xs text-muted-foreground">{t('checkIn.setupOnly')}</p>
          )}
        </section>

        {/* Assignment Mode */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.assignmentMode')}
          </h3>
          <div className="space-y-2">
            <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border">
              <span className="text-sm text-muted-foreground" id="uniform-assignment-label">
                {t('gameSettings.uniformAssignment')}
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
                labelledBy="uniform-assignment-label"
              />
            </div>
            <p className="text-xs text-muted-foreground px-1">
              {t('gameSettings.uniformAssignmentHint')}
            </p>
          </div>
        </section>

        {/* Broadcast */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.broadcast')}
          </h3>
          <div className="space-y-2">
            <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border">
              <span className="text-sm text-muted-foreground" id="broadcast-enabled-label">
                {t('gameSettings.broadcastEnabled')}
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
                labelledBy="broadcast-enabled-label"
              />
            </div>
            {broadcastValue && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground" htmlFor="broadcast-code">
                  {t('gameSettings.broadcastCode')}
                </label>
                <input
                  id="broadcast-code"
                  type="text"
                  maxLength={10}
                  value={game.broadcastCode ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 10)
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
              {t('gameSettings.broadcastHint')}
            </p>
          </div>
        </section>

        {/* Operators */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.operators')}
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
                    {t('gameSettings.owner')}
                  </span>
                ) : op.id !== currentUser?.id ? (
                  <button
                    onClick={() => removeOperator.mutate(op.id)}
                    data-testid={`remove-operator-${op.id}`}
                    className="text-xs text-destructive hover:text-destructive/80 shrink-0 cursor-pointer"
                  >
                    {t('gameSettings.remove')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {/* Pending invites */}
          {invites && invites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground px-1">
                {t('gameSettings.pendingInvitations')}
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
                    {t('gameSettings.revoke')}
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
              aria-label={t('gameSettings.inviteEmail')}
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
                    setInviteError(t('gameSettings.inviteFailed')),
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
              {inviteOperator.isPending ? t('gameSettings.sending') : t('gameSettings.invite')}
            </button>
          </div>
          {inviteError && (
            <p className="text-xs text-destructive px-1" role="alert">{inviteError}</p>
          )}
        </section>

        {/* Export */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.export')}
          </h3>
          <div>
            <button
              onClick={async () => {
                setExporting(true)
                try {
                  const blob = await gamesApi.exportGame(gameId)
                  await exportFile(blob, `${game.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-export.json`)
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
              {exporting ? t('gameSettings.exporting') : t('gameSettings.exportGame')}
            </button>
            <p className="text-xs text-muted-foreground mt-1.5 px-1">
              {t('gameSettings.exportHint')}
            </p>
          </div>
        </section>

        {/* Game State Override */}
        {(game.status === 'live' || game.status === 'ended') && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('lifecycle.revert.sectionTitle')}
            </h3>
            <div className="space-y-3 rounded-lg border border-warning/30 p-3">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground">
                  {t('lifecycle.revert.currentStatus')}
                </span>
                <GameStatusBadge status={game.status} />
              </div>

              {game.status === 'live' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setEnding(true)}
                    data-testid="end-game-btn"
                    className="w-full cursor-pointer rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    {t('lifecycle.endGame')}
                  </button>
                  <p className="text-xs text-muted-foreground mt-1.5 px-1">{t('lifecycle.endFreezes')}</p>
                  {ending && (
                    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3" data-testid="end-game-confirm">
                      <p className="text-sm font-medium text-foreground">{t('lifecycle.endGameConfirmTitle')}</p>
                      {endSummary.isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                      {endSummary.data && (
                        <p className="text-sm text-foreground" data-testid="end-game-pending">
                          {endSummary.data.pendingReviews > 0
                            ? t('lifecycle.endPendingReviews', { count: endSummary.data.pendingReviews })
                            : t('lifecycle.endNoPending')}
                        </p>
                      )}
                      {endSummary.isError && <p className="text-xs text-destructive">{t('lifecycle.endSummaryFailed')}</p>}
                      <p className="text-xs text-muted-foreground">{t('lifecycle.endGameConfirmDescription', { teams: endSummary.data?.teams ?? 0 })}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEnding(false)}
                          className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground font-medium cursor-pointer hover:bg-muted transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={() => updateStatus.mutate({ status: 'ended' }, { onSuccess: () => setEnding(false) })}
                          disabled={updateStatus.isPending || endSummary.isLoading}
                          data-testid="end-game-confirm-btn"
                          className="flex-1 px-3 py-2 rounded-lg bg-destructive text-sm text-destructive-foreground font-medium cursor-pointer hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('lifecycle.endGame')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {game.status === 'ended' && (
                <div>
                  <button
                    onClick={() => {
                      setStateTarget('live')
                      setProgressChoice('keep')
                    }}
                    data-testid="revert-to-live-btn"
                    className="w-full cursor-pointer rounded-lg border border-warning/40 px-3 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
                  >
                    {t('lifecycle.revert.toLive')}
                  </button>
                  <p className="text-xs text-muted-foreground mt-1.5 px-1">
                    {t('lifecycle.revert.toLiveHint')}
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
                  className="w-full cursor-pointer rounded-lg border border-warning/40 px-3 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
                >
                  {t('lifecycle.revert.toSetup')}
                </button>
                <p className="text-xs text-muted-foreground mt-1.5 px-1">
                  {t('lifecycle.revert.toSetupHint')}
                </p>
              </div>

              {/* State change confirmation */}
              {stateTarget && (
                <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {t(
                      stateTarget === 'setup'
                        ? 'lifecycle.revert.confirmToSetup'
                        : 'lifecycle.revert.confirmToLive',
                    )}
                  </p>

                  {stateTarget === 'setup' ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {t('lifecycle.revert.progressQuestion')}
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
                          <span className="font-medium">{t('lifecycle.revert.keep')}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('lifecycle.revert.keepHint')}
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
                          <span className="font-medium">{t('lifecycle.revert.erase')}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('lifecycle.revert.eraseHint')}
                          </p>
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('lifecycle.revert.resumeHint')}
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
                      {t('common.cancel')}
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
                      {updateStatus.isPending
                        ? t('lifecycle.revert.reverting')
                        : t('lifecycle.revert.confirm')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {isPracticeGame(game) && (
          <section className="space-y-3" data-testid="practice-game-section">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('tutorials.practice.settingsTitle')}
            </h3>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                {game.status === 'ended'
                  ? t('tutorials.practice.settingsBodyEnded')
                  : t('tutorials.practice.settingsBody', { hours: practiceHoursLeft(game.tutorialExpiresAt) })}
              </p>
              <PracticeGameChoices gameId={gameId} />
            </div>
          </section>
        )}

        {/* Danger Zone */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('gameSettings.dangerZone')}
          </h3>
          <div className="rounded-lg border border-destructive/30 p-3 space-y-3">
            {!showDeleteConfirm ? (
              <div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="delete-game-btn"
                  className="w-full px-3 py-2 rounded-lg bg-destructive text-sm text-destructive-foreground font-medium cursor-pointer hover:bg-destructive/90 transition-colors"
                >
                  {t('gameSettings.deleteGame')}
                </button>
                <p className="text-xs text-muted-foreground mt-1.5 px-1">
                  {t('gameSettings.deleteHint')}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-destructive">
                  {t('gameSettings.deleteConfirm')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('gameSettings.deleteConfirmBody')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground font-medium cursor-pointer hover:bg-muted transition-colors"
                  >
                    {t('common.cancel')}
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
                      ? t('gameSettings.deleting')
                      : t('gameSettings.deleteForever')}
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
