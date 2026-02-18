import { map, switchMap } from 'rxjs/operators'
import { html } from '@rxjs-spa/dom'
import { createRouter, lazy } from '@rxjs-spa/router'

import './style.css'

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createRouter({
  '/':      'home',
  '/about': 'about',
  '/posts': 'posts',
  '*':      'not-found',
} as const, { mode: 'hash' })

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const isActive = (name: string) =>
  router.route$.pipe(map(r => r.name === name ? 'nav-link active' : 'nav-link'))

// ---------------------------------------------------------------------------
// View outlet — lazy-loads views on route change
// ---------------------------------------------------------------------------

const view$ = router.route$.pipe(
  switchMap(({ name }) => {
    switch (name) {
      case 'home':
        return lazy(() => import('./views/home.view')).pipe(
          map(m => m.homeView({})),
        )
      case 'about':
        return lazy(() => import('./views/about.view')).pipe(
          map(m => m.aboutView({})),
        )
      case 'posts':
        return lazy(() => import('./views/posts.view')).pipe(
          map(m => m.postsView({})),
        )
      default:
        return lazy(() => import('./views/not-found.view')).pipe(
          map(m => m.notFoundView({ router })),
        )
    }
  }),
)

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

const { fragment, sub } = html`
  <div class="app">
    <nav class="navbar">
      <span class="brand">rxjs-spa</span>
      <div class="nav-links">
        <a class="${isActive('home')}"  href="${router.link('/')}">Home</a>
        <a class="${isActive('about')}" href="${router.link('/about')}">About</a>
        <a class="${isActive('posts')}" href="${router.link('/posts')}">Posts</a>
      </div>
    </nav>
    <main class="main">
      ${view$}
    </main>
  </div>
`

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('app')!
root.appendChild(fragment)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sub.unsubscribe()
    router.destroy()
    root.innerHTML = ''
  })
}
