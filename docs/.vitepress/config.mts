import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'rxjs-spa',
  description: 'RxJS-first SPA monorepo (apps + libs + docs)',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/overview' },
      { text: 'API', link: '/api/core' },
    ],
    sidebar: {
      '/guide/': [
        { text: 'Overview', link: '/guide/overview' },
        { text: 'Architecture', link: '/guide/architecture' },
        { text: 'Workspaces', link: '/guide/workspaces' },
      ],
      '/api/': [
        { text: 'Core', link: '/api/core' },
        { text: 'DOM', link: '/api/dom' },
        { text: 'Store', link: '/api/store' },
        { text: 'HTTP', link: '/api/http' },
        { text: 'Router', link: '/api/router' },
        { text: 'Forms', link: '/api/forms' },
      ],
    },
  },
})
