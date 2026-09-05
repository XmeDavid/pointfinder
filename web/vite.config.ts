import { offlineShell } from './build/offlineShell'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const native = mode === 'native'
  const host = process.env.TAURI_DEV_HOST
  return {
    plugins: [react(), tailwindcss(), ...(!native ? [offlineShell()] : [])],
    resolve: { alias: { '@': path.resolve(__dirname, './src') }, dedupe: ['react', 'react-dom'] },
    define: { global: 'globalThis', 'import.meta.env.VITE_NATIVE_BUILD': JSON.stringify(native) },
    build: { outDir: native ? 'dist-native' : 'dist' },
    clearScreen: !native,
    server: {
      host: native ? host || '0.0.0.0' : true,
      port: native ? 1420 : 5173,
      strictPort: native,
      allowedHosts: ['localhost', '127.0.0.1', 'pointfinder.pt', 'pointfinder.ch'],
      hmr: native && host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
    },
  }
})
