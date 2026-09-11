import { offlineShell } from './build/offlineShell'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

export default defineConfig(({ mode }) => {
  const localDesign = process.env.PF_LOCAL_DESIGN === '1'
  const localApi = localDesign || process.env.PF_LOCAL_API === '1'
  const native = mode === 'native'
  const host = process.env.TAURI_DEV_HOST
  return {
    plugins: [...(localDesign ? [{ name: 'local-design-catalog', configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/__local-design/catalog', async (_req, res) => {
        try { const body = await readFile(path.resolve(__dirname, '../data/design/catalog.json')); res.setHeader('Content-Type','application/json'); res.end(body) }
        catch { res.statusCode = 503; res.end('Local games have not been seeded') }
      })
    } }] : []), react(), tailwindcss(), ...(!native ? [offlineShell()] : [])],
    resolve: { alias: { '@': path.resolve(__dirname, './src') }, dedupe: ['react', 'react-dom'] },
    define: { 'import.meta.env.VITE_LOCAL_DESIGN': JSON.stringify(localDesign), global: 'globalThis', 'import.meta.env.VITE_NATIVE_BUILD': JSON.stringify(native) },
    build: { outDir: native ? 'dist-native' : 'dist' },
    clearScreen: !native,
    optimizeDeps: { entries: ['index.html'] },
    server: {
      proxy: localApi ? { '/api': 'http://127.0.0.1:8188', '/ws-native': { target: 'ws://127.0.0.1:8188', ws: true }, '/uploads': 'http://127.0.0.1:8188' } : undefined,
      host: native ? host || '0.0.0.0' : true,
      port: native ? 1420 : 5173,
      strictPort: native,
      allowedHosts: ['localhost', '127.0.0.1', 'pointfinder.pt', 'pointfinder.ch'],
      hmr: native && host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
    },
  }
})
