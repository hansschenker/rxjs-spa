import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@rxjs-spa/core',
      '@rxjs-spa/dom',
      '@rxjs-spa/router',
      '@rxjs-spa/store',
      '@rxjs-spa/http',
      '@rxjs-spa/forms',
    ],
  },
})
