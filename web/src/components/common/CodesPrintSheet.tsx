import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { QrCodeSvg } from './QrCodeSvg'

export interface PrintableCode {
  id: string
  /** Base name, printed above the code. */
  name: string
  /** Encoded payload — `buildTagUrl(base.id, base.nfcToken)`. */
  value: string
}

export interface CodesPrintSheetProps {
  open: boolean
  gameName: string
  codes: PrintableCode[]
  onClose: () => void
}

const PRINT_STYLE = `
@media print {
  body > *:not(#pf-print-root) { display: none !important; }
  #pf-print-root { position: static !important; overflow: visible !important; }
  #pf-print-root .pf-print-chrome { display: none !important; }
  #pf-print-root .pf-print-page { break-after: page; page-break-after: always; }
  #pf-print-root .pf-print-page:last-child { break-after: auto; page-break-after: auto; }
}
`

/**
 * One printable page per code: base name, game name, and the SVG code itself.
 * Rendered into a body-level portal so a single print rule can hide the rest
 * of the operator workspace without touching the global stylesheet.
 */
export function CodesPrintSheet({ open, gameName, codes, onClose }: CodesPrintSheetProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    if (typeof window.print !== 'function') return
    window.print()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      id="pf-print-root"
      data-testid="codes-print-sheet"
      className="fixed inset-0 z-[100] overflow-y-auto bg-white text-black"
    >
      <style>{PRINT_STYLE}</style>
      <div className="pf-print-chrome sticky top-0 flex justify-end gap-2 bg-white p-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose} data-testid="codes-print-close">
          {t('checkIn.closePrint')}
        </Button>
      </div>
      {codes.map((code) => (
        <section
          key={code.id}
          data-testid="codes-print-page"
          className="pf-print-page flex min-h-screen flex-col items-center justify-center gap-4 px-8 py-10 text-center"
        >
          <h2 className="text-3xl font-semibold break-words">{code.name}</h2>
          <QrCodeSvg value={code.value} size={320} title={code.name} />
          <p className="text-lg break-words">{gameName}</p>
        </section>
      ))}
    </div>,
    document.body,
  )
}
