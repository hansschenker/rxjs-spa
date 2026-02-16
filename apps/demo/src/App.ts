import { of, EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import { Router, lazy, withGuard, withScrollReset } from '@rxjs-spa/router'
import { globalStore } from './store/global.store'
import { navComponent } from './components/nav' // We will refactor this to be a component too if needed, or use as is

// Guard Logic (moved from main.ts)
const PROTECTED_ROUTES = ['users', 'user-detail'] as const

function authGuard() {
    return of(globalStore.getState().isAuthenticated)
}

function onDenied(router: Router<string>) {
    // We need router instance here
    // In pure function we might rely on global or pass it.
    const path = typeof window !== 'undefined' ? (window.location.pathname || '/') : '/'
    globalStore.dispatch({ type: 'SET_REDIRECT', path })
    router.navigate('/login')
}

export const AppLayout = ({ router }: { router: Router<any> }) => {
    // Setup Guard
    const guarded$ = router.route$.pipe(
        withGuard([...PROTECTED_ROUTES] as string[], authGuard, () => onDenied(router)),
        withScrollReset(), // might act weird in SSR (window undefined), but simple check fixes it
    )

    // View Stream
    const view$ = guarded$.pipe(
        switchMap(({ name, params }) => {
            switch (name) {
                case 'home':
                    return lazy(() => import('./views/home.view')).pipe(
                        map((m) => m.homeView({ globalStore })),
                    )
                case 'users':
                    return lazy(() => import('./views/users.view')).pipe(
                        map((m) => m.usersView({ globalStore, router })),
                    )
                case 'user-detail':
                    return lazy(() => import('./views/user.view')).pipe(
                        map((m) => m.userDetailView({ globalStore, router, params })),
                    )
                case 'contact':
                    return of(html`<div>Contact View (SSR Refactor Pending)</div>`)
                case 'login':
                    return of(html`<div>Login View (SSR Refactor Pending)</div>`)
                case 'not-found':
                    return lazy(() => import('./views/not-found.view')).pipe(
                        map((m) => m.notFoundView({ router })),
                    )
                default:
                    return of(html`<div>Not Found</div>`)
            }
        })
    )

    return html`
    <nav>
    <!-- Nav is currently imperative, appending to an element. 
            If we want SSR Nav, we need to refactor it too. 
            For now, let's just make a simple declarative nav or use the imperative one via a directive? 
            No, imperative stuff breaks SSR. 
            I will inline the Nav for this demo or Wrap it. -->
    <a href="/">Home</a>
    <a href="/about">About</a> <!-- using simple links for now -->
    </nav>
    <main>
    ${view$}
    </main>
`
}

export const App = defineComponent<{ router: Router<any> }>(AppLayout)
