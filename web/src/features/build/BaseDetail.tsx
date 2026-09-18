import { useState, useMemo, useCallback } from 'react'
import { ChevronDown, Pin, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TagPicker } from '@/components/data/TagPicker'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/lib/auth/store'
import { getApiErrorMessage } from '@/lib/api/errors'
import { SaveStatusIndicator } from '@/components/status'
import { draftKey } from './drafts/draftStore'
import { useEntityDraft } from './drafts/useEntityDraft'
import { baseDraftFields, baseDraftIsValid, type BaseDraftFields } from './drafts/baseDraft'
import { useBases } from '@/hooks/queries/useBases'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useChallenges } from '@/hooks/queries/useChallenges'
import {
  useUpdateBase,
  useDeleteBase,
} from '@/hooks/mutations/useBaseMutations'
import { BaseAssignmentSection } from './assignments/BaseAssignmentSection'
import { useTeams } from '@/hooks/queries/useTeams'
import { LocationPicker } from '@/components/map/LocationPicker'
import { useGame } from '@/hooks/queries/useGames'
import { getStyleUrl } from '@/lib/tile-sources'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { NfcStatusBadge } from '@/components/status'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { NfcLinkControl } from '@/components/nfc/NfcLinkControl'
import { isNative } from '@/platform'
import { printableTagUrl } from '@/lib/tagUrl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { QrCodeViewer } from '@/components/common/QrCodeViewer'
import { CodesPrintSheet } from '@/components/common/CodesPrintSheet'
import { useCheckInMethodLabel } from '@/components/status'
import {
  CHECK_IN_METHODS,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  parseCheckInRadiusInput,
  resolveCheckInRadiusM,
} from '@/types/checkIn'
import { isLocationCheckInAllowed, type CheckInMethod } from '@/types/checkIn'

interface BaseDetailProps {
  baseId: string
  gameId: string
}

