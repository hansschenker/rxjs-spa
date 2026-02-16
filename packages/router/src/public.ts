import { EMPTY, defer, from, fromEvent, Observable, OperatorFunction, of, Subject, Subscription } from 'rxjs'
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
  /**
   * Initial URL for SSR / testing.
   * If provided, the router initializes in static mode (no window listeners).
   * @example '/users/123'
   */
  initialUrl?: string
}

/** An entry in the matched route chain (root-first). */
export interface MatchedSegment<N extends string = string> {
  name: N
  params: RouteParams
  path: string
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
  /**
   * Full chain of matched route segments, root-first.
   * For flat routes, contains a single entry. For nested routes,
   * contains parent → child → grandchild etc.
   */
  matched: MatchedSegment<N>[]
}

/**
 * Map of path patterns → route names (flat format).
 *
 * @example
 *   const routes = {
 *     '/':           'home',
 *     '/users':      'users',
 *     '/users/:id':  'user-detail',
 *   } satisfies FlatRouteDefinition<'home' | 'users' | 'user-detail'>
 */
export type FlatRouteDefinition<N extends string> = Record<string, N>

/**
 * Tree-based route config with optional children for nesting.
 *
 * @example
 *   const routes: RouteConfig<'users' | 'user-detail'>[] = [
 *     {
 *       path: '/users', name: 'users',
 *       children: [
 *         { path: ':id', name: 'user-detail' },
 *       ],
 *     },
 *   ]
 */
export interface RouteConfig<N extends string> {
  /** Path segment, e.g. '/users' or ':id'. Leading `/` is optional. */
  path: string
  /** Route name. */
  name: N
  /** Optional nested child routes. */
  children?: RouteConfig<N>[]
}

/**
 * Route definition: either a flat `Record<string, N>` or an array of `RouteConfig<N>`.
 *
 * @example
 *   // Flat format (backward-compatible)
 *   createRouter({ '/': 'home', '/users': 'users' })
 *
 *   // Nested format
 *   createRouter([
 *     { path: '/', name: 'home' },
 *     { path: '/users', name: 'users-layout', children: [
 *       { path: '', name: 'users-list' },
 *       { path: ':id', name: 'user-detail' },
 *     ]},
 *   ])
 */
export type RouteDefinition<N extends string> = FlatRouteDefinition<N> | RouteConfig<N>[]

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

/** Animation config for outlet enter/leave transitions. */
export interface OutletAnimationConfig {
  enter?: (el: Element) => Promise<void>
  leave?: (el: Element) => Promise<void>
}

/**
 * An outlet manages the lifecycle of child views inside a container element.
 * It tears down the current view and clears the container on each route emission.
 */
export interface Outlet<N extends string> {
  /** Observable of the current route match for this outlet. */
  route$: Observable<RouteMatch<N>>
  /** The container element. */
  element: Element
  /**
   * Subscribe to route changes and render views. Returns a single Subscription
   * that manages the outlet lifecycle. On each emission, the previous view's
   * subscription is unsubscribed and `element.innerHTML` is cleared before
   * calling `renderFn`.
   */
  subscribe(renderFn: (match: RouteMatch<N>) => Subscription | null): Subscription
}

// ---------------------------------------------------------------------------
// Internal: route tree
// ---------------------------------------------------------------------------

interface InternalRouteNode<N extends string> {
  /** Segment pattern — static string, ':param', or '*'. */
  segment: string
  /** Route name — always set. */
  name: N
  /** Nested children. */
  children: InternalRouteNode<N>[]
}

/** Detect whether a route definition is the flat Record format or array config. */
function isRouteConfigArray<N extends string>(
  routes: RouteDefinition<N>,
): routes is RouteConfig<N>[] {
  return Array.isArray(routes)
}

/**
 * Split a path into clean segments. Removes leading/trailing slashes and empty strings.
 * Examples: '/users/:id' → ['users', ':id'], '/' → [], '' → []
 */
function toSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

/**
 * Normalize any RouteDefinition into an internal tree of InternalRouteNode[].
 * - Flat `Record<string, N>`: each key is split on `/` to create a single leaf node.
 * - Array `RouteConfig<N>[]`: maps directly, recursing into children.
 */
function normalizeRoutes<N extends string>(
  routes: RouteDefinition<N>,
): InternalRouteNode<N>[] {
  if (isRouteConfigArray(routes)) {
    return routes.map((rc) => normalizeConfig(rc))
  }
  // Flat format — each pattern becomes a leaf (no children).
  // We keep the flat matching approach for simplicity: each pattern is one node
  // with segments derived from the full path.
  return flatToNodes(routes)
}

function normalizeConfig<N extends string>(
  rc: RouteConfig<N>,
): InternalRouteNode<N> {
  const segments = toSegments(rc.path)
  const segment = segments.join('/')  // normalize away leading slash
  return {
    segment,
    name: rc.name,
    children: rc.children ? rc.children.map(normalizeConfig) : [],
  }
}

