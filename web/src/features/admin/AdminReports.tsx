import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { PublicationReportResponse } from '@pointfinder/api'
import { adminApi, ADMIN_REPORTS_QUERY_KEY as REPORTS_QUERY_KEY } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { StatusBadge } from '@/components/status'
import { LoadingState } from '@/components/feedback/LoadingState'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'

interface ReportGroup {
  gameId: string
  gameName: string
  listed: boolean
  reports: PublicationReportResponse[]
}

/**
 * OW-06: open reports about Explore listings, grouped by game in the order
 * the oldest report arrived. Dismiss closes a game's reports and keeps the
 * listing; Remove unpublishes it (the game and the organizer's summary stay)
 * and closes them. Reporters are shown to admins only.
 */
export function AdminReports() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState<ReportGroup | null>(null)
  const reports = useQuery({ queryKey: REPORTS_QUERY_KEY, queryFn: adminApi.listReports })

  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: REPORTS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'publications'] })
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes('explore') })
  }
  const dismiss = useMutation({ mutationFn: adminApi.dismissReports, onSuccess: settled })
  const remove = useMutation({ mutationFn: adminApi.removeReported, onSuccess: settled })
  const busyId = (dismiss.isPending ? dismiss.variables : undefined) ?? (remove.isPending ? remove.variables : undefined)

  const groups = useMemo(() => {
    const byGame = new Map<string, ReportGroup>()
    for (const report of reports.data ?? []) {
      const group = byGame.get(report.gameId)
        ?? { gameId: report.gameId, gameName: report.gameName, listed: report.listed, reports: [] }
      group.reports.push(report)
      byGame.set(report.gameId, group)
    }
    return [...byGame.values()]
  }, [reports.data])

  return (
    <div data-testid="admin-reports">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{t('admin.reports.intro')}</p>
      {(dismiss.isError || remove.isError) && (
        <p role="alert" className="mb-3 text-sm text-destructive">{t('admin.reports.actionError')}</p>
      )}
      {reports.isPending && <LoadingState label={t('common.loading')} />}
      {reports.isError && (
        <ErrorState title={t('admin.reports.loadError')} retryLabel={t('common.retry')} onRetry={() => void reports.refetch()} />
      )}
      {reports.isSuccess && groups.length === 0 && <EmptyState density="compact" title={t('admin.reports.empty')} />}
      {groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.gameId} className="rounded-lg border border-border px-4 py-3" data-testid={`admin-report-group-${group.gameId}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-medium text-foreground">{group.gameName}</p>
                    <StatusBadge size="sm" tone="warning" label={t('admin.reports.count', { count: group.reports.length })} />
                    {!group.listed && <StatusBadge size="sm" tone="muted" label={t('admin.reports.notListed')} />}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {group.reports.map((report) => (
                      <li key={report.id} className="text-sm">
                        <p className="font-medium">{t(`experience.report.reasons.${report.reason}`)}</p>
                        {report.details && <p className="whitespace-pre-line break-words text-muted-foreground">{report.details}</p>}
                        <p className="text-xs text-muted-foreground">
                          {t('admin.reports.reporter', {
                            name: report.reporterName,
                            date: new Date(report.createdAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 md:shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={busyId === group.gameId}
                    onClick={() => dismiss.mutate(group.gameId)}
                    data-testid={`admin-report-dismiss-${group.gameId}`}
                  >
                    {t('admin.reports.dismiss')}
                  </Button>
                  {group.listed && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="min-h-11"
                      disabled={busyId === group.gameId}
                      onClick={() => setRemoving(group)}
                      data-testid={`admin-report-remove-${group.gameId}`}
                    >
                      {t('admin.reports.remove')}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDeleteDialog
        open={removing !== null}
        title={t('admin.publications.removeTitle', { title: removing?.gameName ?? '' })}
        description={t('admin.publications.removeDescription')}
        confirmLabel={t('admin.reports.remove')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate(removing.gameId)
          setRemoving(null)
        }}
      />
    </div>
  )
}
