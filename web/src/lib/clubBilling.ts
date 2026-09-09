/**
 * Shared formatting for the club term and its invoices, so the admin panel and
 * the club's own billing tab render a date and an amount the same way.
 */

/** A term or invoice date, in the reader's locale. */
export function formatClubDate(iso: string | null | undefined, language: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date)
}

/** An invoice amount. The backend counts in the currency's smallest unit. */
export function formatCents(cents: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: (currency || 'eur').toUpperCase(),
  }).format(cents / 100)
}

/** The `YYYY-MM-DD` an `<input type="date">` wants, read off an instant. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

/**
 * The instant a date input means. A term ends on a day, so it is sent as that
 * day's UTC midnight rather than the admin's own midnight.
 */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
