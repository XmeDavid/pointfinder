import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const strict = process.argv.includes('--strict')
const checks = [
  ['raw colors', '#[0-9a-fA-F]{6,8}', ['web-admin/src', 'ios-app/dbv-nfc-games', 'android-app/app/src', 'android-app/feature']],
  ['raw Tailwind palettes', '(bg|text|border|fill|stroke)-(red|green|blue|amber|yellow|purple|slate|zinc|neutral)-[0-9]{2,3}', ['web-admin/src']],
  ['direct screen styling', '(shadow-(xl|2xl)|rounded-(2xl|3xl)|backdrop-blur)', ['web-admin/src/features']],
  ['unapproved web icon packages', 'from ["\\\'](@heroicons|react-icons|@mui/icons-material)', ['web-admin/src']],
]

const commonGlobs = [
  '--glob', '!**/generated/**',
  '--glob', '!**/Generated*.swift',
  '--glob', '!**/Generated*.kt',
  '--glob', '!**/generated_*',
  '--glob', '!**/*.test.*',
  '--glob', '!**/test/**',
  '--glob', '!**/assets/**',
  '--glob', '!**/Assets.xcassets/**',
]

let findings = 0
for (const [label, pattern, paths] of checks) {
  let output = ''
  try { output = execFileSync('rg', ['-n', ...commonGlobs, pattern, ...paths], { cwd: root, encoding: 'utf8' }) }
  catch (error) { output = error.stdout ?? '' }
  const lines = output.trim() ? output.trim().split('\n') : []
  findings += lines.length
  console.log(`\n${label}: ${lines.length}`)
  console.log(lines.slice(0, 40).join('\n'))
  if (lines.length > 40) console.log(`… ${lines.length - 40} more`)
}

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)])
}
const componentFiles = walk(resolve(root, 'web-admin/src/components')).filter((file) => /\.(tsx|ts)$/.test(file) && !file.endsWith('.test.tsx') && !file.endsWith('/index.ts'))
const byName = new Map()
for (const file of componentFiles) {
  const name = file.split('/').at(-1)
  byName.set(name, [...(byName.get(name) ?? []), file])
}
const duplicateNames = [...byName].filter(([, files]) => files.length > 1)
console.log(`\nduplicate component filenames: ${duplicateNames.length}`)
for (const [name, files] of duplicateNames) console.log(`${name}: ${files.map((file) => file.replace(`${root}/`, '')).join(', ')}`)

const swiftFiles = walk(resolve(root, 'ios-app/dbv-nfc-games')).filter((file) => file.endsWith('.swift'))
const kotlinFiles = walk(resolve(root, 'android-app')).filter((file) => file.endsWith('.kt'))
const swiftPreviews = swiftFiles.filter((file) => /#Preview|PreviewProvider/.test(readFileSync(file, 'utf8'))).length
const composePreviews = kotlinFiles.filter((file) => /@Preview/.test(readFileSync(file, 'utf8'))).length
console.log(`\nnative preview coverage signal: Swift ${swiftPreviews}/${swiftFiles.length} files, Compose ${composePreviews}/${kotlinFiles.length} files`)
findings += duplicateNames.length
console.log(`\nAdvisory audit complete: ${findings} findings. See design-system/decisions.md for exceptions.`)
if (strict && findings) process.exitCode = 1
