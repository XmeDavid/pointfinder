/**
 * Shared formatting for the club term and its invoices, so the admin panel and
 * the club's own billing tab render a date and an amount the same way.
 */

/**
 * A term or invoice date, in the reader's locale but always on the calendar
 * day the backend means.
 *
 * A term end is a day, stored as an instant at the end of that day in UTC.
 * Rendered in the reader's own zone it slides: an admin in Sao Paulo reading
 * `2027-01-01T23:59:59.999Z` saw 1 January, but the same field at the day's
 * start used to read as 31 December for everyone west of UTC. The day is the
 * fact, so it is formatted in the zone the day was chosen in.
 */
export function formatClubDate(iso: string | null | undefined, language: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

/** An invoice amount. The backend counts in the currency's smallest unit. */
export function formatCents(cents: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: (currency || 'eur').toUpperCase(),
  }).format(cents / 100)
}

/**
 * The `YYYY-MM-DD` an `<input type="date">` wants, read off an instant. Read
 * in UTC, so it round-trips with {@link fromDateInputValue} exactly.
 */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

/**
 * The instant a date input means. A term ends *on* a day, so the club keeps
 * its access for the whole of that day: the value is the last millisecond of
 * it in UTC, not its first. Sending the day's midnight cut the club off a day
 * early — a term ending "31 December" expired the moment December began its
 * last day.
 */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T23:59:59.999Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
