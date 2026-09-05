import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import type { Plugin } from 'vite'

/** Precache application files only. API responses and map tiles never enter this cache. */
export function offlineShell(): Plugin {
  return {
    name: 'pointfinder-offline-shell', apply: 'build', enforce: 'post',
    generateBundle(_, bundle) {
      const assets = ['/index.html', ...Object.keys(bundle).filter((file) => !file.endsWith('.map')).map((file) => `/${file}`), ...readdirSync(new URL('../public/fonts/', import.meta.url)).map((file) => `/fonts/${file}`)]
      const revision = createHash('sha256').update(Object.keys(bundle).join('\n')).digest('hex').slice(0, 16)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'pointfinder-shell-${revision}';
const ASSETS = ${JSON.stringify([...new Set(assets)])};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
// Let existing tabs finish on their installed version before activating an update.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('pointfinder-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match('/index.html')).then((response) => response || fetch(event.request)));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(url.pathname)).then((response) => response || fetch(event.request)));
  }
});
` })
    },
  }
}
