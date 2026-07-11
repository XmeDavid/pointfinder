import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
console.log(`validated ${leafPaths(tokens).length} token leaves, ${Object.keys(icons.icons).length} icons, and ${scenarios.scenarios.length} scenarios`)
