import { useMemo } from 'react'
import QRCode from 'qrcode'

export interface QrCodeSvgProps {
  /** Payload to encode — always `buildTagUrl(base.id, base.nfcToken)`. */
  value: string
  /** Rendered edge length in CSS pixels. */
  size?: number
  className?: string
  /** Accessible name; when omitted the graphic is decorative. */
  title?: string
  'data-testid'?: string
}

const QUIET_ZONE_MODULES = 2

/**
 * A QR code drawn as real SVG elements from the encoder's bit matrix.
 *
 * `qrcode` is already a dependency (used by the team join-code dialog); its
 * synchronous `create()` gives the module matrix, so nothing is injected as
 * raw HTML and the code renders offline with no canvas or data URI.
 *
 * Colours are literal black on white on purpose: a QR code must stay
 * dark-on-light in both themes and on paper to remain scannable. Recorded as
 * an exception in `design-system/decisions.md`.
 */
export function QrCodeSvg({ value, size = 160, className, title, ...props }: QrCodeSvgProps) {
  const matrix = useMemo(() => {
    if (!value) return null
    try {
      return QRCode.create(value, { errorCorrectionLevel: 'M' }).modules
    } catch {
      return null
    }
  }, [value])

  const path = useMemo(() => {
    if (!matrix) return ''
    const parts: string[] = []
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        if (matrix.data[row * matrix.size + col]) {
          parts.push(`M${col + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`)
        }
      }
    }
    return parts.join('')
  }, [matrix])

  if (!matrix || !path) return null

  const dimension = matrix.size + QUIET_ZONE_MODULES * 2

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${dimension} ${dimension}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-testid={props['data-testid']}
    >
      {title && <title>{title}</title>}
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" data-testid="qr-modules" />
    </svg>
  )
}
