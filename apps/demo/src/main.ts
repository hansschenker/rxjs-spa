import './style.css'
import { EMPTY, Subscription, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { createRouter, withGuard, withScrollReset, lazy } from '@rxjs-spa/router'
import { documentTitle } from '@rxjs-spa/dom'
import { errorHandler, errorSub } from './error-handler'
import { globalStore } from './store/global.store'
import { navComponent } from './components/nav'

// ---------------------------------------------------------------------------
// Error toast — shows errors from the global handler, auto-dismisses
// ---------------------------------------------------------------------------

const toastEl = document.createElement('div')
toastEl.id = 'error-toast'
toastEl.className = 'error-toast hidden'
document.body.appendChild(toastEl)

let toastTimer: ReturnType<typeof setTimeout> | null = null

const errorToastSub = errorHandler.errors$.subscribe((e) => {
  toastEl.textContent = e.message
  toastEl.classList.remove('hidden')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000)
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createRouter({
  '/':          'home',
  '/users':     'users',
  '/users/:id': 'user-detail',
  '/contact':   'contact',
  '/login':     'login',
  '*':          'not-found',
} as const, { mode: 'history' })

// ---------------------------------------------------------------------------
// Shell elements
// ---------------------------------------------------------------------------

const navEl    = document.querySelector<HTMLElement>('#nav')!
const outletEl = document.querySelector<HTMLElement>('#outlet')!

// ---------------------------------------------------------------------------
// Document title — updates browser tab on each route change
// ---------------------------------------------------------------------------

const ROUTE_TITLES: Record<string, string> = {
  'home':        'Home',
  'users':       'Users',
  'user-detail': 'User Detail',
  'contact':     'Contact',
  'login':       'Login',
  'not-found':   '404 Not Found',
}

const titleSub = documentTitle('rxjs-spa')(
  router.route$.pipe(map((r) => ROUTE_TITLES[r.name] ?? 'Page')),
)

// ---------------------------------------------------------------------------
// Nav — permanent; outlives route changes
// ---------------------------------------------------------------------------

const navSub = navComponent(navEl, router, globalStore)

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

const PROTECTED_ROUTES = ['users', 'user-detail'] as const

function authGuard() {
  return of(globalStore.getState().isAuthenticated)
}

function onDenied() {
  const path = window.location.pathname || '/'
  globalStore.dispatch({ type: 'SET_REDIRECT', path })
  router.navigate('/login')
}

const guarded$ = router.route$.pipe(
  withGuard([...PROTECTED_ROUTES], authGuard, onDenied),
  withScrollReset(),
)

// ---------------------------------------------------------------------------
// Outlet — lazy-loads views on route change (each view is a separate chunk)
// ---------------------------------------------------------------------------

let currentViewSub: Subscription | null = null

const outletSub = guarded$.pipe(
  switchMap(({ name, params }) => {
    switch (name) {
      case 'home':
        return lazy(() => import('./views/home.view')).pipe(
          map((m) => () => m.homeView(outletEl, globalStore)),
        )
      case 'users':
        return lazy(() => import('./views/users.view')).pipe(
          map((m) => () => m.usersView(outletEl, globalStore, router)),
        )
      case 'user-detail':
        return lazy(() => import('./views/user.view')).pipe(
          map((m) => () => m.userDetailView(outletEl, globalStore, router, params)),
        )
      case 'contact':
        return lazy(() => import('./views/contact.view')).pipe(
          map((m) => () => m.contactView(outletEl)),
        )
      case 'login':
        return lazy(() => import('./views/login.view')).pipe(
          map((m) => () => m.loginView(outletEl, globalStore, router)),
        )
      case 'not-found':
        return lazy(() => import('./views/not-found.view')).pipe(
          map((m) => () => m.notFoundView(outletEl, router)),
        )
      default:
        return EMPTY
    }
  }),
).subscribe((mountView) => {
  currentViewSub?.unsubscribe()
  outletEl.innerHTML = ''
  currentViewSub = mountView()
})

// ---------------------------------------------------------------------------
// Default route — navigate to / if pathname is empty
// ---------------------------------------------------------------------------

if (!window.location.pathname || window.location.pathname === '/') {
  router.navigate('/')
}

// ---------------------------------------------------------------------------
// HMR cleanup
// ---------------------------------------------------------------------------

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    router.destroy()
    titleSub.unsubscribe()
    navSub.unsubscribe()
    outletSub.unsubscribe()
    currentViewSub?.unsubscribe()
    errorSub.unsubscribe()
    errorToastSub.unsubscribe()
    toastEl.remove()
  })
}
