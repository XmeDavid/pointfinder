import { describe, expect, it } from 'vitest'
import {
  formatCents,
  formatClubDate,
  fromDateInputValue,
  toDateInputValue,
} from './clubBilling'

describe('club term dates', () => {
  it('ends a term at the end of the chosen day, not its start', () => {
    // A term ends *on* a day: the club keeps its access for the whole of it.
    // Sending the day's first millisecond cut them off a day early.
    expect(fromDateInputValue('2028-06-30')).toBe('2028-06-30T23:59:59.999Z')
  })

  it('round-trips through the date input unchanged', () => {
    expect(toDateInputValue(fromDateInputValue('2027-01-01'))).toBe('2027-01-01')
  })

  it('reads an empty or unusable input as no term', () => {
    expect(fromDateInputValue('')).toBeNull()
    expect(fromDateInputValue('not a date')).toBeNull()
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue('not a date')).toBe('')
  })

  it('renders the day the backend means, whatever zone the reader is in', () => {
    // Both ends of the same UTC day render as that day. Formatted in the
    // reader's own zone, the first instant slid back a day everywhere west of
    // UTC and the last slid forward everywhere east of it.
    expect(formatClubDate('2027-01-01T00:00:00.000Z', 'en')).toBe('January 1, 2027')
    expect(formatClubDate('2027-01-01T23:59:59.999Z', 'en')).toBe('January 1, 2027')
  })

  it('still speaks the reader’s language', () => {
    expect(formatClubDate('2027-01-01T23:59:59.999Z', 'pt')).toContain('2027')
    expect(formatClubDate(null, 'en')).toBeNull()
    expect(formatClubDate('not a date', 'en')).toBeNull()
  })
})

describe('club invoice amounts', () => {
  it('counts in the currency’s smallest unit', () => {
    expect(formatCents(49900, 'eur', 'en')).toBe('€499.00')
  })
})
