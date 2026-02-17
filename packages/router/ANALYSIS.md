# @rxjs-spa/router — Package Analysis

## Overview

`@rxjs-spa/router` is a lightweight, RxJS-first client-side router with dual-mode support (hash and history API), nested route configuration, dynamic parameter extraction, query param parsing, route guards, outlet lifecycle management, and automatic link click interception.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2
- **Build:** Vite library mode (ES + CJS), `rxjs` kept external
- **Tests:** jsdom via Vitest — 200+ test cases in a single 1,252-line test file
- **Source Size:** ~794 lines in a single module (`public.ts`)

---

## Architecture

The router is built around a single core Observable — `route$` — that emits `RouteMatch` objects whenever the URL changes. Everything else (guards, scroll reset, outlets, lazy loading) is composed on top via standard RxJS operators.

```
URL change (hash / popstate / navigate())
    │
    ▼
parse path + query
    │
    ▼
matchRoutesTree(routes, segments)     ← recursive tree match
    │
    ▼
filter(non-null) → distinctUntilChanged(path+query)
    │
    ▼
shareReplay(1)  ← route$
    │
    ├── withGuard(...)        ← optional operator
    ├── withScrollReset()     ← optional operator
    └── outlet.subscribe(renderFn)
```

---

## Routing Modes

### Hash Mode (default)

- URLs: `#/users/42?page=2`
- Listens to `hashchange` event
- `navigate(path)` sets `window.location.hash`
- `link(path)` returns `#` + path
- `destroy()` is a no-op (no global listeners to clean up beyond hashchange)

### History Mode

- URLs: `/users/42?page=2` (clean URLs)
- Uses `history.pushState` + `popstate` event
- Internal `pathChange$` Subject unifies programmatic and browser-driven navigation (pushState does not fire popstate)
- Automatic click interception on `<a>` tags:
  - Delegates from document root (single listener)
  - Walks DOM upward to find nearest `<a>` ancestor
  - Filters: left-click only, no modifier keys (ctrl/shift/alt/meta), no `target="_blank"`, no `download` attribute, same-origin only
- `destroy()` removes popstate and click listeners
- Requires server-side fallback to `index.html` for direct URL access

### SSR / Static Mode

- Activated by passing `initialUrl` in `RouterOptions`
- Creates a static Observable from the parsed URL
- `navigate()`, `link()`, `destroy()` are no-ops

---

## Route Definition Formats

Two formats are supported and normalized internally to a tree structure:

### Flat Record (simple)

```typescript
const routes = {
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '*': 'not-found',
}
```

### Nested Config Array (advanced)

```typescript
const routes: RouteConfig<RouteNames>[] = [
  { path: '/', name: 'home' },
  {
    path: '/users', name: 'users-layout',
    children: [
      { path: '', name: 'users-list' },       // index route
      { path: ':id', name: 'user-detail' },
    ],
  },
  { path: '*', name: 'not-found' },
]
```

Both are converted to `InternalRouteNode[]` trees during `createRouter()`.

---

## Core Types

```typescript
interface RouteMatch<N extends string> {
  name: N                          // Route name from definition
  params: RouteParams              // { id: '42' } from /users/:id
  query: QueryParams               // { page: '2' } from ?page=2
  path: string                     // '/users/42' (without query)
  matched: MatchedSegment<N>[]     // Full chain root→leaf (nested routes)
}

interface Router<N extends string> {
  route$: Observable<RouteMatch<N>>   // Multicasted, replays latest
  navigate(path: string): void        // Programmatic navigation
  link(path: string): string          // Build href for <a> tags
  destroy(): void                     // Clean up global listeners
}

interface Outlet<N extends string> {
  route$: Observable<RouteMatch<N>>
  element: Element
  subscribe(renderFn: (match: RouteMatch<N>) => Subscription | null): Subscription
}
```

---

## Route Matching

Matching is done via recursive tree traversal:

1. Path split into segments: `/users/42` → `['users', '42']`
2. Tree walked depth-first, trying to match each node's segments against the path
3. Dynamic segments (`:param`) extract values with `decodeURIComponent`
4. Wildcard (`*`) checked last — specific routes always win
5. Params accumulate across nesting levels
6. Index routes (`path: ''`) match at the current level without consuming segments

The `matched` array in `RouteMatch` contains the full chain from root to leaf, enabling depth-aware rendering for nested layouts.

---

## Exported Functions

### `createRouter<N>(routes, options?): Router<N>`

Factory that creates the router instance. Selects hash or history mode based on options. The `route$` Observable uses `shareReplay({ bufferSize: 1, refCount: false })` so late subscribers immediately receive the current route and the subscription persists even with zero subscribers.

### `withGuard(protectedRoutes, guardFn, onDenied): OperatorFunction`

Route guard as a composable RxJS operator. Evaluates `guardFn()` (returns `Observable<boolean>`) for protected route names. On denial or error, calls `onDenied()` and returns `EMPTY` (suppresses the emission). Uses `switchMap` to cancel stale guard checks on rapid navigation.

```typescript
router.route$.pipe(
  withGuard(
    ['dashboard', 'profile'],
    () => of(authStore.getState().isAuthenticated),
    () => router.navigate('/login'),
  ),
)
```

### `withScrollReset(): OperatorFunction`

Scrolls to top (`window.scrollTo({ top: 0, left: 0 })`) on each route emission. Pipe after `withGuard` so denied routes don't trigger a scroll.

### `lazy<T>(loader): Observable<T>`

Wraps a dynamic `import()` in a cold Observable via `defer(() => from(loader()))`. Enables route-based code splitting — the import only executes on subscribe, and `switchMap` cancels in-flight loads on rapid navigation.

