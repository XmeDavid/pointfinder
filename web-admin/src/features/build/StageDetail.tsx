import { useState, useMemo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useStages } from '@/hooks/queries/useStages'
import { useUpdateStage, useDeleteStage } from '@/hooks/mutations/useStageMutations'
import { useBases } from '@/hooks/queries/useBases'
import { useUpdateBase } from '@/hooks/mutations/useBaseMutations'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useWorkspaceStore } from '@/stores/workspace'
import type { TransitionType } from '@/types/stage'
import type { Base } from '@/types/base'

function BaseStatusDot({ base }: { base: Base }) {
  if (base.hidden) {
    const color = base.nfcLinked
      ? 'border-primary/60 bg-primary/20'
      : 'border-destructive/60 bg-destructive/20'
    const title = base.nfcLinked ? 'Hidden (NFC linked)' : 'Hidden (missing NFC)'
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full border border-dashed shrink-0 ${color}`}
        title={title}
      />
    )
  }
  if (!base.nfcLinked) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0"
        title="Missing NFC"
      />
    )
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-primary shrink-0"
      title="Ready"
    />
  )
}

export default function StageDetail({
  stageId,
  gameId,
}: {
  stageId: string
  gameId: string
}) {
  const { data: stagesData } = useStages(gameId)
  const { data: basesData } = useBases(gameId)
  const { data: assignmentsData } = useAssignments(gameId)
  const updateStage = useUpdateStage(gameId)
  const deleteStage = useDeleteStage(gameId)
  const updateBase = useUpdateBase(gameId)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectStage = useWorkspaceStore((s) => s.selectStage)

  const [showAddBaseDropdown, setShowAddBaseDropdown] = useState(false)

  const stage = useMemo(
    () => (stagesData ?? []).find((s) => s.id === stageId),
    [stagesData, stageId],
  )

  const allBases = useMemo(() => basesData ?? [], [basesData])
  const assignments = assignmentsData ?? []

  // Local form state
  const [localName, setLocalName] = useState(stage?.name ?? '')
  const [localDescription, setLocalDescription] = useState(
    stage?.description ?? '',
  )
  const [localTransitionType, setLocalTransitionType] = useState<TransitionType>(
    stage?.transitionType ?? 'manual',
  )
  const [localScheduledAt, setLocalScheduledAt] = useState(
    stage?.scheduledAt?.slice(0, 16) ?? '',
  )
  const [localTriggerBaseId, setLocalTriggerBaseId] = useState(
    stage?.triggerBaseId ?? '',
  )

  // Reset local state when stage changes or data first loads
  const [prevStageKey, setPrevStageKey] = useState(`${stageId}-${stage?.updatedAt ?? ''}`)
  const stageKey = `${stageId}-${stage?.updatedAt ?? ''}`
  if (stageKey !== prevStageKey) {
    setPrevStageKey(stageKey)
    setLocalName(stage?.name ?? '')
    setLocalDescription(stage?.description ?? '')
    setLocalTransitionType(stage?.transitionType ?? 'manual')
    setLocalScheduledAt(stage?.scheduledAt?.slice(0, 16) ?? '')
    setLocalTriggerBaseId(stage?.triggerBaseId ?? '')
  }

  const stageBases = useMemo(
    () => allBases.filter((b) => stage?.baseIds.includes(b.id)),
    [allBases, stage?.baseIds],
  )

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
        Stage not found
      </div>
    )
  }

  return (
    <div className="p-4 space-y-0" data-testid="stage-detail">
      {/* Identity section */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Identity
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Name
            </label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              data-testid="stage-name-input"
              className="w-full h-8 px-3 text-sm rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Description
            </label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={3}
              data-testid="stage-description-input"
              className="w-full px-3 py-2 text-sm rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring resize-none"
            />
          </div>
        </div>
      </section>

      {/* Transition Rule section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Transition Rule
        </h3>
        <div className="flex gap-2 mb-3">
          {(['scheduled', 'trigger', 'manual'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setLocalTransitionType(type)}
              data-testid={`transition-type-${type}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer capitalize ${
                localTransitionType === type
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-background text-muted-foreground border border-border hover:text-foreground'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {localTransitionType === 'scheduled' && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Scheduled at
            </label>
            <input
              type="datetime-local"
              value={localScheduledAt}
              onChange={(e) => setLocalScheduledAt(e.target.value)}
              data-testid="scheduled-at-input"
              className="w-full h-8 px-3 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
            />
          </div>
        )}

        {localTransitionType === 'trigger' && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Trigger base (from previous stages)
            </label>
            {previousStageBases.length > 0 ? (
              <select
                value={localTriggerBaseId}
                onChange={(e) => setLocalTriggerBaseId(e.target.value)}
                data-testid="trigger-base-select"
                className="w-full h-8 px-3 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
              >
                <option value="">Select a base...</option>
                {previousStageBases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                No bases available from previous stages
              </p>
            )}
          </div>
        )}

        {localTransitionType === 'manual' && (
          <p className="text-xs text-muted-foreground">
            Activated by operator
          </p>
        )}
      </section>

      {/* Bases in this stage section */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Bases in this stage{' '}
            <span className="font-normal">({stageBases.length})</span>
          </h3>
        </div>

        {stageBases.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No bases in this stage yet
          </p>
        ) : (
          <div className="space-y-2" data-testid="stage-bases-list">
            {stageBases.map((base) => {
              const challengeCount = new Set(
                assignments
                  .filter((a) => a.baseId === base.id)
                  .map((a) => a.challengeId),
              ).size

              return (
                <div
                  key={base.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-2">
                    <BaseStatusDot base={base} />
                    <button
                      onClick={() => selectBase(base.id)}
                      className="text-sm font-medium text-primary hover:underline cursor-pointer text-left truncate"
                      data-testid={`stage-base-link-${base.id}`}
                    >
                      {base.name}
                    </button>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {challengeCount === 1
                        ? '1 challenge'
                        : `${challengeCount} challenges`}
                    </span>
                    {base.nfcLinked ? (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary">
                        NFC
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive">
                        No NFC
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="relative mt-3">
          <button
            onClick={() => setShowAddBaseDropdown((v) => !v)}
            disabled={availableBases.length === 0}
            data-testid="add-existing-base-btn"
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-dashed border-border hover:border-muted-foreground hover:text-foreground rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" />
            Add existing base
          </button>
          {showAddBaseDropdown && availableBases.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {availableBases.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    updateBase.mutate({
                      baseId: b.id,
                      dto: {
                        name: b.name,
                        description: b.description ?? '',
                        lat: b.lat,
                        lng: b.lng,
                        hidden: b.hidden,
                        nfcLinked: b.nfcLinked,
                        stageId: stageId,
                      },
                    })
                    setShowAddBaseDropdown(false)
                  }}
                  data-testid={`add-base-option-${b.id}`}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Save button */}
      <section className="border-t border-border pt-4 mt-4">
        <button
          onClick={handleSave}
          disabled={updateStage.isPending}
          data-testid="stage-save-btn"
          className="w-full px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {updateStage.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </section>

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          onClick={() => {
            if (confirm('Delete this stage?')) {
              deleteStage.mutate(stageId, { onSuccess: () => selectStage(null) })
            }
          }}
          data-testid="delete-stage-btn"
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          Delete stage
        </button>
      </div>
    </div>
  )
}
