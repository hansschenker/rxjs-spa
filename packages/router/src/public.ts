import { fromEvent, Observable } from 'rxjs'
import { distinctUntilChanged, filter, map, shareReplay, startWith } from 'rxjs/operators'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** URL params extracted from dynamic segments (e.g. `/users/:id`). */
export type RouteParams = Record<string, string>

/** A matched route. */
export interface RouteMatch<N extends string = string> {
  /** The name you gave this route in `createRouter`. */
  name: N
  /** Extracted URL params (e.g. `{ id: '42' }` for `/users/:id`). */
  params: RouteParams
  /** The raw path portion after the `#` (e.g. `/users/42`). */
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
   * Only emits when the route actually changes (path check).
   */
  route$: Observable<RouteMatch<N>>
  /**
   * Navigate to a path. Writes `#<path>` to `window.location.hash`,
   * which triggers a `hashchange` event and updates `route$`.
   *
   * @example router.navigate('/users/42')
   */
  navigate(path: string): void
  /**
   * Build a hash href string suitable for `<a href="...">`.
   *
   * @example router.link('/users/42')  // → '#/users/42'
   */
  link(path: string): string
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
  routes: RouteDefinition<N>,
): RouteMatch<N> | null {
  for (const [pattern, name] of Object.entries(routes) as [string, N][]) {
    const params = matchPattern(pattern, path)
    if (params !== null) {
      return { name, params, path }
    }
  }
  return null
}

function hashToPath(hash: string): string {
  const path = hash.replace(/^#/, '') || '/'
  return path.startsWith('/') ? path : '/' + path
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

/**
 * createRouter<N>(routes)
 *
 * Creates a hash-based router backed by `window.location.hash` + `hashchange`.
 *
 * - Subscribing to `route$` starts listening to hash changes immediately.
 * - The stream replays the current route to late subscribers (shareReplay).
 * - Unrecognised paths are silently skipped (no emission).
 *
 * @example
 *   const router = createRouter({
 *     '/':          'home',
 *     '/users':     'users',
 *     '/users/:id': 'user-detail',
 *   })
 *
 *   router.route$.subscribe(({ name, params }) => {
 *     console.log('route:', name, params)
 *   })
 *
 *   router.navigate('/users/42')
 */
export function createRouter<N extends string>(routes: RouteDefinition<N>): Router<N> {
  const route$ = fromEvent(window, 'hashchange').pipe(
    startWith(null), // capture initial URL on first subscribe
    map(() => hashToPath(window.location.hash)),
    map((path) => matchRoutes(path, routes)),
    filter((r): r is RouteMatch<N> => r !== null),
    distinctUntilChanged((a, b) => a.path === b.path),
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
  }
}
