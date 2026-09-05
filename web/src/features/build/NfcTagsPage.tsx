import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Nfc, Printer } from 'lucide-react'
import { printableTagUrl } from '@/lib/tagUrl'
import { Alert, Button } from '@/components'
import { NfcLinkControl } from '@/components/nfc/NfcLinkControl'
import { CheckInMethodBadge, NfcStatusBadge, useCheckInMethodLabel } from '@/components/status'
import { QrCodeSvg } from '@/components/common/QrCodeSvg'
import { CodesPrintSheet } from '@/components/common/CodesPrintSheet'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useBases } from '@/hooks/queries/useBases'
import { useGame } from '@/hooks/queries/useGames'
import { isNative } from '@/platform'
import { CHECK_IN_METHODS, resolveCheckInRadiusM } from '@/types/checkIn'
import type { CheckInMethod } from '@/types/checkIn'

type Filter = 'all' | 'unlinked' | 'linked'
type MethodFilter = 'all' | CheckInMethod

/**
 * Operator tag and code management: every base, how it is checked into, the NFC
 * write control on the phone, an inline QR code with print, and a print-all
 * sheet. Codes render in the browser so the sheet works offline.
 */
export default function NfcTagsPage() {
  const { id: gameId = '' } = useParams()
  return <NfcTagsManager gameId={gameId} standalone />
}

export function NfcTagsManager({ gameId, standalone = false }: { gameId: string; standalone?: boolean }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp.nfcWrite' })
  const { t: tCommon } = useTranslation()
  const methodLabel = useCheckInMethodLabel()
  const game = useGame(gameId)
  const bases = useBases(gameId)
  const [filter, setFilter] = useState<Filter>('all')
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')
  const [printOpen, setPrintOpen] = useState(false)

  const defaultRadius = game.data?.defaultCheckInRadiusM

  const visible = useMemo(() => {
    const list = [...(bases.data ?? [])].sort((a, b) => Number(a.nfcLinked) - Number(b.nfcLinked) || a.name.localeCompare(b.name))
    const byMethod = methodFilter === 'all' ? list : list.filter((b) => b.checkInMethod === methodFilter)
    if (filter === 'all') return byMethod
    // Link state only means anything for NFC bases; the other methods are never "unlinked".
    return byMethod.filter((b) => b.checkInMethod !== 'NFC' || (filter === 'linked' ? b.nfcLinked : !b.nfcLinked))
  }, [bases.data, filter, methodFilter])

  const qrCodes = useMemo(
    () =>
      (bases.data ?? [])
        .filter((b) => b.checkInMethod === 'QR')
        .map((b) => ({ id: b.id, name: b.name, value: printableTagUrl(b.id, b.nfcToken) })),
    [bases.data],
  )

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('allBases') },
    { key: 'unlinked', label: t('onlyUnlinked') },
    { key: 'linked', label: t('onlyLinked') },
  ]

  const methodFilters: Array<{ key: MethodFilter; label: string }> = [
    { key: 'all', label: tCommon('checkIn.allMethods') },
    ...CHECK_IN_METHODS.map((m) => ({ key: m as MethodFilter, label: methodLabel(m) })),
  ]

  return (
    <div className={`${standalone ? 'mx-auto max-w-2xl' : 'w-full'} flex h-full flex-col gap-4 overflow-y-auto px-4 py-4`} data-testid="nfc-tags-page">
      {standalone && <Link to={`/game/${encodeURIComponent(gameId)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {game.data?.name ?? tCommon('common.back')}</Link>}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-tight">{tCommon('checkIn.tagsAndCodes')}</h1>
        <p className="text-sm text-muted-foreground">{t('instructions')}</p>
      </header>
      {!isNative() && <Alert variant="info">{t('unavailable')}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" role="tablist" aria-label={t('title')}>
          {filters.map((f) => (
            <Button key={f.key} type="button" role="tab" aria-selected={filter === f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} onClick={() => setFilter(f.key)}>{f.label}</Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          data-testid="codes-print-all"
          disabled={qrCodes.length === 0}
          onClick={() => setPrintOpen(true)}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden />
          {tCommon('checkIn.printAll')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={tCommon('checkIn.method')} data-testid="codes-method-filter">
        {methodFilters.map((f) => (
          <Button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={methodFilter === f.key}
            size="sm"
            variant={methodFilter === f.key ? 'default' : 'outline'}
            data-testid={`codes-method-${String(f.key).toLowerCase()}`}
            onClick={() => setMethodFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {bases.isLoading && <LoadingState label={tCommon('common.loading')} />}
      {bases.error && <ErrorState title={tCommon('common.error')} retryLabel={tCommon('common.retry')} onRetry={() => void bases.refetch()} />}
      {bases.data && visible.length === 0 && <EmptyState icon={<Nfc className="h-6 w-6" aria-hidden />} title={qrCodes.length === 0 && methodFilter === 'QR' ? tCommon('checkIn.noQrBases') : t('noBases')} />}
      {visible.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={tCommon('checkIn.tagsAndCodes')}>
          {visible.map((base) => (
            <li key={base.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3" data-testid={`nfc-base-${base.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{base.name}</p>
                  {base.hidden && <p className="text-xs text-muted-foreground">{tCommon('bases.hidden', { defaultValue: 'Hidden' })}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CheckInMethodBadge method={base.checkInMethod} size="sm" />
                  {base.checkInMethod === 'NFC' && <NfcStatusBadge status={base.nfcLinked ? 'linked' : 'missing'} />}
                </div>
              </div>
              {base.checkInMethod === 'NFC' && isNative() && (
                <NfcLinkControl base={base} gameId={gameId} />
              )}
              {base.checkInMethod === 'QR' && (
                <div className="flex items-center gap-3">
                  <QrCodeSvg
                    value={printableTagUrl(base.id, base.nfcToken)}
                    size={96}
                    title={base.name}
                    data-testid={`codes-qr-${base.id}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`codes-print-${base.id}`}
                    onClick={() => setPrintOpen(true)}
                  >
                    {tCommon('checkIn.printAll')}
                  </Button>
                </div>
              )}
              {base.checkInMethod === 'LOCATION' && (
                <p className="text-xs text-muted-foreground">
                  {tCommon('checkIn.noTagNeeded')}{' '}
                  {tCommon('checkIn.radius')}: {resolveCheckInRadiusM(base.checkInRadiusM, defaultRadius)} m
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <CodesPrintSheet
        open={printOpen}
        gameName={game.data?.name ?? ''}
        codes={qrCodes}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  )
}
