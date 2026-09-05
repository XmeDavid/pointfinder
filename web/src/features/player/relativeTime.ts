const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]]

/** "yesterday", "30 minutes ago", or the given label when under a minute. */
export function relativeTime(iso: string, now: number, locale: string, justNow: string): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  if (abs < 60_000) return justNow
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return justNow
}
