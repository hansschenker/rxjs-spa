import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Explicitly list each package and app directory so that
    // packages/vitest.config.ts (a file, not a package dir) is not
    // accidentally matched by a 'packages/*' glob and treated as a
    // nested workspace runner.
    projects: [
      'packages/core',
      'packages/dom',
      'packages/errors',
      'packages/forms',
      'packages/http',
      'packages/persist',
      'packages/router',
      'packages/store',
      'packages/testing',
      'apps/playground',
      'apps/demo',
    ],
  },
})
