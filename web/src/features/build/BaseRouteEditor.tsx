import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/feedback/ErrorState'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { useReorderBases } from '@/hooks/mutations/useBaseMutations'
import type { Base } from '@/types'

/** Draft contains every base, including bases excluded by the list's search. */
export function BaseRouteEditor({ gameId, bases, editable, onClose }: {
  gameId: string
  bases: Base[]
  editable: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const reorder = useReorderBases(gameId)
  const [originalIds] = useState(() => bases.map((base) => base.id))
  const [draftIds, setDraftIds] = useState(originalIds)
  const draggedId = useRef<string | null>(null)
  const currentIds = bases.map((base) => base.id)
  const changedElsewhere = !reorder.isPending && currentIds.join(',') !== originalIds.join(',')
  const disabled = !editable || reorder.isPending || changedElsewhere
  const dirty = draftIds.some((id, index) => id !== originalIds[index])

  function move(id: string, targetIndex: number) {
    if (disabled) return
    setDraftIds((ids) => {
      const result = ids.filter((item) => item !== id)
      result.splice(targetIndex, 0, id)
      return result
    })
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('baseOrder.arrange', { defaultValue: 'Arrange route' })} data-testid="base-route-editor">
      <div className="space-y-2 border-b border-border p-3">
        <h3 className="text-sm font-semibold">{t('baseOrder.arrange', { defaultValue: 'Arrange route' })}</h3>
        <p className="text-xs text-muted-foreground">{t('baseOrder.routeDescription', { defaultValue: 'One route for all teams. Challenges can differ per team. Drag bases or use the arrows, then save.' })}</p>
        {!editable && <p className="text-xs text-muted-foreground">{t('baseOrder.setupOnly', { defaultValue: 'Base order can only be changed during setup.' })}</p>}
        {changedElsewhere && <ErrorState className="h-auto p-2" title={t('baseOrder.routeChanged', { defaultValue: 'The route changed while you were editing. Cancel and reopen to use the latest route.' })} />}
        {reorder.isError && <ErrorState className="h-auto p-2" title={t('baseOrder.saveError', { defaultValue: 'Could not save the route. Your changes are still here; try saving again.' })} />}
      </div>
      <ol className="flex-1 overflow-y-auto p-2" aria-label={t('baseOrder.arrange', { defaultValue: 'Arrange route' })}>
        {draftIds.map((id, index) => {
          const base = bases.find((item) => item.id === id)
          if (!base) return null
          return (
            <li key={id} className="flex items-center gap-1 border-b border-border py-2" data-testid={`route-base-${id}`}
              onDragOver={(event) => { if (!disabled && draggedId.current) event.preventDefault() }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedId.current) move(draggedId.current, index)
                draggedId.current = null
              }}>
              <span draggable={!disabled} className="flex shrink-0 cursor-grab items-center p-1 text-muted-foreground"
                title={t('baseOrder.drag', { name: base.name, defaultValue: 'Drag {{name}} to reorder' })}
                onDragStart={(event) => { draggedId.current = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }}
                onDragEnd={() => { draggedId.current = null }}>
                <GripVertical size={16} aria-hidden="true" />
              </span>
              <BaseSequenceBadge sequenceNumber={index + 1} />
              <span className="min-w-0 flex-1 break-words text-sm">{base.name}</span>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" className="h-11 w-11" disabled={disabled || index === 0}
                  aria-label={t('baseOrder.moveUp', { name: base.name, defaultValue: 'Move {{name}} up' })}
                  onClick={() => move(id, index - 1)}><ArrowUp size={16} aria-hidden="true" /></Button>
                <Button variant="ghost" size="icon" className="h-11 w-11" disabled={disabled || index === draftIds.length - 1}
                  aria-label={t('baseOrder.moveDown', { name: base.name, defaultValue: 'Move {{name}} down' })}
                  onClick={() => move(id, index + 1)}><ArrowDown size={16} aria-hidden="true" /></Button>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border p-3">
        <Button variant="outline" disabled={reorder.isPending} onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={disabled || !dirty} loading={reorder.isPending}
          onClick={() => reorder.mutate(draftIds, { onSuccess: onClose })}>{reorder.isPending ? t('common.saving') : t('common.save')}</Button>
      </div>
    </section>
  )
}
