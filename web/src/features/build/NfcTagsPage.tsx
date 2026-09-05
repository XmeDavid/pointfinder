import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Nfc } from 'lucide-react'
import { buildTagUrl } from '@pointfinder/game-core'
import type { Base } from '@/types/base'
import { Alert, Button } from '@/components'
import { NfcStatusBadge } from '@/components/status'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { basesApi } from '@/lib/api/bases'
import { isNative } from '@/platform'
import { nfcErrorMessage, writeTag } from '@/platform/nfc'

type Filter = 'all' | 'unlinked' | 'linked'

/**
 * Operator NFC tag management on the phone: every base, its link state, and a write button
 * that puts the base URL (with its token) on a tag and records the link through the audited endpoint.
 */
export default function NfcTagsPage() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp.nfcWrite' })
  const { t: tCommon } = useTranslation()
  const { t: tPlayer } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { id: gameId = '' } = useParams()
  const game = useGame(gameId)
  const bases = useBases(gameId)
  const queries = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [writing, setWriting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ baseId: string; tone: 'success' | 'destructive' | 'warning'; text: string } | null>(null)

  const link = useMutation({
    mutationFn: (baseId: string) => basesApi.markNfcLinked(baseId, gameId),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['bases', gameId] }),
  })

  const visible = useMemo(() => {
    const list = [...(bases.data ?? [])].sort((a, b) => Number(a.nfcLinked) - Number(b.nfcLinked) || a.name.localeCompare(b.name))
    return filter === 'all' ? list : list.filter((b) => (filter === 'linked' ? b.nfcLinked : !b.nfcLinked))
  }, [bases.data, filter])

  async function write(base: Base) {
    setWriting(base.id)
    setMessage(null)
    try {
      const result = await writeTag(tPlayer, buildTagUrl(base.id, base.nfcToken))
      if (!result.verified) return setMessage({ baseId: base.id, tone: 'warning', text: tPlayer('nfc.verifyMismatch') })
      try {
        await link.mutateAsync(base.id)
        setMessage({ baseId: base.id, tone: 'success', text: t('success') })
      } catch {
        setMessage({ baseId: base.id, tone: 'warning', text: t('linkFailed') })
      }
    } catch (err) {
      setMessage({ baseId: base.id, tone: 'destructive', text: nfcErrorMessage(err, tPlayer) })
    } finally {
      setWriting(null)
    }
  }

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('allBases') },
    { key: 'unlinked', label: t('onlyUnlinked') },
    { key: 'linked', label: t('onlyLinked') },
  ]

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 py-4" data-testid="nfc-tags-page">
      <Link to={`/game/${encodeURIComponent(gameId)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {game.data?.name ?? tCommon('common.back')}</Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('instructions')}</p>
      </header>
      {!isNative() && <Alert variant="info">{t('unavailable')}</Alert>}
      <div className="flex gap-2" role="tablist" aria-label={t('title')}>
        {filters.map((f) => (
          <Button key={f.key} type="button" role="tab" aria-selected={filter === f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} onClick={() => setFilter(f.key)}>{f.label}</Button>
        ))}
      </div>
      {bases.isLoading && <LoadingState label={tCommon('common.loading')} />}
      {bases.error && <ErrorState title={tCommon('common.error')} retryLabel={tCommon('common.retry')} onRetry={() => void bases.refetch()} />}
      {bases.data && visible.length === 0 && <EmptyState icon={<Nfc className="h-6 w-6" aria-hidden />} title={t('noBases')} />}
      {visible.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('title')}>
          {visible.map((base) => (
            <li key={base.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3" data-testid={`nfc-base-${base.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{base.name}</p>
                  {base.hidden && <p className="text-xs text-muted-foreground">{tCommon('bases.hidden', { defaultValue: 'Hidden' })}</p>}
                </div>
                <NfcStatusBadge status={base.nfcLinked ? 'linked' : 'missing'} />
              </div>
              {isNative() && (
                <Button type="button" size="lg" variant={base.nfcLinked ? 'outline' : 'default'} disabled={writing !== null} onClick={() => void write(base)} data-testid={`nfc-write-${base.id}`}>
                  <Nfc className="mr-2 h-5 w-5" aria-hidden /> {writing === base.id ? t('writing') : t('writeToTag')}
                </Button>
              )}
              {message?.baseId === base.id && (
                <Alert variant={message.tone === 'success' ? 'info' : message.tone} className={message.tone === 'success' ? 'bg-success/10 text-success border-success/30' : undefined} role="status">{message.text}</Alert>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
