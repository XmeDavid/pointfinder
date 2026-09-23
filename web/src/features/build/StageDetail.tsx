import { useState, useMemo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStages } from '@/hooks/queries/useStages'
import { useUpdateStage, useDeleteStage } from '@/hooks/mutations/useStageMutations'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { useUpdateBase } from '@/hooks/mutations/useBaseMutations'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useWorkspaceStore } from '@/stores/workspace'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ErrorState } from '@/components/feedback/ErrorState'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { CheckInMethodBadge, NfcStatusBadge } from '@/components/status'
import { resolveCheckInMethod } from '@/types/checkIn'
import { cn } from '@/lib/utils'
import type { TransitionType } from '@/types/stage'
import { BaseStatusDot } from './BaseStatusDot'

const TRANSITION_TYPES: TransitionType[] = ['scheduled', 'trigger', 'manual']

export default function StageDetail({
  stageId,
  gameId,
}: {
  stageId: string
  gameId: string
}) {
  const { t } = useTranslation()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const { data: game } = useGame(gameId)
  const { data: stagesData } = useStages(gameId)
  const { data: basesData } = useBases(gameId)
  const { data: assignmentsData } = useAssignments(gameId)
  const updateStage = useUpdateStage(gameId)
  const updateOrder = useUpdateStage(gameId)
  const deleteStage = useDeleteStage(gameId)
  const updateBase = useUpdateBase(gameId)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectStage = useWorkspaceStore((s) => s.selectStage)
  const openRouteEditor = useWorkspaceStore((s) => s.openRouteEditor)

  const [showAddBaseDropdown, setShowAddBaseDropdown] = useState(false)

  const stage = useMemo(
    () => (stagesData ?? []).find((s) => s.id === stageId),
    [stagesData, stageId],
  )

  const allBases = useMemo(() => basesData ?? [], [basesData])
  const assignments = assignmentsData ?? []

  // Local form state. A refetch (another save, the order switch, realtime)
  // replaces only the fields the operator has not edited; opening another
  // stage replaces them all.
  const serverForm = {
    name: stage?.name ?? '',
    description: stage?.description ?? '',
    transitionType: stage?.transitionType ?? ('manual' as TransitionType),
    scheduledAt: stage?.scheduledAt?.slice(0, 16) ?? '',
    triggerBaseId: stage?.triggerBaseId ?? '',
  }
  const [localName, setLocalName] = useState(serverForm.name)
  const [localDescription, setLocalDescription] = useState(serverForm.description)
  const [localTransitionType, setLocalTransitionType] = useState<TransitionType>(serverForm.transitionType)
  const [localScheduledAt, setLocalScheduledAt] = useState(serverForm.scheduledAt)
  const [localTriggerBaseId, setLocalTriggerBaseId] = useState(serverForm.triggerBaseId)
  const [prevServer, setPrevServer] = useState({ stageId, ...serverForm })
  const serverChanged = prevServer.stageId !== stageId
    || (Object.keys(serverForm) as (keyof typeof serverForm)[]).some((k) => prevServer[k] !== serverForm[k])
  if (serverChanged) {
    const reset = prevServer.stageId !== stageId
    const adopt = <K extends keyof typeof serverForm>(key: K, local: (typeof serverForm)[K], set: (v: (typeof serverForm)[K]) => void) => {
      if (reset || local === prevServer[key]) set(serverForm[key])
    }
    setPrevServer({ stageId, ...serverForm })
    adopt('name', localName, setLocalName)
    adopt('description', localDescription, setLocalDescription)
    adopt('transitionType', localTransitionType, setLocalTransitionType)
    adopt('scheduledAt', localScheduledAt, setLocalScheduledAt)
    adopt('triggerBaseId', localTriggerBaseId, setLocalTriggerBaseId)
  }

  // A stage is one route (OW-40): numbered bases in route order when enforced.
  const stageBases = useMemo(() => {
    const members = allBases.filter((b) => stage?.baseIds.includes(b.id))
    if (!stage?.enforceBaseOrder) return members
    return [...members].sort((a, b) => (a.sequenceNumber ?? Number.MAX_SAFE_INTEGER) - (b.sequenceNumber ?? Number.MAX_SAFE_INTEGER))
  }, [allBases, stage?.baseIds, stage?.enforceBaseOrder])

  // Bases not in this stage (available to add/move here)
  const availableBases = useMemo(() => {
    return allBases.filter((b) => b.stageId !== stageId)
  }, [allBases, stageId])

  // Bases available for trigger selection (from previous stages)
  const previousStageBases = useMemo(() => {
    if (!stage || !stagesData) return []
    const sorted = stagesData
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
    const currentIdx = sorted.findIndex((s) => s.id === stageId)
    if (currentIdx <= 0) return []
    const prevBaseIds = new Set(
      sorted.slice(0, currentIdx).flatMap((s) => s.baseIds),
    )
    return allBases.filter((b) => prevBaseIds.has(b.id))
  }, [stagesData, stageId, stage, allBases])

  const handleSave = useCallback(() => {
    updateStage.mutate({
      stageId,
      dto: {
        name: localName,
        description: localDescription || null,
        transitionType: localTransitionType,
        scheduledAt:
          localTransitionType === 'scheduled' && localScheduledAt
            ? new Date(localScheduledAt).toISOString()
            : null,
        triggerBaseId:
          localTransitionType === 'trigger' && localTriggerBaseId
            ? localTriggerBaseId
            : null,
      },
    })
  }, [
    updateStage,
    stageId,
    localName,
    localDescription,
    localTransitionType,
    localScheduledAt,
    localTriggerBaseId,
  ])

  if (!stage) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {t('build.stageNotFound')}
      </div>
    )
  }

  // The order switch saves on its own, with the stage as the server has it, so
  // unsaved name or transition edits are not sent along with it.
  const setEnforceOrder = (enforceBaseOrder: boolean) =>
    updateOrder.mutate({
      stageId,
      dto: {
        name: stage.name,
        description: stage.description,
        transitionType: stage.transitionType,
        scheduledAt: stage.scheduledAt,
        triggerBaseId: stage.triggerBaseId,
        enforceBaseOrder,
      },
    })
  const orderLocked = game?.status !== 'setup'
  const stageBaseCount = stageBases.length
  const deleteDescription =
    t('common.confirm.deleteStageDescription') +
    (stageBaseCount > 0
      ? ' ' + t('common.confirm.deleteStageCascade', { count: stageBaseCount })
      : '')

  return (
    <div className="p-4 space-y-0" data-testid="stage-detail">
      {/* Identity section */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('build.stageEditor.identity')}
        </h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="stage-name" className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.name')}
            </label>
            <Input
              id="stage-name"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              data-testid="stage-name-input"
              className="min-h-11 text-base sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="stage-description" className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.description')}
            </label>
            <Textarea
              id="stage-description"
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={3}
              data-testid="stage-description-input"
              className="text-sm resize-none"
            />
          </div>
        </div>
      </section>

      {/* Transition Rule section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('build.stageEditor.transition')}
        </h3>
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={t('build.stageEditor.transition')}>
          {TRANSITION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setLocalTransitionType(type)}
              aria-pressed={localTransitionType === type}
              data-testid={`transition-type-${type}`}
              className={cn(
                'min-h-11 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border',
                localTransitionType === type
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground',
              )}
            >
              {t(`build.stageEditor.transitionType.${type}`)}
            </button>
          ))}
        </div>

        {localTransitionType === 'scheduled' && (
          <div>
            <label htmlFor="stage-scheduled-at" className="block text-xs text-muted-foreground mb-1">
              {t('build.stageEditor.scheduledAt')}
            </label>
            <Input
              id="stage-scheduled-at"
              type="datetime-local"
              value={localScheduledAt}
              onChange={(e) => setLocalScheduledAt(e.target.value)}
              data-testid="scheduled-at-input"
              className="min-h-11 text-base sm:text-sm"
            />
          </div>
        )}

        {localTransitionType === 'trigger' && (
          <div>
            <label htmlFor="stage-trigger-base" className="block text-xs text-muted-foreground mb-1">
              {t('build.stageEditor.triggerBase')}
            </label>
            {previousStageBases.length > 0 ? (
              <Select
                id="stage-trigger-base"
                value={localTriggerBaseId}
                onChange={(e) => setLocalTriggerBaseId(e.target.value)}
                data-testid="trigger-base-select"
                className="min-h-11 text-base sm:text-sm"
              >
                <option value="">{t('build.selectTriggerBase')}</option>
                {previousStageBases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('build.stageEditor.noPreviousBases')}
              </p>
            )}
          </div>
        )}

        {localTransitionType === 'manual' && (
          <p className="text-xs text-muted-foreground">
            {t('build.stageEditor.manualHint')}
          </p>
        )}
      </section>

      {/* Base order: this stage is its own route (OW-40). */}
      <section className="border-t border-border pt-4 mt-4 space-y-2" data-testid="stage-base-order">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('build.stageEditor.order')}
        </h3>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor="stage-enforce-base-order" className="flex-1 cursor-pointer py-2 text-sm">
            {t('build.stageEditor.enforceOrder')}
          </label>
          <Switch
            id="stage-enforce-base-order"
            checked={stage.enforceBaseOrder}
            disabled={orderLocked || updateOrder.isPending}
            onCheckedChange={setEnforceOrder}
            data-testid="stage-enforce-base-order-switch"
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('build.stageEditor.enforceOrderHint')}</p>
        {orderLocked && <p className="text-xs text-muted-foreground">{t('baseOrder.setupOnly')}</p>}
        {updateOrder.isError && (
          <ErrorState className="h-auto p-2" title={t('baseOrder.settingsError')} />
        )}
        {stage.enforceBaseOrder && !orderLocked && stageBases.length >= 2 && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 whitespace-normal"
            onClick={openRouteEditor}
            data-testid="stage-arrange-route-btn"
          >
            {t('baseOrder.arrange')}
          </Button>
        )}
      </section>

      {/* Bases in this stage section */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('build.stageEditor.bases', { count: stageBases.length })}
          </h3>
        </div>

        {stageBases.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('build.stageEditor.noBases')}
          </p>
        ) : (
          <ol className="space-y-2" data-testid="stage-bases-list">
            {stageBases.map((base) => {
              const challengeCount = new Set(
                assignments
                  .filter((a) => a.baseId === base.id)
                  .map((a) => a.challengeId),
              ).size
              const method = resolveCheckInMethod(base.checkInMethod)

              return (
                <li
                  key={base.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {stage.enforceBaseOrder && <BaseSequenceBadge sequenceNumber={base.sequenceNumber} />}
                    <BaseStatusDot base={base} />
                    <button
                      type="button"
                      onClick={() => selectBase(base.id)}
                      className="min-w-0 flex-1 text-sm font-medium text-primary hover:underline cursor-pointer text-left truncate"
                      data-testid={`stage-base-link-${base.id}`}
                    >
                      {base.name}
                    </button>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {t('build.baseSubtitle.challenges', { count: challengeCount })}
                    </span>
                    {method === 'NFC'
                      ? <NfcStatusBadge status={base.nfcLinked ? 'linked' : 'missing'} className="shrink-0" />
                      : <CheckInMethodBadge method={method} size="sm" className="shrink-0" />}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setShowAddBaseDropdown((v) => !v)}
            disabled={availableBases.length === 0}
            aria-expanded={showAddBaseDropdown}
            data-testid="add-existing-base-btn"
            className="w-full min-h-11 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground border border-dashed border-border hover:border-muted-foreground hover:text-foreground rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('build.stageEditor.addExisting')}
          </button>
          {showAddBaseDropdown && availableBases.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {availableBases.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    updateBase.mutate({
                      baseId: b.id,
                      dto: {
                        name: b.name,
                        description: b.description ?? '',
                        lat: b.lat,
                        lng: b.lng,
                        hidden: b.hidden,
                        stageId: stageId,
                      },
                    })
                    setShowAddBaseDropdown(false)
                  }}
                  data-testid={`add-base-option-${b.id}`}
                  className="w-full min-h-11 text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {updateBase.isError && (
          <ErrorState className="mt-2 h-auto p-2" title={t('common.error')} />
        )}
      </section>

      {/* Save button */}
      <section className="border-t border-border pt-4 mt-4 space-y-2">
        <Button
          onClick={handleSave}
          loading={updateStage.isPending}
          data-testid="stage-save-btn"
          className="w-full min-h-11"
        >
          {updateStage.isPending ? t('common.saving') : t('build.stageEditor.save')}
        </Button>
        {updateStage.isError && (
          <ErrorState className="h-auto p-2" title={t('build.stageEditor.saveError')} />
        )}
      </section>

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="delete-stage-btn"
          className="min-h-11 text-sm text-destructive hover:underline cursor-pointer"
        >
          {t('build.stageEditor.delete')}
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false)
          deleteStage.mutate(stageId, { onSuccess: () => selectStage(null) })
        }}
        title={t('common.confirm.deleteStageTitle')}
        description={deleteDescription}
      />
    </div>
  )
}