```typescript
lazy(() => import('./views/home.view')).pipe(
  map(m => m.homeView),
)
```

### `createOutlet<N>(element, route$, animation?): Outlet<N>`

Formalizes the view lifecycle pattern. On each route emission:
1. Cancels any in-progress leave animation (via AbortController)
2. Runs leave animation on old content (if configured)
3. Clears `innerHTML`
4. Calls `renderFn(match)` to get new view subscription
5. Runs enter animation on new content (if configured)
6. Unsubscribes old view subscription

```typescript
const outlet = createOutlet(container, guardedRoute$, {
  enter: fadeIn(200),
  leave: fadeOut(200),
})

outlet.subscribe((match) => {
  switch (match.name) {
    case 'home':  return homeView(container, store)
    case 'users': return usersView(container, store, router)
    default:      return null
  }
})
```

### `routeAtDepth(depth): OperatorFunction`

For nested routing. Filters emissions to only fire when the matched segment at the given depth changes. Prevents parent layouts from re-rendering when only a child route changes.

```typescript
// Parent layout only re-renders when depth-0 segment changes
router.route$.pipe(routeAtDepth(0)).subscribe(...)

// Child view re-renders when depth-1 segment or params change
router.route$.pipe(routeAtDepth(1)).subscribe(...)
```

---

## Key Design Decisions

### 1. Guards as Operators, Not Config

Guards aren't baked into the route definition — they're standard RxJS operators piped onto `route$`. This means multiple guards can be composed, debugged with `tap`, or conditionally applied.

### 2. Unified Path Change Subject (History Mode)

Since `history.pushState` doesn't fire `popstate`, the router uses an internal `pathChange$` Subject that both `navigate()` and popstate feed into. This creates a single source of truth with no race conditions.

### 3. Late Subscriber Support

`shareReplay({ bufferSize: 1, refCount: false })` ensures any component subscribing after initialization immediately knows the current route. The `refCount: false` keeps the subscription alive permanently — intentional for a singleton router.

### 4. Click Interception via Delegation

A single listener on `document` handles all `<a>` clicks in history mode, walking the DOM upward to find the link element. This is efficient, works with dynamically added links, and properly filters modifier keys, external links, and download/target attributes.

### 5. Query Params as First-Class

Query changes emit even when the path stays the same. Deduplication via `distinctUntilChanged` compares both path and serialized query. The parser handles URI decoding, `+` as space, and key-only flags (`?debug`).

### 6. Wildcard Always Last

The matching algorithm tries all specific routes before falling back to `*`. Unrecognized paths are silently dropped (no emission) unless a wildcard is defined.

### 7. Param Accumulation in Nested Routes

Child routes inherit and merge parent params:

```
/users/:userId/posts/:postId
matched = [
  { name: 'users-layout', params: { userId: '5' } },
  { name: 'user-posts',   params: { userId: '5', postId: '12' } },
]
```

---

## Query Parsing Details

- `?key=value` → `{ key: 'value' }`
- `?a=1&b=2` → `{ a: '1', b: '2' }`
- `?q=hello+world` → `{ q: 'hello world' }` (+ treated as space)
- `?name=%C3%A9` → `{ name: 'é' }` (URI decoded)
- `?debug` → `{ debug: '' }` (key-only flag)

---

## Test Coverage

| Area | Tests | Key Scenarios |
|------|-------|---------------|
| Flat route matching | ~70 | Root, static, params, wildcard, query, dedup, late subscribe |
| History mode | ~40 | Same as hash + click interception, popstate, destroy cleanup |
| Nested routes | ~50 | Multi-level nesting, index routes, param accumulation, wildcards |
| `withGuard` | ~25 | Allow/deny, errors, re-evaluation, both modes |
| `withScrollReset` | ~5 | Scroll call, composition with guard |
| `lazy` | ~3 | Cold behavior, resolution, error propagation |
| `createOutlet` | ~10 | Render, clear, teardown, null return |
| `routeAtDepth` | ~5 | Depth filtering, dedup, insufficient depth |

**Total: 200+ tests** covering both happy paths and edge cases (URI encoding, modifier keys, cross-origin filtering, rapid navigation, guard errors).

---

## File Map

```
packages/router/
  package.json              Package metadata, peer deps, conditional exports
  vite.config.ts            Vite library build (ES + CJS)
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (794 lines)
    public.test.ts          Complete test suite (1,252 lines)
```

---

## API Surface Summary

**Factory:**
- `createRouter<N>(routes, options?): Router<N>`
- `createOutlet<N>(element, route$, animation?): Outlet<N>`

**Operators:**
- `withGuard(protectedRoutes, guardFn, onDenied): OperatorFunction`
- `withScrollReset(): OperatorFunction`
- `routeAtDepth(depth): OperatorFunction`

**Utilities:**
- `lazy<T>(loader): Observable<T>`

**Types:**
- `RouteMatch<N>`, `Router<N>`, `Outlet<N>`
- `RouteParams`, `QueryParams`, `RouterMode`, `RouterOptions`
- `MatchedSegment<N>`, `RouteConfig<N>`, `FlatRouteDefinition<N>`, `RouteDefinition<N>`
- `OutletAnimationConfig`

---

## Summary

`@rxjs-spa/router` is a focused, well-tested client-side router that treats routing as a pure RxJS stream problem. Routes emit as typed Observables, guards and scroll behavior compose as operators, and view lifecycle is managed through explicit subscriptions. The dual-mode support (hash + history), nested route trees, query param handling, and outlet abstraction cover the needs of a full SPA without any dependencies beyond RxJS itself. At ~794 lines of implementation with 200+ tests, it achieves a strong feature-to-size ratio.
