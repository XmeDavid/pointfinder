import { useId } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'

export interface SpotlightProps {
  /** Viewport-relative rect of the anchor; null renders nothing. */
  rect: DOMRect | null
  /** Breathing room around the anchor, in CSS pixels. */
  padding?: number
  /** Corner radius of the cut-out. */
  radius?: number
}

/**
 * A full-viewport scrim with the anchor punched out. Purely decorative: it is
 * `pointer-events-none` end to end, so the operator can still click anything —
 * the tour dims, it never blocks. Uses the lighter tour scrim token because the
 * tutorial invites the operator to keep using the screen underneath.
 */
export function Spotlight({ rect, padding = 8, radius = 8 }: SpotlightProps) {
  const reduced = useReducedMotion()
  const maskId = useId()

  if (!rect || typeof document === 'undefined') return null

  const x = Math.max(0, rect.left - padding)
  const y = Math.max(0, rect.top - padding)
  const width = Math.max(0, rect.width + padding * 2)
  const height = Math.max(0, rect.height + padding * 2)

  return createPortal(
    <motion.div
      data-testid="tour-spotlight"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? undefined : { opacity: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <svg className="h-full w-full" role="presentation" focusable="false">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              data-testid="tour-spotlight-hole"
              x={x}
              y={y}
              width={width}
              height={height}
              rx={radius}
              ry={radius}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="var(--pf-color-surface-tourScrim)"
          mask={`url(#${maskId})`}
        />
      </svg>
    </motion.div>,
    document.body,
  )
}
