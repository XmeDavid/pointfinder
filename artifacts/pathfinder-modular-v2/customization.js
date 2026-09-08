// Pure configuration logic for the modular character viewer.
// No DOM, no Three.js: this module is unit-tested with `bun test`.

export const CONFIG_VERSION = 1

// Slot catalog. `choices` are what the selector offers; `items` are the
// item_id values expected on meshes in modular-character.glb.
export const SLOTS = Object.freeze({
  base: Object.freeze({ label: 'Base', choices: ['uniform'], items: ['uniform'], none: false, initial: 'uniform' }),
  hair: Object.freeze({ label: 'Hair', choices: ['none', 'short', 'ponytail'], items: ['short', 'ponytail', 'short-hat', 'ponytail-hat'], none: true, initial: 'short' }),
  hat: Object.freeze({ label: 'Hat', choices: ['none', 'ranger'], items: ['ranger'], none: true, initial: 'none' }),
  backpack: Object.freeze({ label: 'Backpack', choices: ['none', 'canvas'], items: ['canvas'], none: true, initial: 'none' }),
  scarf: Object.freeze({ label: 'Scarf', choices: ['none', 'gold', 'tricolor'], items: ['gold', 'tricolor'], none: true, initial: 'gold' }),
})

export const SLOT_ORDER = Object.freeze(Object.keys(SLOTS))

export const POSES = Object.freeze(['idle', 'wave', 'point', 'celebrate', 'phone', 'walk'])
export const POSE_LABELS = Object.freeze({ idle: 'Relaxed', wave: 'Wave', point: 'Point', celebrate: 'Celebrate', phone: 'Hold a phone', walk: 'Walk' })

// Same named materials as the v1 library.
export const SKIN_MATERIAL = 'Warm skin'
export const EAR_MATERIAL = 'Ear warmth'
export const HAIR_MATERIALS = Object.freeze({ base: 'Hair chestnut', highlight: 'Hair highlight', shadow: 'Hair shadow' })

export const SKIN_TONES = Object.freeze(['#e4b88e', '#d6a477', '#946244', '#694531'])
export const HAIR_COLORS = Object.freeze(['#503429', '#1f1712', '#7a4a22', '#b8853f', '#d9c5a3', '#6b6b6b'])

const HEX = /^#[0-9a-f]{6}$/i

export function defaultConfig() {
  const config = { version: CONFIG_VERSION, skin: SKIN_TONES[1], hairColor: HAIR_COLORS[0], pose: 'idle' }
  for (const slot of SLOT_ORDER) config[slot] = SLOTS[slot].initial
  return config
}

// Item key used both for GLB discovery and visibility maps.
export const itemKey = (slot, id) => `${slot}/${id}`

// A hat requires the fitted "-hat" hair variant of the chosen style.
export function resolveHairItem(hair, hat) {
  if (!hair || hair === 'none') return null
  return hat && hat !== 'none' ? `${hair}-hat` : hair
}

// Returns the set of item keys that should be visible for a config.
export function visibleItems(config) {
  const visible = new Set()
  for (const slot of SLOT_ORDER) {
    const choice = config[slot]
    if (!choice || choice === 'none') continue
    const id = slot === 'hair' ? resolveHairItem(choice, config.hat) : choice
    if (id) visible.add(itemKey(slot, id))
  }
  return visible
}

// Full visibility map for every catalog item, true when it should show.
export function visibilityMap(config) {
  const visible = visibleItems(config)
  const map = {}
  for (const slot of SLOT_ORDER) for (const id of SLOTS[slot].items) map[itemKey(slot, id)] = visible.has(itemKey(slot, id))
  return map
}

// Apply one selector change, returning a new config.
export function setSlot(config, slot, choice) {
  if (!SLOTS[slot]) throw new Error(`Unknown slot "${slot}"`)
  if (!SLOTS[slot].choices.includes(choice)) throw new Error(`Slot "${slot}" has no choice "${choice}"`)
  return { ...config, [slot]: choice }
}

