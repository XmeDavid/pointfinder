import type { Base } from '@/types/base'

/**
 * The small readiness dot next to a base in a list. Only an NFC base can be
 * missing its tag; QR and location bases are ready as soon as they are saved.
 */
export function BaseStatusDot({ base }: { base: Base }) {
  const tagged = base.checkInMethod !== 'NFC' || base.nfcLinked
  if (base.hidden) {
    const color = tagged
      ? 'border-primary/60 bg-primary/20'
      : 'border-destructive/60 bg-destructive/20'
    const title = tagged ? 'Hidden (ready)' : 'Hidden (missing NFC)'
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full border border-dashed shrink-0 ${color}`}
        title={title}
      />
    )
  }
  if (!tagged) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0"
        title="Missing NFC"
      />
    )
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-primary shrink-0"
      title="Ready"
    />
  )
}
