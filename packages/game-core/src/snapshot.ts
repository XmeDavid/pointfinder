/**
 * Realtime is invalidation; the snapshot is canonical.
 *
 * Every state-changing realtime event carries a `stateVersion`. Whenever the
 * app suspects it missed something (foreground, reconnect, network back),
 * it fetches the snapshot and applies it only if the version moved on.
 */

export type SnapshotDecision = 'apply' | 'skip'

/** Apply when the server is ahead of what we have seen, or when we have seen nothing. */
export function decideSnapshot(lastSeenVersion: number | null, snapshotVersion: number): SnapshotDecision {
  if (lastSeenVersion === null) return 'apply'
  return snapshotVersion > lastSeenVersion ? 'apply' : 'skip'
}

/** Track the highest version seen from any source. */
export class StateVersionTracker {
  private version: number | null = null
  get current(): number | null {
    return this.version
  }
  /** Returns true if this observation advanced the version. */
  observe(version: number | null | undefined): boolean {
    if (typeof version !== 'number') return false
    if (this.version === null || version > this.version) {
      this.version = version
      return true
    }
    return false
  }
  reset() {
    this.version = null
  }
}
