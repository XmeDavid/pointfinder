// Rebuild the Tauri desktop, iOS and Android icon sets from the pinned brand
// exports, then pin the results in design-system/brand/exports.json so
// `generate.mjs --check` detects drift in the final Tauri assets as well.
// Usage: node design-system/scripts/brand-tauri.mjs
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPORTS_MANIFEST_RELATIVE, TAURI_ICON_MANIFEST_RELATIVE, TAURI_OUTPUT_DIRS, normalizeIcns } from './brand.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = resolve(root, EXPORTS_MANIFEST_RELATIVE)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const inputHash = sha256(readFileSync(resolve(root, TAURI_ICON_MANIFEST_RELATIVE)))
if (manifest.files?.[TAURI_ICON_MANIFEST_RELATIVE] !== inputHash) {
  console.error(`${TAURI_ICON_MANIFEST_RELATIVE} is not the pinned raster export; run brand-raster.py first`)
  process.exit(1)
}

execFileSync('bun', ['run', 'tauri', 'icon', resolve(root, TAURI_ICON_MANIFEST_RELATIVE)], { cwd: resolve(root, 'mobile'), stdio: 'inherit' })

const icnsPath = resolve(root, 'mobile/src-tauri/icons/icon.icns')
writeFileSync(icnsPath, normalizeIcns(readFileSync(icnsPath)))

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)])
const files = {}
for (const dir of TAURI_OUTPUT_DIRS) {
  for (const file of walk(resolve(root, dir)).sort()) {
    const rel = relative(root, file)
    files[rel] = sha256(readFileSync(file))
  }
}
manifest.tauri = { input: TAURI_ICON_MANIFEST_RELATIVE, inputSha256: inputHash, files }
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`pinned ${Object.keys(files).length} Tauri icon files in ${EXPORTS_MANIFEST_RELATIVE}`)
