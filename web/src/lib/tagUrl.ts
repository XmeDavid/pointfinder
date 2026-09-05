import { buildTagUrl } from '@pointfinder/game-core'

/**
 * The tag URL for display and printing. `buildTagUrl` throws for anything
 * that is not a base UUID; a screen must never crash over a bad id, so the
 * failure becomes an empty value and the QR renderer draws nothing.
 */
export function printableTagUrl(baseId: string, token: string | null | undefined): string {
  try {
    return buildTagUrl(baseId, token)
  } catch {
    return ''
  }
}
