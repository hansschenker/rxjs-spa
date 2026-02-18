import { of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { html } from '@rxjs-spa/dom'
import { createRouter, lazy, withGuard, withScrollReset } from '@rxjs-spa/router'
import { appStore } from './store/app.store'
import { errorHandler } from './error-handler'
import { createNav } from './components/nav'
import { DevTools } from './components/devtools'

import './style.css'

// ---------------------------------------------------------------------------
// Error Toast
// ---------------------------------------------------------------------------

const toastEl = document.createElement('div')
toastEl.id = 'error-toast'
toastEl.className = 'error-toast hidden'
document.body.appendChild(toastEl)

let toastTimer: ReturnType<typeof setTimeout> | null = null
errorHandler.errors$.subscribe(e => {
  toastEl.textContent = e.message
  toastEl.classList.remove('hidden')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000)
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createRouter({
  '/':            'home',
  '/users':       'users',
  '/users/:id':   'user-detail',
  '/contact':     'contact',
  '/login':       'login',
  '*':            'not-found',
} as const, { mode: 'hash' })

// ---------------------------------------------------------------------------
// Route guard — protect authenticated routes
// ---------------------------------------------------------------------------

const PROTECTED = ['users', 'user-detail'] as const

const guarded$ = router.route$.pipe(
  withGuard([...PROTECTED] as string[], () => of(appStore.getState().isAuthenticated), () => {
    const path = window.location.hash.slice(1) || '/'
    appStore.dispatch({ type: 'SET_REDIRECT', path })
    router.navigate('/login')
  }),
  withScrollReset(),
)

// ---------------------------------------------------------------------------
// View outlet (lazy loaded)
// ---------------------------------------------------------------------------

const view$ = guarded$.pipe(
  switchMap(({ name, params }) => {
    switch (name) {
      case 'home':
        return lazy(() => import('./views/home.view')).pipe(
          map(m => m.homeView({ appStore })),
        )
      case 'users':
        return lazy(() => import('./views/users.view')).pipe(
          map(m => m.usersView({ router })),
        )
      case 'user-detail':
        return lazy(() => import('./views/user-detail.view')).pipe(
          map(m => m.userDetailView({ router, params })),
        )
      case 'contact':
        // Contact uses imperative DOM — render into a container
        return lazy(() => import('./views/contact.view')).pipe(
          map(m => {
            const container = document.createElement('div')
            m.contactView(container)
            return { fragment: container, sub: { unsubscribe() {} } }
          }),
        )
      case 'login':
        return lazy(() => import('./views/login.view')).pipe(
          map(m => {
            const container = document.createElement('div')
            m.loginView(container, appStore, router)
            return { fragment: container, sub: { unsubscribe() {} } }
          }),
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

const nav = createNav(router)

const { fragment, sub } = html`
  <div class="app">
    ${nav}
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

// DevTools (development only)
let devToolsSub: { unsubscribe(): void } | null = null
if (import.meta.env.DEV) {
  const dtContainer = document.createElement('div')
  dtContainer.id = 'devtools-root'
  document.body.appendChild(dtContainer)

  const dt = DevTools(appStore, 'App')
  dtContainer.appendChild(dt.fragment)
  devToolsSub = dt.sub
}

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sub.unsubscribe()
    devToolsSub?.unsubscribe()
    router.destroy()
    toastEl.remove()
    document.getElementById('devtools-root')?.remove()
    root.innerHTML = ''
  })
}
