// Local art-review server for the modular character viewer.
// Serves only this directory, the installed Three.js package and the
// generated design tokens, on localhost. Run:
//   bun artifacts/pathfinder-modular-v2/serve.ts
import { resolve, sep } from 'node:path'

const base = import.meta.dir
const vendor = resolve(base, '../../web/node_modules/three')
const tokens = resolve(base, '../../web/src/generated/design-tokens.css')
const port = Number(process.env.PORT ?? 8745)

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8',
}

function contentType(file: string) {
  const dot = file.lastIndexOf('.')
  return types[file.slice(dot)] ?? 'application/octet-stream'
}

// Resolve a request path to a file inside one of the allowed roots, or null.
export function resolveSafe(pathname: string): string | null {
  let path: string
  try { path = decodeURIComponent(pathname) } catch { return null }
  if (path.includes('\0') || path.split('/').includes('..')) return null
  if (path === '/tokens.css') return tokens
  const isVendor = path.startsWith('/vendor/')
  const root = isVendor ? vendor : base
  const relative = isVendor ? path.slice(8) : path === '/' ? 'index.html' : path.slice(1)
  if (!relative) return null
  const file = resolve(root, relative)
  if (!file.startsWith(root + sep)) return null
  // Never serve the server, its tests or Blender sources.
  if (!isVendor && (/\.(ts|py|blend1?|test\.js)$/.test(file) || relative.startsWith('source/'))) return null
  return file
}

if (import.meta.main) {
  Bun.serve({
    hostname: '127.0.0.1', port,
    async fetch(req) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      const file = resolveSafe(new URL(req.url).pathname)
      if (!file) return new Response('Not found', { status: 404 })
      const handle = Bun.file(file)
      if (!await handle.exists()) return new Response('Not found', { status: 404 })
      return new Response(handle, { headers: { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } })
    },
  })
  console.log(`Modular character viewer: http://127.0.0.1:${port}`)
}
