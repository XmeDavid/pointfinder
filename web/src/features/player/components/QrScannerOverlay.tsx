import { useEffect } from 'react'
import { ArrowLeft, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components'

export function QrScannerOverlay({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })

  useEffect(() => {
    document.documentElement.classList.add('native-scanner-active')
    return () => document.documentElement.classList.remove('native-scanner-active')
  }, [])

  return (
    <main className="fixed inset-0 z-50 flex flex-col bg-transparent text-foreground" data-testid="player-qr-scanner">
      <div className="safe-gutter flex justify-start pt-[calc(var(--safe-top)+0.75rem)]">
        <Button type="button" variant="secondary" size="lg" onClick={onBack} data-testid="player-join-scan-back-btn">
          <ArrowLeft className="mr-2 h-5 w-5" aria-hidden />
          {t('common.back')}
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center p-8" aria-hidden>
        <div className="aspect-square w-full max-w-sm rounded-lg border-2 border-primary" />
      </div>
      <div className="safe-gutter pb-[calc(var(--safe-bottom)+1rem)] text-center">
        <span className="inline-flex items-center gap-2 rounded-md bg-card/95 px-3 py-2 text-sm font-medium text-card-foreground">
          <QrCode className="h-5 w-5" aria-hidden />
          {t('join.scanQr')}
        </span>
      </div>
    </main>
  )
}
