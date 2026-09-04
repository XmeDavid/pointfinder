import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Shared workspace packages must use this app's React instance.
    dedupe: ['react', 'react-dom'],
  },
  define: {
    global: 'globalThis',
  },
  server: {
    host: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'pointfinder.pt',
      'pointfinder.ch',
    ],
  },
})
