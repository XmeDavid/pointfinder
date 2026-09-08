import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeIcns } from './brand.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (name) => JSON.parse(await readFile(resolve(root, name), 'utf8'))
const tokens = await readJson('tokens.json')
const icons = await readJson('icons.json')
const scenarios = await readJson('scenarios.json')

function leafPaths(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key.startsWith('$')) return []
    const path = prefix ? `${prefix}.${key}` : key
    return value && typeof value === 'object' && '$value' in value ? [path] : leafPaths(value, path)
  })
}

assert.match(tokens.$extensions.pointfinder.version, /^\d+\.\d+\.\d+$/)
assert.deepEqual(leafPaths(tokens.color.light), leafPaths(tokens.color.dark), 'light/dark semantic color paths must match')
assert.ok(leafPaths(tokens).length >= 70, 'canonical foundation unexpectedly incomplete')
for (const [concept, mapping] of Object.entries(icons.icons)) {
  assert.ok(mapping.lucide && mapping.sfSymbol && mapping.material, `${concept} must map on every platform`)
}
assert.deepEqual(scenarios.scenarios.map(({ id }) => id), ['default', 'selected', 'disabled', 'loading', 'empty', 'error', 'offline', 'queued', 'stale', 'destructive', 'longCopy'])
// Entry ordering must not change the pinned macOS icon or its image payloads.
const unorderedIcns = Buffer.from('69636e7300000020696330380000000c01020304696330370000000c05060708', 'hex')
const orderedIcns = Buffer.from('69636e7300000020696330370000000c05060708696330380000000c01020304', 'hex')
assert.deepEqual(normalizeIcns(unorderedIcns), orderedIcns)
assert.deepEqual(normalizeIcns(orderedIcns), orderedIcns)
const brokenIcns = Buffer.from(unorderedIcns)
brokenIcns.writeUInt32BE(0, 12)
assert.throws(() => normalizeIcns(brokenIcns), /invalid ICNS entry length/)
assert.throws(() => normalizeIcns(unorderedIcns.subarray(0, 6)), /invalid ICNS container/)
console.log(`validated ${leafPaths(tokens).length} token leaves, ${Object.keys(icons.icons).length} icons, and ${scenarios.scenarios.length} scenarios`)