export function BaseDetail({ baseId, gameId }: BaseDetailProps) {
  const { t } = useTranslation()
  const openBaseChallenge = useWorkspaceStore((s) => s.openBaseChallenge)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const { data: game } = useGame(gameId)
  const { data: bases = [] } = useBases(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const updateBase = useUpdateBase(gameId)
  const deleteBase = useDeleteBase(gameId)

  const base = bases.find((b) => b.id === baseId)

  // Local form state lives in a persisted, account-scoped draft: it survives
  // opening a challenge, a killed WebView and a failed save, and a refetch
  // never overwrites what the operator typed.
  const methodLabel = useCheckInMethodLabel()
  const locationAllowed = isLocationCheckInAllowed(game)
  const accountId = useAuthStore((s) => s.user?.id)
  const serverFields = useMemo(
    () => (base ? baseDraftFields(base) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      base?.id,
      base?.name,
      base?.description,
      base?.lat,
      base?.lng,
      base?.hidden,
      base?.checkInMethod,
      base?.checkInRadiusM,
    ],
  )
  const saveFields = useCallback(
    async (fields: BaseDraftFields) => {
      const current = bases.find((b) => b.id === baseId)
      if (!current) throw new Error(t('build.baseNotFound'))
      const radius = parseCheckInRadiusInput(fields.radius)
      const updated = await updateBase.mutateAsync({
        baseId,
        dto: {
          name: fields.name,
          description: fields.description,
          lat: Number.parseFloat(fields.lat),
          lng: Number.parseFloat(fields.lng),
          hidden: fields.hidden,
          tagIds: current.tagIds,
          fixedChallengeId: current.fixedChallengeId,
          checkInMethod: fields.method,
          checkInRadiusM: fields.method === 'LOCATION' && radius.ok ? radius.value : null,
        },
      })
      return baseDraftFields(updated)
    },
    [bases, baseId, updateBase, t],
  )
  const describeSaveError = useCallback(
    (error: unknown) => getApiErrorMessage(error, t('common.unknownError')),
    [t],
  )
  const draft = useEntityDraft<BaseDraftFields>({
    key: draftKey(accountId, gameId, 'base', baseId),
    server: serverFields,
    validate: baseDraftIsValid,
    save: saveFields,
    describeError: describeSaveError,
  })
  const fields = draft.fields ?? serverFields
  const localName = fields?.name ?? ''
  const localDescription = fields?.description ?? ''
  const localLat = fields?.lat ?? ''
  const localLng = fields?.lng ?? ''
  const localHidden = fields?.hidden ?? false
  const localMethod: CheckInMethod = fields?.method ?? 'NFC'
  const localRadius = fields?.radius ?? ''
  const update = draft.update
  const setLocalName = (name: string) => update({ name })
  const setLocalDescription = (description: string) => update({ description })
  const setLocalLat = (lat: string) => update({ lat })
  const setLocalLng = (lng: string) => update({ lng })
  const setLocalHidden = (hidden: boolean) => update({ hidden })
  const setLocalMethod = (method: CheckInMethod) => update({ method })
  const setLocalRadius = (radius: string) => update({ radius })
  const [preciseCoordinatesOpen, setPreciseCoordinatesOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  // Why a challenge could not be opened: the base must be saved first.
  const [openBlocked, setOpenBlocked] = useState<string | null>(null)

  // Derived data
  const baseAssignments = useMemo(
    () => assignments.filter((a) => a.baseId === baseId),
    [assignments, baseId],
  )

  // Close dropdown on outside click
  const fixedChallenge = useMemo(
    () =>
      base?.fixedChallengeId
        ? challenges.find((c) => c.id === base.fixedChallengeId)
        : null,
    [base, challenges],
  )

  const parsedLat = Number.parseFloat(localLat)
  const parsedLng = Number.parseFloat(localLng)
  const coordinatesValid =
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180
  const parsedRadius = parseCheckInRadiusInput(localRadius)
  const radiusValid = parsedRadius.ok

  const gameDefaultRadius = game?.defaultCheckInRadiusM
  const effectiveRadius = resolveCheckInRadiusM(
    parsedRadius.ok ? parsedRadius.value : (base?.checkInRadiusM ?? null),
    gameDefaultRadius,
  )

  const isDirty = draft.isDirty
  const saving = draft.status.state === 'saving'
  // One validity rule for the button, the background save and the challenge guard.
  const canSave = !!fields && baseDraftIsValid(fields) && !saving && !draft.conflict

  const handleSave = () => {
    if (!base || !canSave) return
    setOpenBlocked(null)
    void draft.saveNow()
  }

  /**
   * A challenge is created, linked or opened only after this base is saved:
   * the drawer switches tabs and the base editor unmounts, so anything not
   * on the server by then would otherwise have to be recovered from the draft.
   */
  const ensureSavedBeforeChallenge = useCallback(async (): Promise<boolean> => {
    if (!fields) return false
    if (!baseDraftIsValid(fields)) {
      setOpenBlocked(t('build.editor.baseInvalid'))
      return false
    }
    const saved = await draft.saveNow()
    setOpenBlocked(saved ? null : t('build.editor.saveBaseFirst'))
    return saved
  }, [fields, draft, t])

  const openChallengeAfterSave = useCallback(
    async (challengeId: string) => {
      if (await ensureSavedBeforeChallenge()) openBaseChallenge(baseId, challengeId)
    },
    [ensureSavedBeforeChallenge, openBaseChallenge, baseId],
  )

  if (!base) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {t('build.baseNotFound')}
      </div>
    )
  }

  const baseRouteLocked = !!game?.enforceBaseOrder && game.status !== 'setup'
  const cascadeCount = baseAssignments.length
  const deleteDescription =
    t('common.confirm.deleteBaseDescription') +
    (cascadeCount > 0
      ? ' ' + t('common.confirm.deleteBaseCascade', { count: cascadeCount })
      : '')

  return (
    <div className="p-4 space-y-0" data-testid="base-detail">
      {game?.enforceBaseOrder && (
        <div className="flex items-center gap-2 pb-3">
          <BaseSequenceBadge sequenceNumber={base.sequenceNumber} />
          <span className="text-xs text-muted-foreground">
            {t('baseOrder.baseNumber', {
              number: base.sequenceNumber,
              defaultValue: 'Base {{number}}',
            })}
          </span>
        </div>
      )}
      {/* Identity section */}
      <section>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.name')}
            </label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              data-testid="base-name-input"
              className="w-full min-h-11 px-3 text-base rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('build.editor.description')}
            </label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              placeholder={t('build.baseDescription')}
              rows={2}
              data-testid="base-description-input"
              className="w-full px-3 py-2 text-base rounded-md bg-background border border-border text-foreground resize-none"
            />
          </div>
          <SaveStatusIndicator
            state={draft.status.state}
            error={draft.status.error}
            onRetry={() => void draft.saveNow()}
            onDiscard={draft.discard}
            onKeepMine={draft.keepMine}
            onUseLatest={draft.discard}
            data-testid="base-save-status"
          />
        </div>
      </section>

      <BaseAssignmentSection
        key={baseId}
        gameId={gameId}
        baseId={baseId}
        assignments={assignments}
        challenges={challenges}
        teams={teams}
        beforeOpenChallenge={ensureSavedBeforeChallenge}
        onOpenChallenge={(id) => openBaseChallenge(baseId, id)}
      />
      {openBlocked && (
        <p
          role="alert"
          data-testid="base-save-blocked"
          className="mt-2 text-xs text-destructive"
        >
          {openBlocked}
        </p>
      )}

      <section
        className="border-t border-border pt-4 mt-4"
        data-testid="base-location-checkin-section"
      >
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('build.editor.locationAndCheckIn')}
        </h3>
        <div className="space-y-3">
          <LocationPicker
            lat={coordinatesValid ? parsedLat : 0}
            lng={coordinatesValid ? parsedLng : 0}
            radiusM={localMethod === 'LOCATION' ? effectiveRadius : null}
            mapStyle={
              game?.tileSource ? getStyleUrl(game.tileSource) : undefined
            }
            onChange={(newLat, newLng) => {
              setLocalLat(newLat.toString())
              setLocalLng(newLng.toString())
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t('build.editor.moveBaseHint')}
            </p>
            <button
              type="button"
              aria-expanded={preciseCoordinatesOpen}
              aria-controls="base-precise-coordinates"
              data-testid="base-precise-coordinates-toggle"
              onClick={() => setPreciseCoordinatesOpen((open) => !open)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t('build.editor.preciseCoordinates')}
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${preciseCoordinatesOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {preciseCoordinatesOpen && (
            <div
              id="base-precise-coordinates"
              className="grid grid-cols-2 gap-2"
            >
              <div>
                <label
                  htmlFor="base-lat"
                  className="block text-xs text-muted-foreground mb-1"
                >
                  {t('bases.latitude')}
                </label>
                <Input
                  id="base-lat"
                  data-testid="base-lat-input"
                  value={localLat}
                  inputMode="decimal"
                  aria-invalid={!coordinatesValid}
                  onChange={(e) => setLocalLat(e.target.value)}
                  className="min-h-11 text-base"
                />
              </div>
              <div>
                <label
                  htmlFor="base-lng"
                  className="block text-xs text-muted-foreground mb-1"
                >
                  {t('bases.longitude')}
                </label>
                <Input
                  id="base-lng"
                  data-testid="base-lng-input"
                  value={localLng}
                  inputMode="decimal"
                  aria-invalid={!coordinatesValid}
                  onChange={(e) => setLocalLng(e.target.value)}
                  className="min-h-11 text-base"
                />
              </div>
            </div>
          )}
          {!coordinatesValid && (
            <p
              data-testid="base-coordinates-error"
              className="text-xs text-destructive"
            >
              {t('checkIn.coordinatesInvalid')}
            </p>
          )}

          <div>
            <label
              className="block text-xs text-muted-foreground mb-1"
              id="base-checkin-method-label"
            >
              {t('checkIn.method')}
            </label>
            <div
              className="flex gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-labelledby="base-checkin-method-label"
              data-testid="base-checkin-method"
            >
              {CHECK_IN_METHODS.map((method) => {
                const isActive = localMethod === method
                // A free plan keeps NFC and QR; location stays visible but
                // locked so the operator learns what the upgrade unlocks.
                const locked =
                  method === 'LOCATION' && !locationAllowed && !isActive
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={isActive}
                    aria-disabled={locked || undefined}
                    aria-describedby={
                      locked ? 'base-checkin-location-plan' : undefined
                    }
                    data-testid={`base-checkin-method-${method.toLowerCase()}`}
                    onClick={() => {
                      if (!locked) setLocalMethod(method)
                    }}
                    className={`min-h-11 flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
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
            {localMethod === game?.defaultCheckInMethod && (
              <p
                data-testid="base-checkin-inherits"
                className="mt-1 text-xs text-muted-foreground"
              >
                {t('checkIn.inheritsDefault')}
              </p>
            )}
            {!locationAllowed && localMethod !== 'LOCATION' && (
              <p
                id="base-checkin-location-plan"
                data-testid="base-checkin-location-plan"
                className="mt-1 text-xs text-muted-foreground"
              >
                {t('checkIn.locationPaid')}
              </p>
            )}
          </div>

          {localMethod === 'LOCATION' && (
            <div>
              <label
                htmlFor="base-checkin-radius"
                className="block text-xs text-muted-foreground mb-1"
              >
                {t('checkIn.radius')}
              </label>
              <Input
                id="base-checkin-radius"
                data-testid="base-checkin-radius"
                type="number"
                inputMode="numeric"
                min={MIN_CHECK_IN_RADIUS_M}
                max={MAX_CHECK_IN_RADIUS_M}
                value={localRadius}
                aria-invalid={!radiusValid}
                aria-describedby={
                  radiusValid ? undefined : 'base-checkin-radius-error'
                }
                onChange={(e) => setLocalRadius(e.target.value)}
                className="min-h-11 text-base"
              />
              {radiusValid ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('checkIn.radiusHint', { meters: gameDefaultRadius ?? 15 })}
                </p>
              ) : (
                <p
                  id="base-checkin-radius-error"
                  data-testid="base-checkin-radius-error"
                  className="mt-1 text-xs text-destructive"
                >
                  {t('checkIn.radiusInvalid')}
                </p>
              )}
            </div>
          )}

          {localMethod === 'QR' && (
            <div className="flex flex-col items-start gap-2">
              <QrCodeViewer
                value={printableTagUrl(base.id, base.nfcToken)}
                size={144}
                name={base.name}
                testId="base-qr-code"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="base-qr-print"
                onClick={() => setPrintOpen(true)}
              >
                {t('checkIn.printCode')}
              </Button>
            </div>
          )}

          {localMethod === 'NFC' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                NFC
              </label>
              <div className="flex flex-col gap-2">
                <NfcStatusBadge
                  status={base.nfcLinked ? 'linked' : 'missing'}
                />
                {isNative() ? (
                  <NfcLinkControl base={base} gameId={gameId} />
                ) : (
                  <>
                    <Button type="button" disabled>
                      {t('playerApp.nfcWrite.writeToTag')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('playerApp.nfcWrite.unavailable')}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {localMethod === 'LOCATION' && (
            <p className="text-xs text-muted-foreground">
              {t('checkIn.noTagNeeded')}
            </p>
          )}
        </div>
      </section>

      {/* Visibility section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('build.editor.visibility')}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setLocalHidden(false)}
            data-testid="visibility-visible"
            type="button"
            aria-pressed={!localHidden}
            className={`min-h-11 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              !localHidden
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            {t('build.editor.visible')}
          </button>
          <button
            onClick={() => setLocalHidden(true)}
            data-testid="visibility-hidden"
            type="button"
            aria-pressed={localHidden}
            className={`min-h-11 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              localHidden
                ? 'border border-warning/30 bg-warning/10 text-warning'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            {t('build.editor.hidden')}
          </button>
        </div>
      </section>

      {/* Tags section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('build.editor.tags')}
        </h3>
        <TagPicker
          gameId={gameId}
          selectedTagIds={base.tagIds ?? []}
          onChange={(tagIds) => {
            updateBase.mutate({
              baseId: base.id,
              dto: {
                name: base.name,
                description: base.description,
                lat: base.lat,
                lng: base.lng,
                hidden: base.hidden,
                tagIds,
                fixedChallengeId: base.fixedChallengeId,
              },
            })
          }}
        />
      </section>
      {/* Fixed Challenge */}
      {fixedChallenge && (
        <>
          <section className="border-t border-border pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                {t('build.fixedChallengeTitle')}
              </h3>
              <span className="text-xs text-muted-foreground">
                {t('build.fixedChallengeNote')}
              </span>
            </div>
            {fixedChallenge ? (
              <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pin className="h-4 w-4 text-primary" />
                  <button
                    onClick={() => void openChallengeAfterSave(fixedChallenge.id)}
                    className="text-sm text-primary hover:underline cursor-pointer"
                    data-testid="fixed-challenge-link"
                  >
                    {fixedChallenge.title}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No fixed challenge -- uses assignment rules
              </p>
            )}
          </section>
        </>
      )}
      {/* Save button: valid edits also save on their own after a pause. */}
      {(isDirty || saving) && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-card py-3 mt-4">
          <button
            onClick={handleSave}
            disabled={!canSave}
            data-testid="save-base-btn"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {t(saving ? 'build.compose.saving' : 'common.save')}
          </button>
        </div>
      )}

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="delete-base-btn"
          disabled={baseRouteLocked}
          className="disabled:cursor-not-allowed disabled:opacity-50 text-xs text-destructive hover:underline cursor-pointer"
        >
          {t('build.editor.deleteBase')}
        </button>
        {baseRouteLocked && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('baseOrder.setupOnly', {
              defaultValue: 'Base order can only be changed during setup.',
            })}
          </p>
        )}
      </div>

      <CodesPrintSheet
        open={printOpen}
        gameName={game?.name ?? ''}
        onClose={() => setPrintOpen(false)}
        codes={[
          {
            id: base.id,
            name: base.name,
            value: printableTagUrl(base.id, base.nfcToken),
          },
        ]}
      />
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false)
          if (baseRouteLocked) return
          deleteBase.mutate(baseId, { onSuccess: () => selectBase(null) })
        }}
        title={t('common.confirm.deleteBaseTitle')}
        description={deleteDescription}
      />
    </div>
  )
}
