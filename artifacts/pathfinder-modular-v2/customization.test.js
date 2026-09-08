import { describe, expect, test } from 'bun:test'
import {
  CONFIG_VERSION, SLOTS, SLOT_ORDER, POSES, SKIN_TONES, HAIR_COLORS,
  defaultConfig, resolveHairItem, visibleItems, visibilityMap, setSlot,
  validateConfig, parseConfig, serializeConfig, discoverItems, itemTag,
  hairPalette, skinPalette, hexToHsl, hslToHex,
} from './customization.js'

describe('catalog', () => {
  test('exposes the five slots in order with none where allowed', () => {
    expect(SLOT_ORDER).toEqual(['base', 'hair', 'hat', 'backpack', 'scarf'])
    expect(SLOTS.base.none).toBe(false)
    expect(SLOTS.base.choices).toEqual(['uniform'])
    for (const slot of ['hair', 'hat', 'backpack', 'scarf']) expect(SLOTS[slot].choices[0]).toBe('none')
    expect(SLOTS.hair.items).toEqual(['short', 'ponytail', 'short-hat', 'ponytail-hat'])
    expect(SLOTS.hat.items).toEqual(['ranger'])
    expect(SLOTS.backpack.items).toEqual(['canvas'])
    expect(SLOTS.scarf.items).toEqual(['gold', 'tricolor'])
  })

  test('hair selector never offers the hat variants directly', () => {
    expect(SLOTS.hair.choices).toEqual(['none', 'short', 'ponytail'])
  })

  test('default config is valid', () => {
    const config = defaultConfig()
    expect(config.version).toBe(CONFIG_VERSION)
    expect(config.base).toBe('uniform')
    expect(validateConfig(config).ok).toBe(true)
    expect(POSES).toContain(config.pose)
    expect(SKIN_TONES).toContain(config.skin)
    expect(HAIR_COLORS).toContain(config.hairColor)
  })
})

describe('hair and hat coupling', () => {
  test('hat swaps hair to the fitted variant', () => {
    expect(resolveHairItem('short', 'none')).toBe('short')
    expect(resolveHairItem('short', 'ranger')).toBe('short-hat')
    expect(resolveHairItem('ponytail', 'ranger')).toBe('ponytail-hat')
    expect(resolveHairItem('none', 'ranger')).toBeNull()
  })

  test('visible items follow the coupling', () => {
    const config = { ...defaultConfig(), hair: 'ponytail', hat: 'ranger', backpack: 'canvas', scarf: 'tricolor' }
    expect([...visibleItems(config)].sort()).toEqual(['backpack/canvas', 'base/uniform', 'hair/ponytail-hat', 'hat/ranger', 'scarf/tricolor'])
  })

  test('removing the hat restores the open hair', () => {
    let config = setSlot(defaultConfig(), 'hat', 'ranger')
    expect(visibleItems(config).has('hair/short-hat')).toBe(true)
    config = setSlot(config, 'hat', 'none')
    expect(visibleItems(config).has('hair/short')).toBe(true)
    expect(visibleItems(config).has('hair/short-hat')).toBe(false)
  })

  test('visibility map covers every catalog item exactly once', () => {
    const map = visibilityMap(defaultConfig())
    expect(Object.keys(map).length).toBe(9)
    expect(map['base/uniform']).toBe(true)
    expect(map['hair/short']).toBe(true)
    expect(map['hair/short-hat']).toBe(false)
    expect(map['hat/ranger']).toBe(false)
    expect(map['scarf/gold']).toBe(true)
  })
})

describe('setSlot', () => {
  test('returns a new object and rejects bad input', () => {
    const before = defaultConfig()
    const after = setSlot(before, 'scarf', 'none')
    expect(after).not.toBe(before)
    expect(before.scarf).toBe('gold')
    expect(after.scarf).toBe('none')
    expect(() => setSlot(before, 'shoes', 'boots')).toThrow(/Unknown slot/)
    expect(() => setSlot(before, 'hair', 'short-hat')).toThrow(/no choice/)
    expect(() => setSlot(before, 'base', 'none')).toThrow(/no choice/)
  })
})

