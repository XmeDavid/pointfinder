import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import vitePrerender from 'vite-plugin-prerender'

const Renderer = vitePrerender.PuppeteerRenderer

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    vitePrerender({
      staticDir: path.join(__dirname, 'dist'),
      routes: ['/', '/privacy'],
      renderer: new Renderer({
        renderAfterTime: 3000,
        headless: true,
      }),
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    host: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'desbravadores.dev',
    ],
  },
})
