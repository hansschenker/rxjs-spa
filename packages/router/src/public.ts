import { EMPTY, defer, from, fromEvent, Observable, OperatorFunction, of, Subject } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** URL params extracted from dynamic segments (e.g. `/users/:id`). */
export type RouteParams = Record<string, string>

/** Query string params (e.g. `?page=2&sort=name`). */
export type QueryParams = Record<string, string>

/** Router navigation mode. */
export type RouterMode = 'hash' | 'history'

/** Options for `createRouter`. */
export interface RouterOptions {
  /**
   * Navigation mode.
   * - `'hash'` (default) — uses `window.location.hash` + `hashchange`.
   * - `'history'` — uses `history.pushState` + `popstate` for clean URLs.
   *   Requires server-side fallback to `index.html` for all routes.
   */
  mode?: RouterMode
}

/** A matched route. */
export interface RouteMatch<N extends string = string> {
  /** The name you gave this route in `createRouter`. */
  name: N
  /** Extracted URL params (e.g. `{ id: '42' }` for `/users/:id`). */
  params: RouteParams
  /** Parsed query string params (e.g. `{ page: '2' }` for `?page=2`). */
  query: QueryParams
  /** The matched path without query string (e.g. `/users/42`). */
  path: string
}

/**
 * Map of path patterns → route names.
 *
 * @example
 *   const routes = {
 *     '/':           'home',
 *     '/users':      'users',
 *     '/users/:id':  'user-detail',
 *   } satisfies RouteDefinition<'home' | 'users' | 'user-detail'>
 */
export type RouteDefinition<N extends string> = Record<string, N>

export interface Router<N extends string> {
  /**
   * Multicasted stream of the current route. Replays the latest value to late
   * subscribers, so you can subscribe at any time and immediately know the
   * active route.
   *
   * Only emits when the route actually changes (path + query check).
   */
  route$: Observable<RouteMatch<N>>
  /**
   * Navigate to a path. In hash mode writes to `window.location.hash`;
   * in history mode calls `history.pushState`.
   *
   * @example router.navigate('/users/42')
   */
  navigate(path: string): void
  /**
   * Build an href string suitable for `<a href="...">`.
   *
   * - Hash mode:    `router.link('/users/42')` → `'#/users/42'`
   * - History mode: `router.link('/users/42')` → `'/users/42'`
   */
  link(path: string): string
  /**
   * Clean up global event listeners (click interceptor, popstate).
   * No-op in hash mode.
   */
  destroy(): void
}

// ---------------------------------------------------------------------------
// Internal: route matching
// ---------------------------------------------------------------------------

function matchPattern(pattern: string, path: string): RouteParams | null {
  const patternSegs = pattern.split('/')
  const pathSegs = path.split('/')

  if (patternSegs.length !== pathSegs.length) return null

  const params: RouteParams = {}

  for (let i = 0; i < patternSegs.length; i++) {
    const ps = patternSegs[i]
    const ts = pathSegs[i]

    if (ps.startsWith(':')) {
      params[ps.slice(1)] = decodeURIComponent(ts)
    } else if (ps !== ts) {
      return null
    }
  }

  return params
}

function matchRoutes<N extends string>(
  path: string,
  query: QueryParams,
  routes: RouteDefinition<N>,
): RouteMatch<N> | null {
  let wildcard: { name: N } | null = null

  for (const [pattern, name] of Object.entries(routes) as [string, N][]) {
    if (pattern === '*') {
      wildcard = { name }
      continue
    }
    const params = matchPattern(pattern, path)
    if (params !== null) {
      return { name, params, query, path }
    }
  }

  // Fall back to wildcard if no specific route matched
  if (wildcard) {
    return { name: wildcard.name, params: {}, query, path }
  }

  return null
}

function parseQuery(search: string): QueryParams {
  const query: QueryParams = {}
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return query

  for (const pair of raw.split('&')) {
    if (!pair) continue
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) {
      query[decodeURIComponent(pair)] = ''
    } else {
      query[decodeURIComponent(pair.slice(0, eqIndex))] = decodeURIComponent(pair.slice(eqIndex + 1))
    }
  }

  return query
}

