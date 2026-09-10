import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, File, FileText, FolderOpen, Image, WifiOff } from 'lucide-react'
import type { PlayerResource } from '@pointfinder/api'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useToastStore } from '@/hooks/useToast'
import { formatBytes } from '@/lib/utils/formatBytes'
import { isNative } from '@/platform/runtime'
import { openExternal } from '@/platform/navigation'
import { Screen } from '@/features/player/components/Screen'
import { DOWNLOAD_URL_MAX_AGE_MS, usePlayerDocuments } from '@/features/player/usePlayerDocuments'

function KindIcon({ resource }: { resource: PlayerResource }) {
  const className = 'h-5 w-5 shrink-0'
  if (resource.type === 'document') return <FileText className={`${className} text-info`} aria-hidden />
  if (resource.contentType.startsWith('image/')) return <Image className={`${className} text-muted-foreground`} aria-hidden />
  return <File className={`${className} text-muted-foreground`} aria-hidden />
}

const rowClass = 'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted'

/** Maps, schedules and instructions the organizer shared, plus files unlocked by play. */
export default function DocumentsScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const documents = usePlayerDocuments()
  const addToast = useToastStore((s) => s.addToast)
  const [opening, setOpening] = useState<string | null>(null)

  async function openFile(event: MouseEvent<HTMLAnchorElement>, resource: PlayerResource) {
    // In a browser a fresh presigned link can open in a new tab as-is. Native hands it to the
    // system viewer, and an old link is refreshed first because presigned URLs expire.
    const linkStillFresh = Date.now() - documents.dataUpdatedAt < DOWNLOAD_URL_MAX_AGE_MS
    if (!isNative() && linkStillFresh && resource.downloadUrl) return
    event.preventDefault()
    setOpening(resource.id)
    try {
      const url = await documents.freshDownloadUrl(resource)
      if (!url) throw new Error('No download URL')
      if (isNative()) await openExternal(url)
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      addToast(t('documents.openFailed'), 'error')
    } finally {
      setOpening(null)
    }
  }

  return (
    <Screen>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('map.title')}</Link>
      <div>
        <h1 className="text-2xl font-semibold leading-tight">{t('documents.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('documents.subtitle')}</p>
      </div>

      {documents.fromCache && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="documents-offline-hint">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />{t('documents.offlineHint')}
        </p>
      )}

      {documents.isLoading && <LoadingState label={t('common.loading')} />}
      {documents.error && <ErrorState title={t('documents.loadFailed')} retryLabel={t('common.retry')} onRetry={() => void documents.refetch()} />}
      {documents.data && documents.data.length === 0 && (
        <EmptyState icon={<FolderOpen className="h-6 w-6" aria-hidden />} title={t('documents.empty')} description={t('documents.emptyHint')} data-testid="documents-empty" />
      )}
      {documents.data && documents.data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label={t('documents.title')} data-testid="documents-list">
          {documents.data.map((resource) => {
            const isDocument = resource.type === 'document'
            const blocked = !isDocument && (documents.fromCache || !resource.downloadUrl)
            const meta = isDocument
              ? t('documents.document')
              : blocked ? t('documents.needsConnection') : `${t('documents.file')} · ${formatBytes(resource.sizeBytes)}`
            const body = (
              <>
                <KindIcon resource={resource} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{resource.name}</span>
                  <span className="block text-xs text-muted-foreground">{meta}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </>
            )
            return (
              <li key={resource.id} data-testid={`document-${resource.id}`}>
                {isDocument ? (
                  <Link to={`/documents/${encodeURIComponent(resource.id)}`} className={rowClass}>{body}</Link>
                ) : blocked ? (
                  <div className={`${rowClass} opacity-60`} aria-disabled="true">{body}</div>
                ) : (
                  <a
                    href={resource.downloadUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${rowClass} ${opening === resource.id ? 'opacity-60' : ''}`}
                    aria-busy={opening === resource.id || undefined}
                    onClick={(e) => void openFile(e, resource)}
                  >
                    {body}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}
