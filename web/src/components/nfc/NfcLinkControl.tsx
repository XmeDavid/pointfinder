import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Nfc } from 'lucide-react'
import { buildTagUrl } from '@pointfinder/game-core'
import type { Base } from '@/types/base'
import { Alert, Button } from '@/components'
import { basesApi } from '@/lib/api/bases'
import { nfcErrorMessage, writeTag } from '@/platform/nfc'

export function NfcLinkControl({ base, gameId }: { base: Base; gameId: string }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp.nfcWrite' })
  const { t: tPlayer } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const queries = useQueryClient()
  const [writing, setWriting] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'destructive' | 'warning'; text: string } | null>(null)
  const link = useMutation({
    mutationFn: () => basesApi.markNfcLinked(base.id, gameId),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['bases', gameId] }),
  })

  async function write() {
    setWriting(true)
    setMessage(null)
    try {
      await writeTag(tPlayer, buildTagUrl(base.id, base.nfcToken))
      try {
        await link.mutateAsync()
        setMessage({ tone: 'success', text: t('success') })
      } catch {
        setMessage({ tone: 'warning', text: t('linkFailed') })
      }
    } catch (err) {
      setMessage({ tone: 'destructive', text: nfcErrorMessage(err, tPlayer) })
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        variant={base.nfcLinked ? 'outline' : 'default'}
        disabled={writing}
        onClick={() => void write()}
        data-testid={`nfc-write-${base.id}`}
      >
        <Nfc className="mr-2 h-5 w-5" aria-hidden />
        {writing ? t('writing') : t('writeToTag')}
      </Button>
      {message && (
        <Alert
          variant={message.tone === 'success' ? 'info' : message.tone}
          className={message.tone === 'success' ? 'bg-success/10 text-success border-success/30' : undefined}
          role="status"
        >
          {message.text}
        </Alert>
      )}
    </div>
  )
}
