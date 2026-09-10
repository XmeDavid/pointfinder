import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileText } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Screen } from '@/features/player/components/Screen'
import { RichContent } from '@/features/player/components/RichContent'
import { usePlayerDocuments } from '@/features/player/usePlayerDocuments'

/** One organizer document, read inline. Content ships with the list, so it also opens from the cache. */
export default function DocumentScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { resourceId } = useParams()
  const documents = usePlayerDocuments()
  const resource = documents.data?.find((r) => r.id === resourceId && r.type === 'document')

  return (
    <Screen>
      <Link to="/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('documents.title')}</Link>
      {documents.isLoading && <LoadingState label={t('common.loading')} />}
      {documents.error && <ErrorState title={t('documents.loadFailed')} retryLabel={t('common.retry')} onRetry={() => void documents.refetch()} />}
      {documents.data && !resource && (
        <EmptyState icon={<FileText className="h-6 w-6" aria-hidden />} title={t('documents.notFound')} data-testid="document-missing" />
      )}
      {resource && (
        <article data-testid="document-body">
          <h1 className="text-2xl font-semibold leading-tight break-words">{resource.name}</h1>
          <RichContent html={resource.content ?? ''} className="prose prose-sm mt-4 max-w-none text-foreground" />
        </article>
      )}
    </Screen>
  )
}
