import { defineConfig } from 'vite'

export default defineConfig({
  // Local workspace packages are source code, not "deps" to prebundle.
  // Excluding them prevents optimize-deps from trying to treat them like npm deps.
  optimizeDeps: {
    exclude: ['@rxjs-spa/core', '@rxjs-spa/dom', '@rxjs-spa/router', '@rxjs-spa/store'],
  },

  // If you ever see duplicate module instances or weird HMR behavior in monorepos,
  // toggling this can help on some setups:
  // resolve: { preserveSymlinks: true },
})
