import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { useUploadAttention } from '@/hooks/queries/useMonitoring'
import { cn } from '@/lib/utils/cn'

/**
 * OW-18: uploads that need an operator. Stalled transfers and finished
 * uploads whose answer never arrived both wait on the player's phone, which
 * carries on by itself once the app is open with a connection, so the useful
 * action is to contact that team. Hidden while there is nothing to show.
 */
export function UploadAttention({ gameId }: { gameId: string }) {
  const { t } = useTranslation()
  // Ages are measured at the last fetch, which refreshes every minute.
  const { data: items = [], dataUpdatedAt } = useUploadAttention(gameId)
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const minutesSince = (iso: string) => Math.max(1, Math.round((dataUpdatedAt - new Date(iso).getTime()) / 60_000))

  return (
    <OverlayPanel padding="none" className="pointer-events-auto w-[min(26rem,calc(100vw-1rem))] border-warning/40" data-testid="upload-attention">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0 flex-1">{t('command.uploads.summary', { count: items.length })}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="max-h-72 space-y-2 overflow-y-auto border-t border-border px-3 py-2 text-sm">
          <ul className="space-y-2">
            {items.map((item) => {
              const file = item.fileName || t('command.uploads.unnamed')
              return (
                <li key={item.sessionId} data-testid={`upload-attention-${item.sessionId}`}>
                  <p className="font-medium break-words">{`${item.teamName} · ${item.playerName}`}</p>
                  <p className="text-muted-foreground break-words">
                    {item.kind === 'stalled'
                      ? t('command.uploads.stalled', {
                          file,
                          percent: item.totalBytes > 0 ? Math.floor((item.receivedBytes / item.totalBytes) * 100) : 0,
                          minutes: minutesSince(item.since),
                        })
                      : t('command.uploads.unlinked', { file, minutes: minutesSince(item.since) })}
                  </p>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t('command.uploads.hint')}</p>
        </div>
      )}
    </OverlayPanel>
  )
}
