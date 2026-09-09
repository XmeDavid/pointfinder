/**
 * The club deal, expressed as the quota override keys the backend reads.
 *
 * A club has one shape and the ability to vary it: every limit below is a key
 * in the org's `quota_overrides` JSON, so a deal that agreed forty members and
 * three live games is one row edit rather than a new tier. Three modes map onto
 * what the backend understands:
 *
 * - `value` — a number (or `true`/`false`) caps the limit;
 * - `unlimited` — an explicit JSON `null` for that key;
 * - `default` — the key is absent, leaving the tier default in place.
 */

export type LimitMode = 'default' | 'unlimited' | 'value'

export type LimitKind = 'count' | 'bytes' | 'toggle'

export interface LimitField {
  key: string
  kind: LimitKind
  /** Translation key for the row label. */
  labelKey: string
  clubDefault: LimitEntry
}

export interface LimitEntry {
  mode: LimitMode
  /** Number in the field's own unit (count, or gigabytes), or a flag. */
  input: string
}

export type LimitState = Record<string, LimitEntry>

/** Gibibyte. The backend stores byte limits, the form talks in GB. */
export const GIB = 1024 * 1024 * 1024

const value = (input: string | number): LimitEntry => ({ mode: 'value', input: String(input) })
const unlimited: LimitEntry = { mode: 'unlimited', input: '' }

/**
 * The standard deal. Documented in `docs/business-logic.md` § "Clubs and
 * Invoicing"; keep the two in step.
 */
export const CLUB_LIMIT_FIELDS: LimitField[] = [
  { key: 'max_members', kind: 'count', labelKey: 'admin.limits.members', clubDefault: value(15) },
  { key: 'max_live_games', kind: 'count', labelKey: 'admin.limits.liveGames', clubDefault: value(10) },
  { key: 'max_players_per_game', kind: 'count', labelKey: 'admin.limits.playersPerGame', clubDefault: value(200) },
  { key: 'max_bases_per_game', kind: 'count', labelKey: 'admin.limits.basesPerGame', clubDefault: unlimited },
  { key: 'max_operators_per_game', kind: 'count', labelKey: 'admin.limits.operatorsPerGame', clubDefault: unlimited },
  { key: 'max_file_size_bytes', kind: 'bytes', labelKey: 'admin.limits.fileSize', clubDefault: value(2) },
  { key: 'max_resource_storage_bytes', kind: 'bytes', labelKey: 'admin.limits.storage', clubDefault: value(25) },
  { key: 'location_check_in', kind: 'toggle', labelKey: 'admin.limits.locationCheckIn', clubDefault: value('true') },
]

const FIELDS_BY_KEY = new Map(CLUB_LIMIT_FIELDS.map((field) => [field.key, field]))

/** The form a new club opens on: the standard deal, every key explicit. */
export function clubDefaultLimits(): LimitState {
  const state: LimitState = {}
  for (const field of CLUB_LIMIT_FIELDS) state[field.key] = { ...field.clubDefault }
  return state
}

function gbInput(bytes: number): string {
  const gb = bytes / GIB
  // Whole gigabytes are the common case; keep two decimals for the rest.
  return Number.isInteger(gb) ? String(gb) : String(Number(gb.toFixed(2)))
}

/**
 * The form for a club that already exists. A key the org does not carry reads
 * as `default`, an explicit `null` as `unlimited`.
 */
export function limitsFromOverrides(overrides: Record<string, unknown> | null | undefined): LimitState {
  const state: LimitState = {}
  for (const field of CLUB_LIMIT_FIELDS) {
    if (!overrides || !(field.key in overrides)) {
      state[field.key] = { mode: 'default', input: '' }
      continue
    }
    const raw = overrides[field.key]
    if (raw === null) {
      state[field.key] = { ...unlimited }
      continue
    }
    if (field.kind === 'toggle') {
      state[field.key] = value(raw === true ? 'true' : 'false')
      continue
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      state[field.key] = value(field.kind === 'bytes' ? gbInput(raw) : raw)
      continue
    }
    // Something this form cannot express — leave it to the advanced view.
    state[field.key] = { mode: 'default', input: '' }
  }
  return state
}

/** Keys whose `value` mode carries something that is not a usable number. */
export function invalidLimitKeys(state: LimitState): string[] {
  return CLUB_LIMIT_FIELDS.filter((field) => {
    const entry = state[field.key]
    if (!entry || entry.mode !== 'value' || field.kind === 'toggle') return false
    const parsed = Number(entry.input.replace(',', '.'))
    return entry.input.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
  }).map((field) => field.key)
}

/**
 * The `quotaOverrides` payload. `default` rows are omitted so the tier default
 * applies; `unlimited` rows send an explicit `null`.
 */
export function limitsToOverrides(state: LimitState): Record<string, number | boolean | null> {
  const overrides: Record<string, number | boolean | null> = {}
  for (const field of CLUB_LIMIT_FIELDS) {
    const entry = state[field.key]
    if (!entry || entry.mode === 'default') continue
    if (entry.mode === 'unlimited') {
      overrides[field.key] = null
      continue
    }
    if (field.kind === 'toggle') {
      overrides[field.key] = entry.input === 'true'
      continue
    }
    const parsed = Number(entry.input.replace(',', '.'))
    if (!Number.isFinite(parsed)) continue
    overrides[field.key] = field.kind === 'bytes' ? Math.round(parsed * GIB) : Math.round(parsed)
  }
  return overrides
}

/** True when the form and the stored JSON say the same thing. */
export function limitsMatchOverrides(
  state: LimitState,
  overrides: Record<string, unknown> | null | undefined,
): boolean {
  const next = limitsToOverrides(state)
  const current: Record<string, unknown> = {}
  for (const key of Object.keys(overrides ?? {})) {
    if (FIELDS_BY_KEY.has(key)) current[key] = (overrides as Record<string, unknown>)[key]
  }
  const keys = new Set([...Object.keys(next), ...Object.keys(current)])
  for (const key of keys) {
    if (!(key in next) || !(key in current)) return false
    if (next[key] !== current[key]) return false
  }
  return true
}

/**
 * Overrides the form cannot express — a per-deal key outside the club shape.
 * They are preserved on save and shown read-only in the advanced view.
 */
export function unmanagedOverrides(
  overrides: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(overrides ?? {})) {
    const field = FIELDS_BY_KEY.get(key)
    if (!field) {
      extra[key] = raw
      continue
    }
    // A managed key holding a shape the form drops back to "default" for.
    if (raw === null) continue
    if (field.kind === 'toggle' ? typeof raw !== 'boolean' : typeof raw !== 'number') {
      extra[key] = raw
    }
  }
  return extra
}
