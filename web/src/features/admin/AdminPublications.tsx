import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import type { GamePublicationResponse } from '@pointfinder/api'
import { adminApi } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { GameStatusBadge, StatusBadge } from '@/components/status'
import { LoadingState } from '@/components/feedback/LoadingState'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ContentLanguageTag } from '@/components/data/ContentLanguageTag'

const QUERY_KEY = ['admin', 'publications'] as const

/**
 * OW-06: platform-admin curation of Explore. Featuring is a flag on a listed
 * publication. Removing a listing delists it and holds it (owner decision
 * 2026-09-24): the game, its players and the draft summary stay, and the
 * organizer cannot list it again until an admin allows it here.
 */
export function AdminPublications() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [listedOnly, setListedOnly] = useState(true)
  const [removing, setRemoving] = useState<GamePublicationResponse | null>(null)
  const publications = useQuery({ queryKey: QUERY_KEY, queryFn: adminApi.listPublications })

  const refresh = (updated: GamePublicationResponse) => {
    queryClient.setQueryData<GamePublicationResponse[]>(QUERY_KEY, (current) =>
      current?.map((p) => (p.gameId === updated.gameId ? updated : p)))
    // Explore's own featured and search lists follow the change.
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes('explore') })
  }
  const feature = useMutation({
    mutationFn: ({ gameId, featured }: { gameId: string; featured: boolean }) => adminApi.setFeatured(gameId, featured),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (gameId: string) => adminApi.removeFromExplore(gameId), onSuccess: refresh })
  const release = useMutation({ mutationFn: (gameId: string) => adminApi.releaseListing(gameId), onSuccess: refresh })
  const busyId = (feature.isPending ? feature.variables?.gameId : undefined)
    ?? (remove.isPending ? remove.variables : undefined)
    ?? (release.isPending ? release.variables : undefined)

  const rows = useMemo(() => {
    const all = publications.data ?? []
    const shown = listedOnly ? all.filter((p) => p.listed) : all
    // Featured first, then listed, then the most recently published.
    return [...shown].sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.listed) - Number(a.listed)
      || (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
  }, [publications.data, listedOnly])

  return (
    <div data-testid="admin-publications">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{t('admin.publications.intro')}</p>
      <div className="mb-4 flex min-h-11 items-center gap-3">
        <Switch id="admin-publications-listed" checked={listedOnly} onCheckedChange={setListedOnly} />
        <label htmlFor="admin-publications-listed" className="text-sm">{t('admin.publications.filterListed')}</label>
      </div>
      {(feature.isError || remove.isError || release.isError) && (
        <p role="alert" className="mb-3 text-sm text-destructive">{t('admin.publications.actionError')}</p>
      )}
      {publications.isPending && <LoadingState label={t('common.loading')} />}
      {publications.isError && (
        <ErrorState title={t('admin.publications.loadError')} retryLabel={t('common.retry')} onRetry={() => void publications.refetch()} />
      )}
      {publications.isSuccess && rows.length === 0 && (
        <EmptyState density="compact" title={t('admin.publications.empty')} />
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.gameId} className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3 md:flex-row md:items-center" data-testid={`admin-publication-${p.gameId}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-foreground">{p.title || p.gameName}</p>
                  <GameStatusBadge status={p.gameStatus} />
                  <StatusBadge size="sm" tone={p.listed ? 'success' : 'muted'} label={t(p.listed ? 'admin.publications.listed' : 'admin.publications.draft')} />
                  {p.moderationHold && (
                    <StatusBadge size="sm" tone="warning" label={t('admin.publications.onHold')} />
                  )}
                  {p.featured && (
                    <StatusBadge size="sm" tone="info" label={<span className="inline-flex items-center gap-1"><Star className="h-3 w-3" aria-hidden />{t('admin.publications.featured')}</span>} />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.publishedAt
                    ? t('admin.publications.meta', { organizer: p.organizer ?? p.publishedByName ?? '', date: new Date(p.publishedAt).toLocaleDateString(i18n.language) })
                    : p.organizer}
                  {p.place && ` · ${p.place}`}
                </p>
                <ContentLanguageTag code={p.contentLanguage} className="mt-1 text-xs text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-2 md:shrink-0">
                {p.listed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={busyId === p.gameId}
                    onClick={() => feature.mutate({ gameId: p.gameId, featured: !p.featured })}
                    data-testid={`admin-feature-${p.gameId}`}
                  >
                    {t(p.featured ? 'admin.publications.unfeature' : 'admin.publications.feature')}
                  </Button>
                )}
                {p.moderationHold && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={busyId === p.gameId}
                    onClick={() => release.mutate(p.gameId)}
                    data-testid={`admin-release-${p.gameId}`}
                  >
                    {t('admin.publications.release')}
                  </Button>
                )}
                {p.listed && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="min-h-11"
                    disabled={busyId === p.gameId}
                    onClick={() => setRemoving(p)}
                    data-testid={`admin-remove-${p.gameId}`}
                  >
                    {t('admin.publications.remove')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDeleteDialog
        open={removing !== null}
        title={t('admin.publications.removeTitle', { title: removing?.title ?? '' })}
        description={t('admin.publications.removeDescription')}
        confirmLabel={t('admin.publications.remove')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate(removing.gameId)
          setRemoving(null)
        }}
      />
    </div>
  )
}
