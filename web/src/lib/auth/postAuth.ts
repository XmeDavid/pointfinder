/**
 * Sign-in and registration decide where they land only after the session is
 * up (the introduction's server row is read with the new token). While that
 * decision is in flight the auth state already says "authenticated", and the
 * guest guard would otherwise bounce the page to the dashboard first.
 */
let pending = 0

export function holdPostAuthRedirect(): void {
  pending += 1
}

export function releasePostAuthRedirect(): void {
  pending = Math.max(0, pending - 1)
}

export function isPostAuthRedirectHeld(): boolean {
  return pending > 0
}