/**
 * Convert flat routes into an array of leaf nodes. Each entry is a complete
 * path (all segments) in a single node with no children. The matching logic
 * handles this via `matchSegment` consuming all segments at once.
 */
function flatToNodes<N extends string>(
  routes: FlatRouteDefinition<N>,
): InternalRouteNode<N>[] {
  return (Object.entries(routes) as [string, N][]).map(([pattern, name]) => ({
    segment: pattern === '*' ? '*' : toSegments(pattern).join('/'),
    name,
    children: [],
  }))
}

// ---------------------------------------------------------------------------
// Internal: route matching
// ---------------------------------------------------------------------------

/**
 * Try to match `nodeSegments` against the front of `pathSegments` starting
 * at `offset`. Returns extracted params or null on mismatch.
 */
function matchSegments(
  nodeSegments: string[],
  pathSegments: string[],
  offset: number,
): RouteParams | null {
  if (nodeSegments.length === 0) {
    // Empty segment matches at current offset (like path: '' for index routes)
    return {}
  }

  if (offset + nodeSegments.length > pathSegments.length) return null

  const params: RouteParams = {}
  for (let i = 0; i < nodeSegments.length; i++) {
    const ns = nodeSegments[i]
    const ps = pathSegments[offset + i]
    if (ns.startsWith(':')) {
      params[ns.slice(1)] = decodeURIComponent(ps)
    } else if (ns !== ps) {
      return null
    }
  }
  return params
}

/**
 * Recursively match a path against the internal route tree.
 * Returns the deepest match with the full chain of matched ancestors.
 */
function matchRoutesTree<N extends string>(
  pathSegments: string[],
  query: QueryParams,
  fullPath: string,
  nodes: InternalRouteNode<N>[],
  offset: number,
  chain: MatchedSegment<N>[],
  accParams: RouteParams,
): RouteMatch<N> | null {
  let wildcardNode: InternalRouteNode<N> | null = null

  for (const node of nodes) {
    if (node.segment === '*') {
      wildcardNode = node
      continue
    }

    const nodeSegments = node.segment ? node.segment.split('/') : []
    const params = matchSegments(nodeSegments, pathSegments, offset)
    if (params === null) continue

    const nextOffset = offset + nodeSegments.length
    const mergedParams = { ...accParams, ...params }
    const segmentPath = '/' + pathSegments.slice(0, nextOffset).join('/')
    const matchEntry: MatchedSegment<N> = {
      name: node.name,
      params: mergedParams,
      path: segmentPath,
    }
    const nextChain = [...chain, matchEntry]

    // If this node has children, try to match deeper
    if (node.children.length > 0) {
      const childResult = matchRoutesTree(
        pathSegments, query, fullPath, node.children,
        nextOffset, nextChain, mergedParams,
      )
      if (childResult) return childResult

      // No child matched — if all segments consumed, match the parent itself
      if (nextOffset === pathSegments.length) {
        return {
          name: node.name,
          params: mergedParams,
          query,
          path: fullPath,
          matched: nextChain,
        }
      }
      // Has children but none matched and segments remain — skip this node
      continue
    }

    // Leaf node — all segments must be consumed
    if (nextOffset === pathSegments.length) {
      return {
        name: node.name,
        params: mergedParams,
        query,
        path: fullPath,
        matched: nextChain,
      }
    }
  }

  // Wildcard fallback at this level
  if (wildcardNode && offset <= pathSegments.length) {
    const segmentPath = '/' + pathSegments.join('/')
    const matchEntry: MatchedSegment<N> = {
      name: wildcardNode.name,
      params: accParams,
      path: segmentPath,
    }
    return {
      name: wildcardNode.name,
      params: accParams,
      query,
      path: fullPath,
      matched: [...chain, matchEntry],
    }
  }

  return null
}

/** Top-level matching function used by createRouter. */
function matchRoutes<N extends string>(
  path: string,
  query: QueryParams,
  nodes: InternalRouteNode<N>[],
): RouteMatch<N> | null {
  const segments = toSegments(path)
  return matchRoutesTree(segments, query, path, nodes, 0, [], {})
}

