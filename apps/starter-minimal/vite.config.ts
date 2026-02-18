import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@rxjs-spa/dom': path.resolve(__dirname, '../../packages/dom/src/index.ts'),
      '@rxjs-spa/store': path.resolve(__dirname, '../../packages/store/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@rxjs-spa/dom', '@rxjs-spa/store'],
  },
})
