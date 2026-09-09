/** The single address the product points people at when a club needs a human. */
export const CONTACT_EMAIL = 'info@pointfinder.pt'

/** Subject used for every club enquiry, so replies land in one thread. */
export const CLUB_CONTACT_SUBJECT = 'PointFinder club deal'

export function contactHref(subject: string = CLUB_CONTACT_SUBJECT): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
