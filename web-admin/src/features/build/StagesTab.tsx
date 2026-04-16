import { useMemo } from 'react'
import { GripVertical, Plus, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStages } from '@/hooks/queries/useStages'
import { useCreateStage } from '@/hooks/mutations/useStageMutations'
import { useBases } from '@/hooks/queries/useBases'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useWorkspaceStore } from '@/stores/workspace'
import { useToast } from '@/hooks/useToast'
import type { Stage } from '@/types/stage'
import type { Base } from '@/types/base'
import type { Assignment } from '@/types/assignment'
import StageDetail from './StageDetail'

function useStageSubtitle(
  stage: Stage,
  bases: Base[],
  assignments: Assignment[],
) {
  return useMemo(() => {
    const stageBases = bases.filter((b) => stage.baseIds.includes(b.id))
    const baseIds = new Set(stageBases.map((b) => b.id))
    const challengeIds = new Set(
      assignments
        .filter((a) => baseIds.has(a.baseId))
        .map((a) => a.challengeId),
    )

    const baseCount = stageBases.length
    const challengeCount = challengeIds.size

    const baseText = baseCount === 1 ? '1 base' : `${baseCount} bases`
    const challengeText =
      challengeCount === 1 ? '1 challenge' : `${challengeCount} challenges`

    return `${baseText} \u00B7 ${challengeText}`
  }, [stage.baseIds, bases, assignments])
}

function useTransitionSummary(stage: Stage, bases: Base[]) {
  return useMemo(() => {
    if (stage.transitionType === 'scheduled' && stage.scheduledAt) {
      const time = new Date(stage.scheduledAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      return `Scheduled ${time}`
    }
    if (stage.transitionType === 'trigger' && stage.triggerBaseId) {
      const base = bases.find((b) => b.id === stage.triggerBaseId)
      return `Trigger: ${base?.name ?? 'Unknown base'}`
    }
    return 'Manual'
  }, [stage.transitionType, stage.scheduledAt, stage.triggerBaseId, bases])
}

function StageListItem({
  stage,
  isSelected,
  onSelect,
  bases,
  assignments,
}: {
  stage: Stage
  isSelected: boolean
  onSelect: () => void
  bases: Base[]
  assignments: Assignment[]
}) {
  const subtitle = useStageSubtitle(stage, bases, assignments)
  const transition = useTransitionSummary(stage, bases)

  return (
    <button
      onClick={onSelect}
      data-testid={`stage-item-${stage.id}`}
      className={`w-full text-left px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
        isSelected
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-muted border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {stage.name}
        </span>
      </div>
      <div className="mt-0.5 ml-[22px] text-xs text-muted-foreground">
        {subtitle}
      </div>
      <div className="mt-0.5 ml-[22px] text-[10px] text-muted-foreground italic">
        {transition}
      </div>
    </button>
  )
}

export default function StagesTab({ gameId }: { gameId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: stagesData } = useStages(gameId)
  const { data: basesData } = useBases(gameId)
  const { data: assignmentsData } = useAssignments(gameId)
  const createStage = useCreateStage(gameId)

  const selectedStageId = useWorkspaceStore((s) => s.selectedStageId)
  const selectStage = useWorkspaceStore((s) => s.selectStage)

  const stages = useMemo(
    () =>
      (stagesData ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex),
    [stagesData],
  )

  const bases = basesData ?? []
  const assignments = assignmentsData ?? []

  const handleCreateStage = () => {
    createStage.mutate(
      {
        name: `Stage ${stages.length + 1}`,
        transitionType: 'manual',
      },
      {
        onError: (err) => {
          console.error('Failed to create stage:', err)
          const message = (err as Error).message ?? t('common.unknownError')
          toast.error(t('build.stage.createFailed', { err: message }))
        },
      },
    )
  }

  return (
    <div className="flex flex-1 min-h-0" data-testid="stages-tab">
      {/* Left panel -- stage list */}
      <div className="w-56 border-r border-border flex flex-col shrink-0">
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {stages.map((stage) => (
            <StageListItem
              key={stage.id}
              stage={stage}
              isSelected={selectedStageId === stage.id}
              onSelect={() => selectStage(stage.id)}
              bases={bases}
              assignments={assignments}
            />
          ))}
          {stages.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              {t('build.noStagesYet', 'No stages yet')}
            </div>
          )}
        </div>

        {/* Add button */}
        <div className="p-2 border-t border-border">
          <button
            onClick={handleCreateStage}
            data-testid="create-stage-btn"
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New Stage
          </button>
        </div>
      </div>

      {/* Right panel -- detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedStageId ? (
          <StageDetail stageId={selectedStageId} gameId={gameId} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <Layers className="h-8 w-8 mx-auto opacity-40" />
              <p>{t('build.selectStagePrompt')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