// Validate an arbitrary parsed JSON value. Returns { ok, config, errors }.
// Unknown keys are dropped; missing optional keys take defaults; errors are
// collected rather than thrown so the UI can list them.
export function validateConfig(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, config: null, errors: ['Config must be a JSON object'] }
  const config = defaultConfig()
  if (input.version !== undefined) {
    if (input.version !== CONFIG_VERSION) errors.push(`Unsupported version ${JSON.stringify(input.version)}; expected ${CONFIG_VERSION}`)
  }
  for (const slot of SLOT_ORDER) {
    const value = input[slot]
    if (value === undefined) continue
    if (typeof value !== 'string' || !SLOTS[slot].choices.includes(value)) errors.push(`${slot}: expected one of ${SLOTS[slot].choices.join(', ')}; got ${JSON.stringify(value)}`)
    else config[slot] = value
  }
  for (const key of ['skin', 'hairColor']) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value !== 'string' || !HEX.test(value)) errors.push(`${key}: expected a #rrggbb color; got ${JSON.stringify(value)}`)
    else config[key] = value.toLowerCase()
  }
  if (input.pose !== undefined) {
    if (typeof input.pose !== 'string' || !POSES.includes(input.pose)) errors.push(`pose: expected one of ${POSES.join(', ')}; got ${JSON.stringify(input.pose)}`)
    else config.pose = input.pose
  }
  return { ok: errors.length === 0, config: errors.length === 0 ? config : null, errors }
}

export function parseConfig(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch (e) { return { ok: false, config: null, errors: [`Invalid JSON: ${e.message}`] } }
  return validateConfig(parsed)
}

export function serializeConfig(config) {
  const out = { version: CONFIG_VERSION }
  for (const slot of SLOT_ORDER) out[slot] = config[slot]
  out.skin = config.skin
  out.hairColor = config.hairColor
  out.pose = config.pose
  return JSON.stringify(out, null, 2)
}

// Given the item tags found on meshes ([{slot, id}]), report which expected
// catalog items are present, which are missing and which are unexpected.
export function discoverItems(found) {
  const seen = new Set(found.map(f => itemKey(f.slot, f.id)))
  const present = [], missing = [], unexpected = []
  for (const slot of SLOT_ORDER) for (const id of SLOTS[slot].items) (seen.has(itemKey(slot, id)) ? present : missing).push(itemKey(slot, id))
  const expected = new Set(present.concat(missing))
  for (const key of seen) if (!expected.has(key)) unexpected.push(key)
  return { present, missing, unexpected: unexpected.sort() }
}

// Read an item tag from a userData-like object. Accepts the canonical
// `item_slot` / `item_id` extras, and returns null when absent.
export function itemTag(userData) {
  if (!userData) return null
  const slot = userData.item_slot, id = userData.item_id
  if (typeof slot !== 'string' || typeof id !== 'string' || !slot || !id) return null
  return { slot, id }
}

// Derive the highlight and shadow hair tints from a base color so the three
// named hair materials keep their relative contrast.
export function hairPalette(hex) {
  const [h, s, l] = hexToHsl(hex)
  return {
    base: hex.toLowerCase(),
    highlight: hslToHex(h, s, Math.min(1, l + 0.08)),
    shadow: hslToHex(h, s, Math.max(0, l - 0.07)),
  }
}

export function skinPalette(hex) {
  const [h, s, l] = hexToHsl(hex)
  return { skin: hex.toLowerCase(), ear: hslToHex(h, Math.min(1, s + 0.04), Math.max(0, l - 0.08)) }
}

export function hexToHsl(hex) {
  if (!HEX.test(hex)) throw new Error(`Bad color ${hex}`)
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

export function hslToHex(h, s, l) {
  const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
  const to = x => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}
