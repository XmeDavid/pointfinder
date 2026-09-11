import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { shareFile } from '@/platform/share'
import { QrCodeSvg } from './QrCodeSvg'

/** One scannable code, with a full-screen image view and platform image saving. */
export function QrCodeViewer({
  value,
  name,
  size = 144,
  testId,
}: {
  value: string
  name: string
  size?: number
  testId?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    let active = true
    QRCode.toDataURL(value, {
      width: 1200,
      margin: 4,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        const bytes = Uint8Array.from(atob(url.split(',')[1]), (char) =>
          char.charCodeAt(0),
        )
        if (active)
          setFile(
            new File(
              [bytes],
              `${name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'PointFinder'}-QR.png`,
              { type: 'image/png' },
            ),
          )
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [open, value, name])
  function close() {
    setOpen(false)
    setFile(null)
    setError(false)
    trigger.current?.focus()
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="w-fit cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('checkIn.viewCode', { name })}
        onClick={() => setOpen(true)}
      >
        <QrCodeSvg
          value={value}
          title={value}
          size={size}
          data-testid={testId}
        />
      </button>
      {open &&
        createPortal(
          <Dialog
            open
            onOpenChange={(next) => {
              if (!next) close()
            }}
          >
            <DialogContent
              className="safe-page fixed inset-0 flex h-full max-w-none flex-col rounded-none border-0 p-4"
              data-testid="qr-code-viewer"
            >
              <header className="flex items-center justify-between gap-3">
                <DialogTitle className="min-w-0 break-words">
                  {name}
                </DialogTitle>
                <Button variant="ghost" onClick={close}>
                  {t('common.close')}
                </Button>
              </header>
              <div className="flex min-h-0 flex-1 items-center justify-center py-4">
                <QrCodeSvg
                  value={value}
                  title={name}
                  size={1200}
                  className="max-h-full w-auto max-w-full"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {t('checkIn.saveCodeError')}
                </p>
              )}
              <Button
                disabled={!file || saving}
                onClick={async () => {
                  if (!file) return
                  setSaving(true)
                  setError(false)
                  try {
                    await shareFile(file)
                  } catch {
                    setError(true)
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {t('checkIn.saveCode')}
              </Button>
            </DialogContent>
          </Dialog>,
          document.body,
        )}
    </>
  )
}
