import { resolve, sep } from 'node:path'
const base = import.meta.dir
const vendor = resolve(base, '../../web/node_modules/three')
const tokens = resolve(base, '../../web/src/generated/design-tokens.css')
Bun.serve({ hostname: '127.0.0.1', port: 8743, async fetch(req) {
  const path = decodeURIComponent(new URL(req.url).pathname)
  if (path === '/tokens.css') return new Response(Bun.file(tokens))
  const root = path.startsWith('/vendor/') ? vendor : base
  const relative = path.startsWith('/vendor/') ? path.slice(8) : path === '/' ? 'index.html' : path.slice(1)
  const file = resolve(root, relative)
  if (!file.startsWith(root + sep)) return new Response('Not found', { status: 404 })
  if (!await Bun.file(file).exists()) return new Response('Not found', { status: 404 })
  return new Response(Bun.file(file), { headers: { 'Cache-Control': 'no-cache' } })
}})
console.log('Character studio: http://127.0.0.1:8743')
