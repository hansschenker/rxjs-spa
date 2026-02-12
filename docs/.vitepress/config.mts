import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'rxjs-spa',
  description: 'RxJS-first SPA monorepo (apps + libs + docs)',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/overview' },
      { text: 'API', link: '/api/core' },
      { text: 'DOM', link: '/api/dom' },
    ],
    sidebar: {
      '/guide/': [
        { text: 'Overview', link: '/guide/overview' },
        { text: 'Workspaces', link: '/guide/workspaces' },
      ],
      '/api/': [
        { text: 'Core', link: '/api/core' },
        { text: 'DOM', link: '/api/dom' },
      ],
    },
  },
})