function parseQuery(search: string): QueryParams {
  const query: QueryParams = {}
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return query

  const decode = (str: string) => decodeURIComponent(str.replace(/\+/g, ' '))

  for (const pair of raw.split('&')) {
    if (!pair) continue
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) {
      query[decode(pair)] = ''
    } else {
      query[decode(pair.slice(0, eqIndex))] = decode(pair.slice(eqIndex + 1))
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
  const nodes = normalizeRoutes(routes)

  // -------------------------------------------------------------------------
  // SSR / Static Mode
  // -------------------------------------------------------------------------
  if (options?.initialUrl) {
    const { path, query } = parseUrl(options.initialUrl)
    const match = matchRoutes(path, query, nodes)

    // Create a static observable for the initial route
    const route$ = of(match).pipe(
      filter((r): r is RouteMatch<N> => r !== null),
      shareReplay({ bufferSize: 1, refCount: false })
    )

    return {
      route$,
      navigate: () => { }, // No-op in SSR
      link: (p) => p,     // Just return the path
      destroy: () => { },
    }
  }

  // Ensure window exists for browser modes
  if (typeof window === 'undefined') {
    throw new Error('Window is undefined. Provide `initialUrl` for SSR.')
  }

  // -------------------------------------------------------------------------
  // Hash Mode
  // -------------------------------------------------------------------------
  if (mode === 'hash') {
    const route$ = fromEvent(window, 'hashchange').pipe(
      startWith(null),
      map(() => parseHash(window.location.hash)),
      map(({ path, query }) => matchRoutes(path, query, nodes)),
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
      destroy() { },
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
    map(({ path, query }) => matchRoutes(path, query, nodes)),
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

// ---------------------------------------------------------------------------
// Utils for SSR
// ---------------------------------------------------------------------------

function parseUrl(url: string): { path: string; query: QueryParams } {
  const [path, search] = url.split('?')
  return { path: path || '/', query: parseQuery(search || '') }
}

// ---------------------------------------------------------------------------
// createOutlet — manages child view lifecycle
// ---------------------------------------------------------------------------

/**
 * createOutlet(element, route$, animation?)
 *
 * Formalizes the router outlet pattern. On each route emission, the previous
 * view's subscription is unsubscribed, `element.innerHTML` is cleared, and
 * `renderFn` is called with the new route match.
 *
 * If `animation` is provided, a leave animation runs on the old content before
 * clearing, and an enter animation runs on the new content after rendering.
 *
 * @example
 *   const outlet = createOutlet(outletEl, guarded$)
 *   const outletSub = outlet.subscribe((match) => {
 *     switch (match.name) {
 *       case 'home':  return homeView(outletEl, store)
 *       case 'users': return usersView(outletEl, store, router)
 *       default:      return null
 *     }
 *   })
 *
 * @example // with animation
 *   import { fadeIn, fadeOut } from '@rxjs-spa/dom'
 *   const outlet = createOutlet(outletEl, guarded$, {
 *     enter: fadeIn(300),
 *     leave: fadeOut(200),
 *   })
 */
export function createOutlet<N extends string>(
  element: Element,
  route$: Observable<RouteMatch<N>>,
  animation?: OutletAnimationConfig,
): Outlet<N> {
  return {
    element,
    route$,
    subscribe(renderFn) {
      let currentSub: Subscription | null = null
      let leaveController: AbortController | null = null
      const parentSub = new Subscription()

      const routeSub = route$.subscribe((match) => {
        // Cancel any in-progress leave animation
        if (leaveController) {
          leaveController.abort()
          leaveController = null
        }

        const oldChild = element.firstElementChild
        const oldSub = currentSub
        currentSub = null

        const mount = () => {
          element.innerHTML = ''
          currentSub = renderFn(match)
          // Run enter animation on new content
          if (animation?.enter && element.firstElementChild) {
            animation.enter(element.firstElementChild)
          }
        }

        if (animation?.leave && oldChild) {
          // Run leave animation before clearing
          const controller = new AbortController()
          leaveController = controller

          animation.leave(oldChild).then(() => {
            if (controller.signal.aborted) return
            leaveController = null
            oldSub?.unsubscribe()
            mount()
          })
        } else {
          oldSub?.unsubscribe()
          mount()
        }
      })

      parentSub.add(routeSub)
      parentSub.add(() => {
        if (leaveController) leaveController.abort()
        currentSub?.unsubscribe()
        currentSub = null
      })

      return parentSub
    },
  }
}

// ---------------------------------------------------------------------------
// routeAtDepth — filter route stream by nesting depth
// ---------------------------------------------------------------------------

/**
 * routeAtDepth(depth)
 *
 * Operator that only emits when the route at the given nesting depth changes.
 * Parent outlets pipe through `routeAtDepth(0)`, child outlets use depth 1, etc.
 *
 * Uses `distinctUntilChanged` on `matched[depth]` to avoid re-renders when
 * only deeper children change.
 *
 * @example
 *   // Parent layout only re-renders when top-level route changes:
 *   router.route$.pipe(routeAtDepth(0))
 *
 *   // Child outlet only re-renders when depth-1 route changes:
 *   router.route$.pipe(routeAtDepth(1))
 */
export function routeAtDepth<N extends string>(
  depth: number,
): OperatorFunction<RouteMatch<N>, RouteMatch<N>> {
  return (source: Observable<RouteMatch<N>>): Observable<RouteMatch<N>> =>
    source.pipe(
      filter((r) => r.matched.length > depth),
      distinctUntilChanged((a, b) => {
        const am = a.matched[depth]
        const bm = b.matched[depth]
        if (!am || !bm) return false
        return am.name === bm.name && JSON.stringify(am.params) === JSON.stringify(bm.params)
      }),
    )
}