describe('validateConfig', () => {
  test('accepts a full config and lowercases colors', () => {
    const r = validateConfig({ version: 1, base: 'uniform', hair: 'ponytail', hat: 'ranger', backpack: 'canvas', scarf: 'tricolor', skin: '#E4B88E', hairColor: '#1F1712', pose: 'walk' })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.config.skin).toBe('#e4b88e')
    expect(r.config.pose).toBe('walk')
  })

  test('fills defaults for missing keys and ignores unknown keys', () => {
    const r = validateConfig({ hat: 'ranger', extra: 42 })
    expect(r.ok).toBe(true)
    expect(r.config.hair).toBe('short')
    expect(r.config.hat).toBe('ranger')
    expect('extra' in r.config).toBe(false)
  })

  test('collects every error instead of stopping at the first', () => {
    const r = validateConfig({ version: 2, hair: 'mohawk', hat: 3, skin: 'red', pose: 'dab' })
    expect(r.ok).toBe(false)
    expect(r.config).toBeNull()
    expect(r.errors.length).toBe(5)
    expect(r.errors.join('\n')).toMatch(/version/)
    expect(r.errors.join('\n')).toMatch(/hair: expected one of none, short, ponytail/)
    expect(r.errors.join('\n')).toMatch(/pose/)
  })

  test('rejects non-objects', () => {
    for (const bad of [null, 'x', 7, [1]]) expect(validateConfig(bad).ok).toBe(false)
  })

  test('rejects hat hair variants as direct choices', () => {
    expect(validateConfig({ hair: 'short-hat' }).ok).toBe(false)
  })
})

describe('parse and serialize', () => {
  test('round trips', () => {
    const config = { ...defaultConfig(), hat: 'ranger', backpack: 'canvas', skin: '#694531', pose: 'wave' }
    const text = serializeConfig(config)
    expect(JSON.parse(text).version).toBe(CONFIG_VERSION)
    const r = parseConfig(text)
    expect(r.ok).toBe(true)
    expect(r.config).toEqual(config)
  })

  test('serialized key order is stable', () => {
    expect(Object.keys(JSON.parse(serializeConfig(defaultConfig())))).toEqual(['version', 'base', 'hair', 'hat', 'backpack', 'scarf', 'skin', 'hairColor', 'pose'])
  })

  test('reports invalid JSON', () => {
    const r = parseConfig('{not json')
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/Invalid JSON/)
  })
})

describe('GLB discovery', () => {
  test('reads canonical extras and ignores partial tags', () => {
    expect(itemTag({ item_slot: 'hair', item_id: 'short' })).toEqual({ slot: 'hair', id: 'short' })
    expect(itemTag({ item_slot: 'hair' })).toBeNull()
    expect(itemTag({ item_slot: 1, item_id: 'x' })).toBeNull()
    expect(itemTag(undefined)).toBeNull()
    expect(itemTag({})).toBeNull()
  })

  test('reports present, missing and unexpected items', () => {
    const found = [
      { slot: 'base', id: 'uniform' }, { slot: 'hair', id: 'short' }, { slot: 'hair', id: 'short' },
      { slot: 'hat', id: 'ranger' }, { slot: 'cape', id: 'red' },
    ]
    const r = discoverItems(found)
    expect(r.present).toEqual(['base/uniform', 'hair/short', 'hat/ranger'])
    expect(r.missing).toEqual(['hair/ponytail', 'hair/short-hat', 'hair/ponytail-hat', 'backpack/canvas', 'scarf/gold', 'scarf/tricolor'])
    expect(r.unexpected).toEqual(['cape/red'])
  })

  test('a complete library has nothing missing', () => {
    const found = []
    for (const slot of SLOT_ORDER) for (const id of SLOTS[slot].items) found.push({ slot, id })
    const r = discoverItems(found)
    expect(r.missing).toEqual([])
    expect(r.unexpected).toEqual([])
    expect(r.present.length).toBe(9)
  })
})

describe('palettes', () => {
  test('hex/hsl round trip', () => {
    for (const hex of ['#000000', '#ffffff', '#c99061', '#493025', '#1f1712', '#00ff00'])
      expect(hslToHex(...hexToHsl(hex))).toBe(hex)
    expect(() => hexToHsl('red')).toThrow()
  })

  test('hair palette keeps highlight lighter and shadow darker', () => {
    const p = hairPalette('#493025')
    expect(p.base).toBe('#493025')
    expect(hexToHsl(p.highlight)[2]).toBeGreaterThan(hexToHsl(p.base)[2])
    expect(hexToHsl(p.shadow)[2]).toBeLessThan(hexToHsl(p.base)[2])
    const black = hairPalette('#000000')
    expect(black.shadow).toBe('#000000')
  })

  test('skin palette derives a darker ear tint', () => {
    const p = skinPalette('#C99061')
    expect(p.skin).toBe('#c99061')
    expect(hexToHsl(p.ear)[2]).toBeLessThan(hexToHsl(p.skin)[2])
  })
})
