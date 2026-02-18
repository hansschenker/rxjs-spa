import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@rxjs-spa/core':    path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@rxjs-spa/dom':     path.resolve(__dirname, '../../packages/dom/src/index.ts'),
      '@rxjs-spa/store':   path.resolve(__dirname, '../../packages/store/src/index.ts'),
      '@rxjs-spa/persist': path.resolve(__dirname, '../../packages/persist/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: [
      '@rxjs-spa/core',
      '@rxjs-spa/dom',
      '@rxjs-spa/store',
      '@rxjs-spa/persist',
    ],
  },
})