function parseHash(hash: string): { path: string; query: QueryParams } {
  const raw = hash.replace(/^#/, '') || '/'
  const full = raw.startsWith('/') ? raw : '/' + raw

  const qIndex = full.indexOf('?')
  if (qIndex === -1) return { path: full, query: {} }

  const path = full.slice(0, qIndex) || '/'
  return { path, query: parseQuery(full.slice(qIndex + 1)) }
}

function parsePathname(): { path: string; query: QueryParams } {
  return {
    path: window.location.pathname || '/',
    query: parseQuery(window.location.search),
  }
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

/**
 * createRouter<N>(routes, options?)
 *
 * Creates a client-side router.
 *
 * - `mode: 'hash'` (default) — backed by `window.location.hash` + `hashchange`.
 * - `mode: 'history'` — backed by `history.pushState` + `popstate` with
 *   automatic `<a>` click interception. Requires the server to serve
 *   `index.html` for all routes (Vite dev server does this by default).
 *
 * In both modes:
 * - Subscribing to `route$` starts listening immediately.
 * - The stream replays the current route to late subscribers (shareReplay).
 * - Unrecognised paths are skipped unless a `'*'` wildcard route is defined.
 *
 * @example
 *   // Hash mode (default)
 *   const router = createRouter({
 *     '/':          'home',
 *     '/users':     'users',
 *     '/users/:id': 'user-detail',
 *     '*':          'not-found',
 *   })
 *
 *   // History mode — clean URLs
 *   const router = createRouter({
 *     '/':          'home',
 *     '/users':     'users',
 *     '/users/:id': 'user-detail',
 *     '*':          'not-found',
 *   }, { mode: 'history' })
 */
// ---------------------------------------------------------------------------
// withGuard — route guard operator
// ---------------------------------------------------------------------------

/**
 * withGuard(protectedRoutes, guardFn, onDenied)
 *
 * Operator that intercepts `route$` emissions and evaluates a guard function
 * for protected routes. If the guard returns `false`, `onDenied` is called
 * (typically to redirect to `/login`) and the route emission is suppressed.
 *
 * The guard function returns an `Observable<boolean>` so it supports both
 * synchronous checks (`of(isAuthenticated)`) and future async checks.
 *
 * Uses `switchMap` internally to cancel stale guard checks on rapid navigation.
 *
 * @example
 *   const guarded$ = router.route$.pipe(
 *     withGuard(
 *       ['dashboard', 'profile'],
 *       () => of(authStore.getState().isAuthenticated),
 *       () => router.navigate('/login'),
 *     ),
 *   )
 */
export function withGuard<N extends string>(
  protectedRoutes: N[],
  guardFn: () => Observable<boolean>,
  onDenied: () => void,
): OperatorFunction<RouteMatch<N>, RouteMatch<N>> {
  return (source: Observable<RouteMatch<N>>): Observable<RouteMatch<N>> =>
    source.pipe(
      switchMap((match) => {
        if (!protectedRoutes.includes(match.name)) return of(match)
        return guardFn().pipe(
          switchMap((allowed) => {
            if (allowed) return of(match)
            onDenied()
            return EMPTY
          }),
          catchError(() => {
            onDenied()
            return EMPTY
          }),
        )
      }),
    )
}

// ---------------------------------------------------------------------------
// withScrollReset — scroll to top on route change
// ---------------------------------------------------------------------------

/**
 * withScrollReset()
 *
 * Operator that scrolls to the top of the page on each route emission.
 * Pipe after `withGuard` so denied routes don't trigger a scroll.
 *
 * @example
 *   const routed$ = router.route$.pipe(
 *     withGuard([...], guardFn, onDenied),
 *     withScrollReset(),
 *   )
 */
export function withScrollReset<N extends string>(): OperatorFunction<RouteMatch<N>, RouteMatch<N>> {
  return (source: Observable<RouteMatch<N>>): Observable<RouteMatch<N>> =>
    source.pipe(
      tap(() => window.scrollTo({ top: 0, left: 0 })),
    )
}

// ---------------------------------------------------------------------------
// lazy — cold Observable from dynamic import()
// ---------------------------------------------------------------------------

/**
 * lazy(loader)
 *
 * Wraps a dynamic `import()` call in a cold Observable. The import is only
 * triggered on subscribe, and `switchMap` in the consumer naturally cancels
 * stale loads on rapid navigation.
 *
 * @example
 *   lazy(() => import('./views/home.view')).pipe(
 *     map(m => m.homeView),
 *   )
 */
export function lazy<T>(loader: () => Promise<T>): Observable<T> {
  return defer(() => from(loader()))
}

export function createRouter<N extends string>(
  routes: RouteDefinition<N>,
  options?: RouterOptions,
): Router<N> {
  const mode = options?.mode ?? 'hash'

  if (mode === 'hash') {
    const route$ = fromEvent(window, 'hashchange').pipe(
      startWith(null),
      map(() => parseHash(window.location.hash)),
      map(({ path, query }) => matchRoutes(path, query, routes)),
      filter((r): r is RouteMatch<N> => r !== null),
      distinctUntilChanged((a, b) =>
        a.path === b.path && JSON.stringify(a.query) === JSON.stringify(b.query),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    )

    return {
      route$,
      navigate(path: string) {
        window.location.hash = path.startsWith('/') ? path : '/' + path
      },
      link(path: string): string {
        return '#' + (path.startsWith('/') ? path : '/' + path)
      },
      destroy() {},
    }
  }

  // -------------------------------------------------------------------------
  // History mode — pushState + popstate + click interception
  // -------------------------------------------------------------------------

  // pushState does NOT fire popstate, so we use a Subject as the single
  // notification channel for both programmatic navigation and browser
  // back/forward.
  const pathChange$ = new Subject<void>()

  const popstateSub = fromEvent(window, 'popstate').subscribe(() =>
    pathChange$.next(),
  )

  const route$ = pathChange$.pipe(
    startWith(undefined),
    map(() => parsePathname()),
    map(({ path, query }) => matchRoutes(path, query, routes)),
    filter((r): r is RouteMatch<N> => r !== null),
    distinctUntilChanged((a, b) =>
      a.path === b.path && JSON.stringify(a.query) === JSON.stringify(b.query),
    ),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  // Delegated click handler — intercepts <a> clicks so they don't cause
  // full-page reloads. Checks: left-click only, no modifier keys, same
  // origin, no target/_blank, no download attribute.
  function onClick(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

    let el = e.target as HTMLElement | null
    while (el && el.tagName !== 'A') el = el.parentElement
    if (!el) return

    const anchor = el as HTMLAnchorElement
    if (anchor.target && anchor.target !== '_self') return
    if (anchor.hasAttribute('download')) return
    if (anchor.origin !== window.location.origin) return

    e.preventDefault()
    const path = anchor.pathname + anchor.search
    history.pushState(null, '', path)
    pathChange$.next()
  }

  document.addEventListener('click', onClick)

  return {
    route$,
    navigate(path: string) {
      const fullPath = path.startsWith('/') ? path : '/' + path
      history.pushState(null, '', fullPath)
      pathChange$.next()
    },
    link(path: string): string {
      return path.startsWith('/') ? path : '/' + path
    },
    destroy() {
      popstateSub.unsubscribe()
      document.removeEventListener('click', onClick)
    },
  }
}
