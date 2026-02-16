# @rxjs-spa/router — Routing Deep Dive

A complete, step-by-step explanation of how `@rxjs-spa/router` works — from URL change to matched route emission. A pure RxJS, framework-agnostic client-side router with nested routes, guards, lazy loading, outlet-based view management, and full TypeScript type safety.

---

## Table of Contents

1. [Type System & Data Structures](#step-1-type-system--data-structures)
2. [Route Definition Formats](#step-2-route-definition-formats)
3. [Internal Route Tree Normalization](#step-3-internal-route-tree-normalization)
4. [Route Matching Algorithm](#step-4-route-matching-algorithm)
5. [Query String Parsing](#step-5-query-string-parsing)
6. [Hash Mode Implementation](#step-6-hash-mode-implementation)
7. [History Mode Implementation](#step-7-history-mode-implementation)
8. [SSR / Static Mode](#step-8-ssr--static-mode)
9. [Route Guards — `withGuard()`](#step-9-route-guards--withguard)
10. [Scroll Reset — `withScrollReset()`](#step-10-scroll-reset--withscrollreset)
11. [Lazy Loading — `lazy()`](#step-11-lazy-loading--lazy)
12. [Outlets & View Lifecycle — `createOutlet()`](#step-12-outlets--view-lifecycle--createoutlet)
13. [Nested Route Filtering — `routeAtDepth()`](#step-13-nested-route-filtering--routeatdepth)
14. [Complete Nested Route Example](#step-14-complete-nested-route-example)
15. [Edge Cases & Subtleties](#step-15-edge-cases--subtleties)
16. [Observable Pipeline Architecture](#step-16-observable-pipeline-architecture)

---

## Step 1: Type System & Data Structures

### Core Types

```typescript
export type RouteParams = Record<string, string>
export type QueryParams = Record<string, string>
export type RouterMode = 'hash' | 'history'
```

All route parameters and query strings are **URI-decoded** strings (via `decodeURIComponent` during matching).

### Route Match Result

Every time a route matches, the router emits a `RouteMatch<N>`:

```typescript
export interface RouteMatch<N extends string> {
  name: N                          // Route name (e.g., 'user-detail')
  params: RouteParams              // Dynamic segments: { id: '42' }
  query: QueryParams               // Query string: { page: '2', sort: 'name' }
  path: string                     // Path without query: '/users/42'
  matched: MatchedSegment<N>[]     // Full chain from root to leaf
}

export interface MatchedSegment<N extends string> {
  name: N
  params: RouteParams              // Accumulated params up to this node
  path: string                     // Full path to this segment
}
```

**Key insight**: The `matched` array enables nested route hierarchies. For a 3-level route like `/users/42/posts`, `matched` contains the full chain:

```typescript
[
  { name: 'users-layout', params: {},           path: '/users' },
  { name: 'user-detail',  params: { id: '42' }, path: '/users/42' },
  { name: 'user-posts',   params: { id: '42' }, path: '/users/42/posts' },
]
```

### Router Options

```typescript
interface RouterOptions {
  mode?: 'hash' | 'history' // Default: 'hash'
  initialUrl?: string       // SSR: starts in static mode (no listeners)
}
```

When `initialUrl` is provided, the router becomes **static** — it parses the URL once and never listens to window events. This is critical for Server-Side Rendering.

### Router Return Type

```typescript
interface Router<N extends string> {
  route$: Observable<RouteMatch<N>> // Hot, multicasted, replays latest
  navigate(path: string): void      // Programmatic navigation
  link(path: string): string        // Generate href string
  destroy(): void                   // Remove global listeners
}
```

### Full TypeScript Generic Safety

The router is fully generic via `<N extends string>`:

```typescript
type Routes = 'home' | 'users' | 'user-detail'

const router = createRouter<Routes>({
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
})

router.route$.subscribe((match) => {
  // match.name is typed as Routes
  // TypeScript autocompletes: 'home' | 'users' | 'user-detail'
})
```

---

## Step 2: Route Definition Formats

The router accepts two formats for defining routes:

### Flat Format (Simple, Backward-Compatible)

```typescript
type FlatRouteDefinition<N> = Record<string, N>

const routes = {
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '*': 'not-found',
}
```

Each key is a full path pattern, each value is a route name. No hierarchy — all routes are leaf nodes.

### Nested Format (Hierarchical)

```typescript
interface RouteConfig<N> {
  path: string               // '/users', ':id', '', or '*'
  name: N
  children?: RouteConfig<N>[]
}

const routes: RouteConfig<'users' | 'user-list' | 'user-detail'>[] = [
  {
    path: '/users',
    name: 'users-layout',
    children: [
      { path: '', name: 'user-list' },     // Index route: /users → user-list
      { path: ':id', name: 'user-detail' }, // Param route: /users/42 → user-detail
    ],
  },
]
```

The nested format preserves parent-child relationships. A child with `path: ''` acts as an **index route** — it matches the parent's exact path.

---

## Step 3: Internal Route Tree Normalization

Before matching begins, both formats are converted into an internal tree structure:

```typescript
interface InternalRouteNode<N extends string> {
  segment: string                  // Pattern: 'users', ':id', 'users/:id', or '*'
  name: N
  children: InternalRouteNode<N>[]
}
```

### Flat Format Conversion

```
{ '/': 'home', '/users/:id': 'user-detail' }
    ↓
[
  { segment: '',          name: 'home',        children: [] },
  { segment: 'users/:id', name: 'user-detail', children: [] },
]
```

All flat routes become leaf nodes (no children).

### Nested Format Conversion

```
{ path: '/users', name: 'users-layout', children: [
  { path: ':id', name: 'user-detail' }
]}
    ↓
{
  segment: 'users',
  name: 'users-layout',
  children: [
    { segment: ':id', name: 'user-detail', children: [] }
  ]
}
```

The hierarchy is preserved. Leading slashes are stripped from segments.

### Segment Splitting

Paths are broken into segments for matching:

```typescript
function toSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

// '/users/:id'         → ['users', ':id']
// '/'                  → []
// '/users/:id/posts'   → ['users', ':id', 'posts']
```

---

## Step 4: Route Matching Algorithm

### 4a. Segment Matching

The core matching function compares a route pattern's segments against URL path segments:

```typescript
function matchSegments(
  nodeSegments: string[], // ['users', ':id']
  pathSegments: string[], // ['users', '42']
  offset: number,         // Current position in pathSegments
): RouteParams | null {
  // Empty segment matches '' (index routes)
  if (nodeSegments.length === 0) return {}

  // Not enough segments left in the URL
  if (offset + nodeSegments.length > pathSegments.length) return null

  const params: RouteParams = {}
  for (let i = 0; i < nodeSegments.length; i++) {
    const ns = nodeSegments[i] // e.g., 'users' or ':id'
    const ps = pathSegments[offset + i] // e.g., '42'

    if (ns.startsWith(':')) {
      // Dynamic segment: ':id' matches any value
      params[ns.slice(1)] = decodeURIComponent(ps) // { id: '42' }
    } else if (ns !== ps) {
      // Static segment mismatch
      return null // 'about' doesn't match 'users'
    }
  }
  return params
}
```

**Examples:**

```
matchSegments(['users', ':id'], ['users', '42'], 0) → { id: '42' }
matchSegments(['users'], ['users'], 0)               → {}
matchSegments(['about'], ['users'], 0)               → null
matchSegments([':id'], ['hello%20world'], 0)         → { id: 'hello world' }
```

**Critical detail**: URI decoding happens here. A path like `/hello%20world` gets decoded to `'hello world'`.

### 4b. Recursive Tree Matching

The matching algorithm walks the route tree recursively:

```typescript
function matchRoutesTree<N>(
  pathSegments: string[],          // ['users', '42', 'posts']
  query: QueryParams,
  fullPath: string,                // '/users/42/posts'
  nodes: InternalRouteNode<N>[],
  offset: number,                  // Current position (starts at 0)
  chain: MatchedSegment<N>[],     // Accumulated matched path
  accParams: RouteParams,          // Accumulated params from ancestors
): RouteMatch<N> | null
```

**Step-by-step logic:**

1. **Scan all nodes** (except wildcard `*`) for a matching segment at current offset
2. **If segment matches:**
   - Extract params and merge with accumulated params: `{ ...accParams, ...params }`
   - Create a `MatchedSegment` entry for the chain
   - **If this node has children** → recursively match deeper into the tree
     - If child match succeeds → return it (deepest match wins)
     - If all children fail but all segments consumed → return the parent itself
     - Otherwise, skip this node
   - **If this node is a leaf** (no children):
     - If all segments consumed → return this match
     - Otherwise, skip (dangling path segments remain)
3. **If no specific route matches**, use wildcard fallback at current level (if one exists)
4. **If nothing matches**, return `null`

### 4c. Matching Walkthrough

Matching `/users/42/posts` against a nested route tree:

```
Path segments: ['users', '42', 'posts']

Node: 'users-layout' (segment: 'users')
  └─ Match: Yes (offset 0, nodeSegments=['users'])
  └─ offset becomes 1, chain = [users-layout]
  └─ Has children → recursively match...

  Child Node: 'user-list' (segment: '')
    └─ Match: Yes (empty segment always matches)
    └─ offset stays 1, chain = [users-layout, user-list]
    └─ Remaining segments: ['42', 'posts']
    └─ All segments NOT consumed → skip

  Child Node: 'user-detail' (segment: ':id')
    └─ Match: Yes (':id' matches '42' → { id: '42' })
    └─ offset becomes 2, chain = [users-layout, user-detail]
    └─ Has children → recursively match...

    Grandchild: 'user-posts' (segment: 'posts')
      └─ Match: Yes ('posts' matches 'posts')
      └─ offset becomes 3
      └─ All segments consumed ✓
      └─ Return RouteMatch:
           name = 'user-posts'
           params = { id: '42' }
           matched = [users-layout, user-detail, user-posts]
```

### 4d. Wildcard Fallback

Wildcard (`*`) routes are stored separately and only evaluated if no specific route matches:

```typescript
if (wildcardNode && offset <= pathSegments.length) {
  return {
    name: wildcardNode.name,
    params: accParams,
    query,
    path: fullPath,
    matched: [...chain, matchEntry],
  }
}
```

**Important**: Wildcards match at the **current offset level**, not globally. A nested wildcard under `/admin` only matches `/admin/*`, not `/user/*`.

---

## Step 5: Query String Parsing

```typescript
function parseQuery(search: string): QueryParams {
  const query: QueryParams = {}
  const raw = search.startsWith('?') ? search.slice(1) : search

  if (!raw) return query

  for (const pair of raw.split('&')) {
    if (!pair) continue
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) {
      // No value: ?debug → { debug: '' }
      query[decodeURIComponent(pair)] = ''
    } else {
      // Key=value: ?page=2 → { page: '2' }
      query[decodeURIComponent(pair.slice(0, eqIndex))] = decodeURIComponent(
        pair.slice(eqIndex + 1),
      )
    }
  }
  return query
}
```

**Examples:**

```
parseQuery('?page=2&sort=name')  → { page: '2', sort: 'name' }
parseQuery('?debug')             → { debug: '' }
parseQuery('?msg=hello%20world') → { msg: 'hello world' }
parseQuery('')                   → {}
```

All keys and values are URI-decoded.

---

## Step 6: Hash Mode Implementation

Hash mode is the default. URLs look like `#/users/42`.

### 6a. Hash Parser

```typescript
function parseHash(hash: string): { path: string; query: QueryParams } {
  const raw = hash.replace(/^#/, '') || '/' // Remove '#', default to '/'
  const full = raw.startsWith('/') ? raw : '/' + raw // Ensure leading '/'

  const qIndex = full.indexOf('?')
  if (qIndex === -1) return { path: full, query: {} }

  const path = full.slice(0, qIndex) || '/'
  return { path, query: parseQuery(full.slice(qIndex + 1)) }
}
```

**Examples:**

```
'#/users/42?page=1' → { path: '/users/42', query: { page: '1' } }
'#/'                → { path: '/',         query: {} }
''                  → { path: '/',         query: {} }
'#users'            → { path: '/users',    query: {} }  // Normalizes missing /
```

### 6b. Observable Pipeline

```typescript
const route$ = fromEvent(window, 'hashchange').pipe(
  startWith(null), // Emit immediately on creation
  map(() => parseHash(window.location.hash)), // Parse current hash
  map(({ path, query }) => matchRoutes(path, query, nodes)), // Match against tree
  filter((r): r is RouteMatch<N> => r !== null), // Skip non-matches
  distinctUntilChanged(
    (a, b) =>
      a.path === b.path &&
      JSON.stringify(a.query) === JSON.stringify(b.query),
  ),
  shareReplay({ bufferSize: 1, refCount: false }), // Multicast + late subscriber replay
)
```

**Pipeline breakdown:**

1. **`fromEvent(window, 'hashchange')`** — listens for hash changes
2. **`startWith(null)`** — emits immediately so the initial URL is processed
3. **`parseHash()`** — extracts path and query from `window.location.hash`
4. **`matchRoutes()`** — runs the matching algorithm against the route tree
5. **`filter()`** — drops `null` results (unrecognized paths without wildcard)
6. **`distinctUntilChanged()`** — prevents re-emission for identical path + query
7. **`shareReplay(1)`** — multicasts to all subscribers, replays latest to late subscribers

### 6c. Navigation & Link Generation

```typescript
navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : '/' + path
  // hashchange event fires automatically → pipeline processes it
}

link(path: string): string {
  return '#' + (path.startsWith('/') ? path : '/' + path)
  // Returns: '#/users/42'
}
```

Setting `window.location.hash` automatically triggers a `hashchange` event — no manual notification needed.

### 6d. Cleanup

```typescript
destroy() {} // No-op in hash mode
```

Hash mode uses `fromEvent` which is managed by the RxJS subscription. No global listeners to clean up manually.

### 6e. Deduplication via `distinctUntilChanged`

The comparator checks **both path and query**:

```typescript
;(a, b) => a.path === b.path && JSON.stringify(a.query) === JSON.stringify(b.query)
```

| Navigation                          | Emits? | Reason                  |
| ----------------------------------- | ------ | ----------------------- |
| `/users` → `/users?page=1`         | Yes    | Query changed           |
| `/users?page=1` → `/users?page=1`  | No     | Identical               |
| `/users` → `/about`                | Yes    | Path changed            |
| `/users?a=1&b=2` → `/users?b=2&a=1` | Yes  | JSON.stringify order differs |

**Why `JSON.stringify`?** Objects are compared by reference in JavaScript. `{ page: '2' } !== { page: '2' }`, so we stringify to compare values.

---

## Step 7: History Mode Implementation

History mode uses clean URLs like `/users/42` via the HTML5 History API.

### 7a. Subject-Based Coordination

```typescript
const pathChange$ = new Subject<void>() // Single notification channel

const popstateSub = fromEvent(window, 'popstate').subscribe(() =>
  pathChange$.next(), // Browser back/forward triggers here
)
```

**Why a Subject?** `history.pushState()` does **NOT** fire `popstate`. We need a single notification channel for both:

1. Browser back/forward → `popstate` event → `pathChange$.next()`
2. Programmatic `navigate()` → manual `pathChange$.next()`

### 7b. Pathname Parser

```typescript
function parsePathname(): { path: string; query: QueryParams } {
  return {
    path: window.location.pathname || '/',
    query: parseQuery(window.location.search),
  }
}
```

In history mode, we read from `pathname` and `search` instead of `hash`.

### 7c. Observable Pipeline

```typescript
const route$ = pathChange$.pipe(
  startWith(undefined), // Emit immediately
  map(() => parsePathname()), // Read current pathname + search
  map(({ path, query }) => matchRoutes(path, query, nodes)),
  filter((r): r is RouteMatch<N> => r !== null),
  distinctUntilChanged(
    (a, b) =>
      a.path === b.path &&
      JSON.stringify(a.query) === JSON.stringify(b.query),
  ),
  shareReplay({ bufferSize: 1, refCount: false }),
)
```

Same pipeline as hash mode, but driven by `pathChange$` instead of `hashchange`.

### 7d. Programmatic Navigation

```typescript
navigate(path: string) {
  const fullPath = path.startsWith('/') ? path : '/' + path
  history.pushState(null, '', fullPath) // Write to browser history
  pathChange$.next()                    // Notify route$ pipeline
}
```

**Order matters:**

1. `history.pushState()` changes `window.location.pathname`
2. `pathChange$.next()` triggers the route\$ pipeline
3. The pipeline reads the **new** pathname via `parsePathname()`

### 7e. Click Interception

History mode automatically intercepts `<a>` clicks so regular links trigger client-side navigation:

```typescript
function onClick(e: MouseEvent) {
  // Reject: non-left-click or modifier keys
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

  // Walk up DOM to find the anchor element (click might be on a child)
  let el = e.target as HTMLElement | null
  while (el && el.tagName !== 'A') el = el.parentElement
  if (!el) return

  const anchor = el as HTMLAnchorElement

  // Reject: target="_blank", custom target, or download attribute
  if (anchor.target && anchor.target !== '_self') return
  if (anchor.hasAttribute('download')) return

  // Reject: cross-origin links
  if (anchor.origin !== window.location.origin) return

  // Intercept: prevent default and navigate client-side
  e.preventDefault()
  const path = anchor.pathname + anchor.search
  history.pushState(null, '', path)
  pathChange$.next()
}

document.addEventListener('click', onClick) // Delegated handler on document
```

**Interception rules:**

| Condition                               | Intercepted? |
| --------------------------------------- | ------------ |
| Same-origin, left-click, no modifiers   | ✓ Yes        |
| Ctrl+click / Cmd+click (new tab)        | ✗ No         |
| Shift+click (new window)                | ✗ No         |
| `target="_blank"`                       | ✗ No         |
| `download` attribute                    | ✗ No         |
| Cross-origin link                       | ✗ No         |
| Right-click                             | ✗ No         |
| Click on `<span>` inside `<a>`          | ✓ Yes (bubbles up) |

**Event delegation**: The handler is attached to `document`, so clicks on child elements (like `<span>` inside `<a>`) bubble up and are caught by walking up the DOM tree.

### 7f. Link Generation

```typescript
link(path: string): string {
  return path.startsWith('/') ? path : '/' + path
  // Returns: '/users/42' (no hash prefix)
}
```

### 7g. Cleanup

```typescript
destroy() {
  popstateSub.unsubscribe()                     // Stop listening to popstate
  document.removeEventListener('click', onClick) // Remove click interceptor
}
```

**Critical in history mode.** Two global listeners must be removed: the `popstate` subscription and the `document`-level click interceptor. In hash mode, `destroy()` is a no-op.

---

## Step 8: SSR / Static Mode

When `initialUrl` is provided, the router operates in static mode — no browser APIs are accessed:

```typescript
if (options?.initialUrl) {
  const { path, query } = parseUrl(options.initialUrl)
  const match = matchRoutes(path, query, nodes)

  const route$ = of(match).pipe(
    filter((r): r is RouteMatch<N> => r !== null),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  return {
    route$, // Emits exactly once, immediately
    navigate: () => {}, // No-op — static mode
    link: (p) => p, // No prefix needed
    destroy: () => {}, // No-op — no listeners
  }
}
```

**Usage:**

```typescript
// Server: render with initialUrl (no window object needed)
const router = createRouter(routes, { initialUrl: '/users/123' })
// route$ immediately emits the matched route

// Client: hydrate without initialUrl (sets up real listeners)
const clientRouter = createRouter(routes)
```

---

## Step 9: Route Guards — `withGuard()`

### Implementation

```typescript
export function withGuard<N extends string>(
  protectedRoutes: N[],
  guardFn: () => Observable<boolean>,
  onDenied: () => void,
): OperatorFunction<RouteMatch<N>, RouteMatch<N>> {
  return (source: Observable<RouteMatch<N>>): Observable<RouteMatch<N>> =>
    source.pipe(
      switchMap((match) => {
        // Public route — pass through immediately
        if (!protectedRoutes.includes(match.name)) {
          return of(match)
        }

        // Protected route — evaluate guard
        return guardFn().pipe(
          switchMap((allowed) => {
            if (allowed) return of(match) // Access granted
            onDenied() // Access denied → redirect
            return EMPTY // Suppress emission
          }),
          catchError(() => {
            onDenied() // Guard threw → treat as denied
            return EMPTY
          }),
        )
      }),
    )
}
```

### Behavior

| Route Type | Guard Returns | Result |
| ---------- | ------------- | ------ |
| Public route | N/A | Emitted immediately, `guardFn` not called |
| Protected route | `true` | Emitted |
| Protected route | `false` | `onDenied()` called, emission suppressed |
| Protected route | Error thrown | `onDenied()` called, emission suppressed |

### `switchMap` Cancellation

If the user navigates rapidly (e.g., away before a guard completes), `switchMap` unsubscribes the previous guard's Observable and starts the new one. No stale guard results leak through.

### Async Guards

Guards return `Observable<boolean>`, so you can check with the server:

```typescript
const guarded$ = router.route$.pipe(
  withGuard(
    ['dashboard', 'settings'],
    () =>
      http.get('/api/auth/check').pipe(
        map(({ authenticated }) => authenticated),
      ),
    () => router.navigate('/login'),
  ),
)
```

### Type-Safe Route Names

```typescript
withGuard<'users' | 'user-detail'>(
  ['users', 'user-detail'], // Compile error if wrong name
  () => of(isAuth),
  () => navigate('/login'),
)
```

---

## Step 10: Scroll Reset — `withScrollReset()`

```typescript
export function withScrollReset<N extends string>(): OperatorFunction<
  RouteMatch<N>,
  RouteMatch<N>
> {
  return (source: Observable<RouteMatch<N>>): Observable<RouteMatch<N>> =>
    source.pipe(tap(() => window.scrollTo({ top: 0, left: 0 })))
}
```

**Pipe order matters** — place after `withGuard` so denied routes don't trigger a scroll:

```typescript
router.route$.pipe(
  withGuard([...], guardFn, onDenied), // Suppresses denied routes
  withScrollReset(),                    // Only runs if guard passed
)
```

---

## Step 11: Lazy Loading — `lazy()`

```typescript
export function lazy<T>(loader: () => Promise<T>): Observable<T> {
  return defer(() => from(loader()))
}
```

**How it works:**

1. `defer()` creates a cold Observable that calls the factory on **each subscribe**
2. `from(Promise)` converts the dynamic import Promise to an Observable
3. The import is deferred until subscription — no code downloaded until needed

**Usage with route-based code splitting:**

```typescript
const homeView$ = lazy(() => import('./views/home.view')).pipe(
  map((m) => m.homeView),
)

router.route$.pipe(
  switchMap((match) => {
    switch (match.name) {
      case 'home':
        return homeView$
      case 'users':
        return lazy(() => import('./views/users.view')).pipe(
          map((m) => m.usersView),
        )
      default:
        return of(null)
    }
  }),
)
```

**Benefits:**

- **Code splitting**: View modules are only downloaded when the route is visited
- **Cancellation**: If the user navigates away before the load completes, `switchMap` unsubscribes and the result is discarded
- **No build-time coupling**: Route definitions don't need to import view modules

---

## Step 12: Outlets & View Lifecycle — `createOutlet()`

### Purpose

An outlet manages the lifecycle of views rendered into a container element. It handles:

- Unsubscribing the old view's subscription on navigation
- Running enter/leave animations
- Clearing the container between views

### Implementation

```typescript
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
          element.innerHTML = '' // Clear old view
          currentSub = renderFn(match) // Render new view
          if (animation?.enter && element.firstElementChild) {
            animation.enter(element.firstElementChild) // Animate in
          }
        }

        if (animation?.leave && oldChild) {
          // Run leave animation before clearing
          const controller = new AbortController()
          leaveController = controller

          animation.leave(oldChild).then(() => {
            if (controller.signal.aborted) return // Cancelled
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
```

### Lifecycle Per Route Emission

1. **Abort pending leave animation** (if navigating again before it completes)
2. **Store old view's subscription** and save first child element
3. **Define mount function:**
   - Clear `element.innerHTML`
   - Call `renderFn(match)` to render new view → returns Subscription
   - Run enter animation on first child element (if provided)
4. **If leave animation exists:**
   - Run it on old content
   - When animation resolves, unsubscribe old view and call `mount()`
   - If AbortController signals abort, skip cleanup (new navigation already took over)
5. **Otherwise:**
   - Unsubscribe old view and call `mount()` immediately

### Animation Config

```typescript
interface OutletAnimationConfig {
  enter?: (el: Element) => Promise<void>
  leave?: (el: Element) => Promise<void>
}
```

### Usage Example

```typescript
const outlet = createOutlet(
  document.querySelector('#app')!,
  router.route$.pipe(withGuard([...], guardFn, onDenied), withScrollReset()),
  {
    enter: fadeIn(300),
    leave: fadeOut(200),
  },
)

const outletSub = outlet.subscribe((match) => {
  const container = outlet.element

  switch (match.name) {
    case 'home':
      return homeView(container)       // Returns Subscription
    case 'users':
      return usersView(container)      // Returns Subscription
    case 'user-detail':
      return userDetailView(container, match.params) // Returns Subscription
    default:
      container.innerHTML = '<h1>404</h1>'
      return null
  }
})

// Later: tear down everything
outletSub.unsubscribe()
```

When the outlet navigates away from a view, it calls the view's returned `Subscription.unsubscribe()`, stopping all internal HTTP requests, event listeners, and store subscriptions.

---

## Step 13: Nested Route Filtering — `routeAtDepth()`

### Purpose

In nested route hierarchies, parent outlets should only re-render when the **parent** route changes, not when child routes change. `routeAtDepth()` filters emissions based on what changed at a specific depth in the `matched` chain.

### Implementation

```typescript
export function routeAtDepth<N extends string>(
  depth: number,
): OperatorFunction<RouteMatch<N>, RouteMatch<N>> {
  return (source: Observable<RouteMatch<N>>): Observable<RouteMatch<N>> =>
    source.pipe(
      filter((r) => r.matched.length > depth), // Only routes deep enough
      distinctUntilChanged((a, b) => {
        const am = a.matched[depth]
        const bm = b.matched[depth]
        if (!am || !bm) return false
        return (
          am.name === bm.name &&
          JSON.stringify(am.params) === JSON.stringify(bm.params)
        )
      }),
    )
}
```

### How It Works

For depth `0`, it only emits when the **root-level** matched segment changes. For depth `1`, it only emits when the **second-level** segment changes, and so on.

### Example

```typescript
const routes = [
  {
    path: '/items',
    name: 'layout',
    children: [
      { path: '', name: 'list' },
      { path: ':id', name: 'detail' },
    ],
  },
]

// Parent outlet — only re-renders when layout changes
const parentOutlet = createOutlet(
  parentEl,
  router.route$.pipe(routeAtDepth(0)),
)

// Child outlet — re-renders when the child route changes
const childOutlet = createOutlet(
  childEl,
  router.route$.pipe(routeAtDepth(1)),
)
```

**Navigation behavior:**

| Navigation               | Depth 0 Emits? | Depth 1 Emits? |
| ------------------------ | -------------- | -------------- |
| `/items` → `/items/42`  | No (same layout) | Yes (list → detail) |
| `/items/42` → `/items/99` | No (same layout) | Yes (params changed) |
| `/items` → `/other`     | Yes (different root) | N/A |

This prevents the parent layout from re-rendering when only the child view changes — critical for nested UIs with sidebars, tabs, or persistent navigation.

---

## Step 14: Complete Nested Route Example

### Route Definition

```typescript
type RouteName =
  | 'home'
  | 'users-layout'
  | 'users-list'
  | 'user-detail'
  | 'user-posts'
  | 'not-found'

const routes: RouteConfig<RouteName>[] = [
  { path: '/', name: 'home' },
  {
    path: '/users',
    name: 'users-layout',
    children: [
      { path: '', name: 'users-list' }, // /users
      {
        path: ':id',
        name: 'user-detail', // /users/42
        children: [
          { path: 'posts', name: 'user-posts' }, // /users/42/posts
        ],
      },
    ],
  },
  { path: '*', name: 'not-found' },
]
```

### Route Tree After Normalization

```
[
  { segment: '', name: 'home', children: [] },
  {
    segment: 'users', name: 'users-layout',
    children: [
      { segment: '', name: 'users-list', children: [] },
      {
        segment: ':id', name: 'user-detail',
        children: [
          { segment: 'posts', name: 'user-posts', children: [] }
        ]
      }
    ]
  },
  { segment: '*', name: 'not-found', children: [] }
]
```

### Navigation Results

**Path: `/users/42/posts`**

```typescript
{
  name: 'user-posts',
  params: { id: '42' },
  query: {},
  path: '/users/42/posts',
  matched: [
    { name: 'users-layout', params: {},           path: '/users' },
    { name: 'user-detail',  params: { id: '42' }, path: '/users/42' },
    { name: 'user-posts',   params: { id: '42' }, path: '/users/42/posts' },
  ]
}
```

**Path: `/users/42`**

```typescript
{
  name: 'user-detail',
  params: { id: '42' },
  query: {},
  path: '/users/42',
  matched: [
    { name: 'users-layout', params: {},           path: '/users' },
    { name: 'user-detail',  params: { id: '42' }, path: '/users/42' },
  ]
}
```

**Path: `/users`** (matches the index child with `path: ''`)

```typescript
{
  name: 'users-list',
  params: {},
  query: {},
  path: '/users',
  matched: [
    { name: 'users-layout', params: {}, path: '/users' },
    { name: 'users-list',   params: {}, path: '/users' },
  ]
}
```

**Path: `/unknown`** (wildcard catch-all)

```typescript
{
  name: 'not-found',
  params: {},
  query: {},
  path: '/unknown',
  matched: [
    { name: 'not-found', params: {}, path: '/unknown' },
  ]
}
```

### Wiring It All Together

```typescript
const router = createRouter<RouteName>(routes, { mode: 'history' })

// Apply guards and scroll reset
const guarded$ = router.route$.pipe(
  withGuard(
    ['users-layout', 'user-detail', 'user-posts'],
    () => authService.isAuthenticated$,
    () => router.navigate('/login'),
  ),
  withScrollReset(),
)

// Root outlet
const outlet = createOutlet(document.querySelector('#app')!, guarded$, {
  enter: fadeIn(200),
  leave: fadeOut(150),
})

const sub = outlet.subscribe((match) => {
  const container = outlet.element

  switch (match.name) {
    case 'home':
      return homeView(container)
    case 'users-list':
      return usersListView(container, router)
    case 'user-detail':
      return userDetailView(container, router, match.params)
    case 'user-posts':
      return userPostsView(container, router, match.params)
    case 'not-found':
      container.innerHTML = '<h1>404 — Page Not Found</h1>'
      return null
  }
})

// Cleanup on app destroy / HMR
import.meta.hot?.dispose(() => {
  sub.unsubscribe()
  router.destroy()
})
```

---

## Step 15: Edge Cases & Subtleties

### Index Routes (Empty String Path)

In nested config, `path: ''` matches the parent's exact path:

```typescript
{
  path: '/users', name: 'users-layout',
  children: [
    { path: '', name: 'users-list' }  // Matches /users (same as parent)
  ]
}
```

Empty segments have special handling: `if (nodeSegments.length === 0) return {}` — empty always matches at any offset.

### Parameter Accumulation

Nested children inherit and merge parent params:

```typescript
// Route: /users/42/posts/5
// Tree: /users/:userId → /posts/:postId

matched: [
  { name: 'users-layout', params: { userId: '42' },                path: '/users/42' },
  { name: 'user-posts',   params: { userId: '42', postId: '5' },   path: '/users/42/posts/5' },
]
```

Internally: `const mergedParams = { ...accParams, ...params }` — parent params accumulate into children.

### Query-Only Changes

When only the query string changes, `distinctUntilChanged` detects it because `JSON.stringify(a.query) !== JSON.stringify(b.query)`:

```
/users?page=1 → /users?page=2   → Emits (query changed)
/users?page=1 → /users?page=1   → No emit (identical)
```

### Unrecognized Paths Without Wildcard

If a path doesn't match and there's no wildcard, `route$` **emits nothing** for that navigation. The previous route remains active:

```typescript
router.route$.subscribe((r) => console.log(r.name))

navigate('/home') // Emits 'home'
navigate('/unknown') // No emit — previous 'home' stays active
```

### Duplicate Navigation

`distinctUntilChanged` prevents re-emissions for identical path + query:

```typescript
navigate('/users/42') // Emits
navigate('/users/42') // No emit (identical)
```

### History Mode: Same-Origin Validation

Cross-origin links are never intercepted:

```html
<a href="https://example.com/page">External</a>
<!-- Not intercepted -->
<a href="/page">Local</a>
<!-- Intercepted -->
<a href="//other.com/page">Protocol-relative</a>
<!-- Not intercepted -->
```

### Late Subscribers

`shareReplay({ bufferSize: 1, refCount: false })` ensures late subscribers immediately receive the current route:

```typescript
const router = createRouter(routes)

// Navigate first
router.navigate('/users')

// Subscribe later — still receives current route
setTimeout(() => {
  router.route$.subscribe((r) => console.log(r.name)) // Logs 'users'
}, 1000)
```

---

## Step 16: Observable Pipeline Architecture

The core insight is that **everything flows through RxJS** — no imperative loops or state machines:

```
URL Change Source
    │
    ├─ Hash mode:    fromEvent(window, 'hashchange')
    ├─ History mode:  Subject (popstate + manual navigate)
    └─ SSR mode:      of(initialMatch)
    │
    ↓
startWith()              ← Emit immediately on creation
    ↓
parseHash / parsePathname()   ← Extract path + query from URL
    ↓
matchRoutes()            ← Run matching algorithm against route tree
    ↓
filter(r => r !== null)  ← Drop unrecognized paths
    ↓
distinctUntilChanged()   ← Deduplicate identical path + query
    ↓
shareReplay(1)           ← Multicast + replay latest to late subscribers
    ↓
route$                   ← Hot, multicasted Observable
    │
    ├─ withGuard()       ← Async access control (switchMap + EMPTY)
    ├─ withScrollReset() ← Scroll to top (tap)
    ├─ routeAtDepth()    ← Filter by nesting level (distinctUntilChanged)
    └─ createOutlet()    ← View lifecycle management (subscribe)
```

**Composition is key.** Each operator is independent and can be combined in any order:

```typescript
// Minimal: just the route stream
router.route$.subscribe(handleRoute)

// Full: guards → scroll → outlet
router.route$
  .pipe(
    withGuard(['admin'], checkAuth, redirectToLogin),
    withScrollReset(),
  )
  .subscribe(handleRoute)

// Nested: different depths for different outlets
const layout$ = router.route$.pipe(routeAtDepth(0))
const content$ = router.route$.pipe(routeAtDepth(1))
const detail$ = router.route$.pipe(routeAtDepth(2))
```

No imperative routing table. No framework-specific lifecycle hooks. Just RxJS operators all the way down.
