import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/feedback/ErrorState'
import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { useReorderBases } from '@/hooks/mutations/useBaseMutations'
import type { Base } from '@/types'
import { DEFAULT_ROUTE_KEY, type BaseRouteGroup } from './baseRoutes'

type Draft = Record<string, string[]>

function draftOf(routes: BaseRouteGroup[]): Draft {
  return Object.fromEntries(routes.map((r) => [r.key, r.bases.map((b) => b.id)]))
}

/**
 * Arranges each enforced route (OW-40): a stage's bases, or the bases without
 * a stage. Bases move only within their route; the save sends every base of
 * the game once, routes in the server's order, which numbers each route from 1.
 */
export function BaseRouteEditor({ gameId, bases, routes, editable, onClose }: {
  gameId: string
  /** Every base of the game, including bases excluded by the list's search. */
  bases: Base[]
  /** The game's routes; without them all bases form one enforced route. */
  routes?: BaseRouteGroup[]
  editable: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const reorder = useReorderBases(gameId)
  const groups: BaseRouteGroup[] = routes ?? [{ key: DEFAULT_ROUTE_KEY, stageId: null, name: null, enforced: true, bases }]
  const [original] = useState(() => draftOf(groups))
  const [draft, setDraft] = useState<Draft>(original)
  const dragged = useRef<{ route: string; id: string } | null>(null)
  const current = draftOf(groups)
  const flatten = (d: Draft) => groups.flatMap((g) => d[g.key] ?? [])
  const changedElsewhere = !reorder.isPending && (
    JSON.stringify(Object.keys(current).sort()) !== JSON.stringify(Object.keys(original).sort())
    || groups.some((g) => (current[g.key] ?? []).join(',') !== (original[g.key] ?? []).join(','))
  )
  const disabled = !editable || reorder.isPending || changedElsewhere
  const dirty = groups.some((g) => (draft[g.key] ?? []).join(',') !== (original[g.key] ?? []).join(','))
  const enforced = groups.filter((g) => g.enforced)
  const unordered = groups.filter((g) => !g.enforced)
  const staged = groups.some((g) => g.stageId !== null)

  function move(route: string, id: string, targetIndex: number) {
    if (disabled) return
    setDraft((d) => {
      const ids = (d[route] ?? []).filter((item) => item !== id)
      ids.splice(targetIndex, 0, id)
      return { ...d, [route]: ids }
    })
  }

  const routeTitle = (group: BaseRouteGroup) => group.name ?? t('baseOrder.noStageRoute')

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('baseOrder.arrange')} data-testid="base-route-editor">
      <div className="space-y-2 border-b border-border p-3">
        <h3 className="text-sm font-semibold">{t('baseOrder.arrange')}</h3>
        <p className="text-xs text-muted-foreground">{t(staged ? 'baseOrder.stageRoutesDescription' : 'baseOrder.routeDescription')}</p>
        {!editable && <p className="text-xs text-muted-foreground">{t('baseOrder.setupOnly')}</p>}
        {changedElsewhere && <ErrorState className="h-auto p-2" title={t('baseOrder.routeChanged')} />}
        {reorder.isError && <ErrorState className="h-auto p-2" title={t('baseOrder.saveError')} />}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {enforced.map((group) => {
          const ids = draft[group.key] ?? []
          const headingId = `route-heading-${group.key}`
          return (
            <section key={group.key} className="mb-3" aria-labelledby={staged ? headingId : undefined} data-testid={`route-group-${group.key}`}>
              {staged && (
                <h4 id={headingId} className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {routeTitle(group)}
                </h4>
              )}
              <ol aria-label={staged ? routeTitle(group) : t('baseOrder.arrange')}>
                {ids.map((id, index) => {
                  const base = group.bases.find((item) => item.id === id)
                  if (!base) return null
                  return (
                    <li key={id} className="flex items-center gap-1 border-b border-border py-2" data-testid={`route-base-${id}`}
                      onDragOver={(event) => { if (!disabled && dragged.current?.route === group.key) event.preventDefault() }}
                      onDrop={(event) => {
                        event.preventDefault()
                        // A base stays in its own route; drops from another route are ignored.
                        if (dragged.current?.route === group.key) move(group.key, dragged.current.id, index)
                        dragged.current = null
                      }}>
                      <span draggable={!disabled} className="flex shrink-0 cursor-grab items-center p-1 text-muted-foreground"
                        title={t('baseOrder.drag', { name: base.name })}
                        onDragStart={(event) => { dragged.current = { route: group.key, id }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }}
                        onDragEnd={() => { dragged.current = null }}>
                        <GripVertical size={16} aria-hidden="true" />
                      </span>
                      <BaseSequenceBadge sequenceNumber={index + 1} />
                      <span className="min-w-0 flex-1 break-words text-sm">{base.name}</span>
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={disabled || index === 0}
                          aria-label={t('baseOrder.moveUp', { name: base.name })}
                          onClick={() => move(group.key, id, index - 1)}><ArrowUp size={16} aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={disabled || index === ids.length - 1}
                          aria-label={t('baseOrder.moveDown', { name: base.name })}
                          onClick={() => move(group.key, id, index + 1)}><ArrowDown size={16} aria-hidden="true" /></Button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
        {unordered.length > 0 && (
          <p className="px-1 pt-1 text-xs text-muted-foreground" data-testid="route-unordered-note">
            {t('baseOrder.anyOrderRoutes', { routes: unordered.map(routeTitle).join(', ') })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border p-3">
        <Button variant="outline" disabled={reorder.isPending} onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={disabled || !dirty} loading={reorder.isPending}
          onClick={() => reorder.mutate(flatten(draft), { onSuccess: onClose })}>{reorder.isPending ? t('common.saving') : t('common.save')}</Button>
      </div>
    </section>
  )
}
