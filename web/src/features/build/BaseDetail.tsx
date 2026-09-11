import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, Pin, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TagPicker } from '@/components/data/TagPicker'
import { useWorkspaceStore } from '@/stores/workspace'
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

  // Local form state
  const methodLabel = useCheckInMethodLabel()
  const locationAllowed = isLocationCheckInAllowed(game)
  const [localName, setLocalName] = useState(base?.name ?? '')
  const [localDescription, setLocalDescription] = useState(
    base?.description ?? '',
  )
  const [localLat, setLocalLat] = useState(base?.lat?.toString() ?? '')
  const [localLng, setLocalLng] = useState(base?.lng?.toString() ?? '')
  const [localHidden, setLocalHidden] = useState(base?.hidden ?? false)
  const [localMethod, setLocalMethod] = useState<CheckInMethod>(
    base?.checkInMethod ?? 'NFC',
  )
  const [localRadius, setLocalRadius] = useState(
    base?.checkInRadiusM != null ? String(base.checkInRadiusM) : '',
  )
  const [preciseCoordinatesOpen, setPreciseCoordinatesOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Reset local state when base changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalName(base?.name ?? '')
    setLocalDescription(base?.description ?? '')
    setLocalLat(base?.lat?.toString() ?? '')
    setLocalLng(base?.lng?.toString() ?? '')
    setLocalHidden(base?.hidden ?? false)
    setLocalMethod(base?.checkInMethod ?? 'NFC')
    setLocalRadius(
      base?.checkInRadiusM != null ? String(base.checkInRadiusM) : '',
    )
    setPreciseCoordinatesOpen(false)
  }, [
    baseId,
    base?.name,
    base?.description,
    base?.lat,
    base?.lng,
    base?.hidden,
    base?.checkInMethod,
    base?.checkInRadiusM,
  ])

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

  const isDirty =
    localName !== (base?.name ?? '') ||
    localDescription !== (base?.description ?? '') ||
    localLat !== (base?.lat?.toString() ?? '') ||
    localLng !== (base?.lng?.toString() ?? '') ||
    localHidden !== (base?.hidden ?? false) ||
    localMethod !== (base?.checkInMethod ?? 'NFC') ||
    localRadius !==
      (base?.checkInRadiusM != null ? String(base.checkInRadiusM) : '')

  const canSave = coordinatesValid && radiusValid && !updateBase.isPending

  const handleSave = () => {
    if (!base || !canSave || !parsedRadius.ok) return
    updateBase.mutate({
      baseId: base.id,
      dto: {
        name: localName,
        description: localDescription,
        lat: parsedLat,
        lng: parsedLng,
        hidden: localHidden,
        tagIds: base.tagIds,
        fixedChallengeId: base.fixedChallengeId,
        checkInMethod: localMethod,
        checkInRadiusM: localMethod === 'LOCATION' ? parsedRadius.value : null,
      },
    })
  }

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
        </div>
      </section>

      <BaseAssignmentSection
        key={baseId}
        gameId={gameId}
        baseId={baseId}
        assignments={assignments}
        challenges={challenges}
        teams={teams}
        onOpenChallenge={(id) => openBaseChallenge(baseId, id)}
      />

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
                    onClick={() => openBaseChallenge(baseId, fixedChallenge.id)}
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
      {/* Save button */}
      {isDirty && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-card py-3 mt-4">
          <button
            onClick={handleSave}
            disabled={!canSave}
            data-testid="save-base-btn"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {t(updateBase.isPending ? 'build.compose.saving' : 'common.save')}
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
