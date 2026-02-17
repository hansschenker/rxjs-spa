# @rxjs-spa/testing — Package Analysis

## Overview

`@rxjs-spa/testing` provides drop-in mock implementations of the core rxjs-spa framework components — Store, Router, and HttpClient — plus helper utilities for Observable value collection and jsdom hash navigation. It is designed to eliminate boilerplate in unit tests while maintaining full type safety and interface compatibility with the real packages.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2
- **Build:** Vite library mode (ES + CJS), `rxjs` kept external
- **Tests:** jsdom via Vitest — 27 tests across 5 suites
- **Source Size:** ~291 lines in a single module (`public.ts`)
- **No framework package imports** — interfaces duplicated locally to avoid circular dependencies

---

## Architecture

Each mock provides **dual tracking**: reactive Observables for stream-based testing and imperative arrays/methods for quick assertions.

```
                Real Package              Mock Replacement
                ──────────               ────────────────
                Store<S, A>      ←→     MockStore<S, A>
                  state$                   state$         (driven by setState)
                  actions$                 actions$       (driven by dispatch)
                  dispatch()               dispatch()     → dispatchedActions[]
                  select()                 select()       (map + distinctUntilChanged)
                  getState()               getState()     (BehaviorSubject.value)
                                           setState()     ← TEST CONTROL

                Router<N>        ←→     MockRouter<N>
                  route$                   route$         (driven by emit)
                  navigate()               navigate()     → navigatedTo[]
                  link()                   link()         (path normalization)
                  destroy()                destroy()      (no-op)
                                           emit()         ← TEST CONTROL

                HttpClient       ←→     MockHttpClient
                  get/post/...             get/post/...   → calls[]
                                           whenGet()      ← CONFIGURE RESPONSE
                                           whenPost()     ← CONFIGURE RESPONSE
                                           respond()      (of(data))
                                           respondWith()  (custom Observable)
```

---

## Core API

### `collectFrom<T>(obs$): { values: T[], subscription: Subscription }`

Universal Observable value collector. Subscribes immediately and pushes every emission into an array.

```typescript
const result = collectFrom(store.select(s => s.count))
store.setState({ count: 5 })
store.setState({ count: 10 })

expect(result.values).toEqual([0, 5, 10])
result.subscription.unsubscribe()
```

- Works with any Observable (store selectors, router, HTTP responses, DOM streams)
- Returns the `Subscription` for manual teardown
- Captures BehaviorSubject initial values immediately

---

### `createMockStore<S, A>(initialState): MockStore<S, A>`

Drop-in replacement for `createStore` from `@rxjs-spa/store`.

```typescript
type State = { count: number; name: string }
type Action = { type: 'INC' } | { type: 'SET_NAME'; name: string }

const store = createMockStore<State, Action>({ count: 0, name: 'test' })
```

#### Interface

| Member | Type | Description |
|--------|------|-------------|
| `state$` | `Observable<S>` | Multicasted via `shareReplay(1)`; driven by `setState()` |
| `actions$` | `Observable<A>` | Emits on every `dispatch()` call |
| `dispatch(action)` | `void` | Records to `dispatchedActions[]` AND emits on `actions$` |
| `select(selector)` | `Observable<T>` | `map(selector)` + `distinctUntilChanged()` |
| `getState()` | `S` | Synchronous snapshot via `BehaviorSubject.value` |
| `setState(state)` | `void` | **Test control** — drives `state$` directly without actions |
| `dispatchedActions` | `A[]` | **Assertion array** — all dispatched actions in order |

#### Internal Implementation

- `BehaviorSubject<S>` holds current state (powers `getState()` and `state$`)
- `Subject<A>` collects dispatched actions (powers `actions$`)
- `state$` uses `shareReplay({ bufferSize: 1, refCount: false })` — replays latest to late subscribers, stays alive permanently
- `setState()` pushes directly to the BehaviorSubject (no reducer, no actions)
- `dispatch()` both appends to the `dispatchedActions` array and emits on `actionsSubject`

#### Usage Patterns

```typescript
// Assert dispatched actions
store.dispatch({ type: 'INC' })
store.dispatch({ type: 'SET_NAME', name: 'Alice' })
expect(store.dispatchedActions).toEqual([
  { type: 'INC' },
  { type: 'SET_NAME', name: 'Alice' },
])

// Drive state for view testing (no reducer needed)
store.setState({ count: 5, name: 'Bob' })
expect(store.getState().count).toBe(5)

// Test selectors with deduplication
const counts = collectFrom(store.select(s => s.count))
store.setState({ count: 0, name: 'changed' })  // count unchanged → no emission
store.setState({ count: 1, name: 'changed' })  // count changed → emission
expect(counts.values).toEqual([0, 1])           // deduped: no extra 0
```

---

### `createMockRouter<N>(initialRoute?): MockRouter<N>`

Drop-in replacement for `createRouter` from `@rxjs-spa/router`.

```typescript
type Routes = 'home' | 'users' | 'user-detail'

const router = createMockRouter<Routes>({
  name: 'home',
  params: {},
  query: {},
  path: '/',
  matched: [{ name: 'home', params: {}, path: '/' }],
})
```

#### Interface

| Member | Type | Description |
|--------|------|-------------|
| `route$` | `Observable<RouteMatch<N>>` | Multicasted; driven by `emit()` |
| `navigate(path)` | `void` | Records path to `navigatedTo[]` (does NOT emit on `route$`) |
| `link(path)` | `string` | Normalizes: `'users'` → `'/users'`, `'/users'` → `'/users'` |
| `destroy()` | `void` | No-op |
| `emit(route)` | `void` | **Test control** — pushes route into `route$` |
| `navigatedTo` | `string[]` | **Assertion array** — all paths passed to `navigate()` |

#### Key Behaviors

- `initialRoute` is optional — if omitted, `route$` filters out the internal null and waits for first `emit()` call
- `navigate()` and `emit()` are deliberately separate: `navigate()` records for assertion, `emit()` drives the Observable. This matches real-world usage where navigation triggers async route matching.
- `link()` prepends `/` to relative paths, returns absolute paths unchanged

#### Usage Patterns

```typescript
// Assert navigation calls
router.navigate('/users')
router.navigate('/users/42')
expect(router.navigatedTo).toEqual(['/users', '/users/42'])

// Drive route changes for view testing
router.emit({
  name: 'user-detail',
  params: { id: '42' },
  query: {},
  path: '/users/42',
  matched: [{ name: 'user-detail', params: { id: '42' }, path: '/users/42' }],
})
```

---

### `createMockHttpClient(): MockHttpClient`

Drop-in replacement for `http` / `createHttpClient()` from `@rxjs-spa/http`.

```typescript
const httpClient = createMockHttpClient()
```

#### Interface

| Member | Type | Description |
|--------|------|-------------|
| `get(url)` | `Observable<T>` | Records call, returns configured response |
| `post(url, body?)` | `Observable<T>` | Records call with body |
| `put(url, body?)` | `Observable<T>` | Records call with body |
| `patch(url, body?)` | `Observable<T>` | Records call with body |
| `delete(url)` | `Observable<T>` | Records call |
| `calls` | `MockCall[]` | **Assertion array** — `{ method, url, body? }` for each request |
| `whenGet(url)` | `MockResponse` | Configure GET response |
| `whenPost(url)` | `MockResponse` | Configure POST response |
| `whenPut(url)` | `MockResponse` | Configure PUT response |
| `whenPatch(url)` | `MockResponse` | Configure PATCH response |
| `whenDelete(url)` | `MockResponse` | Configure DELETE response |

#### MockResponse

```typescript
interface MockResponse {
  respond<T>(data: T): void           // Wraps in of(data)
  respondWith<T>(obs$: Observable<T>): void  // Custom Observable (errors, delays, etc.)
}
```

#### Internal Implementation

- `Map<string, Observable<unknown>>` stores responses keyed by `"METHOD:URL"` (e.g., `"GET:/api/users"`)
- Each HTTP method calls `doRequest()` which records the call and looks up the response
- **Unconfigured URLs** return `throwError(() => new Error(...))` — subscription throws immediately
- Responses are **cold Observables** — each subscription triggers a fresh emission

#### Usage Patterns

```typescript
// Configure responses before test
httpClient.whenGet('/api/users').respond([{ id: 1, name: 'Alice' }])
httpClient.whenPost('/api/users').respond({ id: 2, name: 'Bob' })

// Simulate error
httpClient.whenGet('/api/fail').respondWith(
  throwError(() => new Error('Server error'))
)

// Execute and assert
const result = collectFrom(httpClient.get('/api/users'))
expect(result.values).toEqual([[{ id: 1, name: 'Alice' }]])

// Assert request details
expect(httpClient.calls).toEqual([
  { method: 'GET', url: '/api/users' },
])

// Assert POST body
httpClient.post('/api/users', { name: 'Bob' }).subscribe()
expect(httpClient.calls[1]).toEqual({
  method: 'POST', url: '/api/users', body: { name: 'Bob' },
})
```

---

### `triggerHashChange(path): void`

jsdom workaround for hash-based router testing.

```typescript
triggerHashChange('/users/42')
// Sets window.location.hash = '/users/42'
// Dispatches new Event('hashchange') on window
```

**Why needed:** jsdom doesn't fire `hashchange` events on `location.hash` assignment like real browsers do. This helper sets the hash AND manually dispatches the event, enabling router tests that rely on `fromEvent(window, 'hashchange')`.

---

## Design Decisions

### 1. No Framework Package Imports

The testing package duplicates the `Store`, `Router`, and `HttpClient` interfaces locally rather than importing from `@rxjs-spa/store`, `@rxjs-spa/router`, and `@rxjs-spa/http`. This avoids circular dependencies and keeps the testing package decoupled — it can be used without installing the framework packages themselves.

### 2. Dual Imperative + Reactive Tracking

Every mock provides both:
- **Arrays** for fast imperative assertions (`dispatchedActions`, `navigatedTo`, `calls`)
- **Observables** for reactive stream testing (`state$`, `route$`, response Observables)

This lets tests choose the most ergonomic assertion style for each scenario.

### 3. setState vs dispatch Separation

`MockStore.setState()` drives `state$` directly without going through actions or a reducer. This lets tests set arbitrary state without defining a reducer. `dispatch()` is tracked separately in `dispatchedActions[]` for asserting what actions a component/effect dispatched.

### 4. navigate vs emit Separation

`MockRouter.navigate()` records the path for assertion but does NOT emit on `route$`. `emit()` drives the Observable. This mirrors real-world behavior where `navigate()` triggers async route matching that eventually emits on `route$`.

### 5. Cold HTTP Responses

`MockHttpClient` returns cold Observables — each subscription triggers a fresh emission. Unconfigured URLs throw on subscription (not on call), matching the behavior of real `rxjs/ajax` calls.

### 6. shareReplay with refCount: false

Both `MockStore.state$` and `MockRouter.route$` use `shareReplay({ bufferSize: 1, refCount: false })`. This keeps the stream alive even when all subscribers disconnect, matching the real framework's behavior where stores and routers are long-lived singletons.

---

## Test Coverage

| Suite | Tests | Key Scenarios |
|-------|-------|---------------|
| `collectFrom` | 5 | Synchronous emissions, BehaviorSubject initial value, unsubscribe stops collection |
| `createMockStore` | 5 | Initial state, setState drives state$, getState sync, dispatch records + emits, select deduplication |
| `createMockRouter` | 6 | Initial route emission, emit drives route$, navigate records paths, link normalizes, destroy no-op |
| `createMockHttpClient` | 8 | GET/POST/PUT/PATCH/DELETE responses, body capture, calls ordering, unconfigured URL throws, respondWith custom Observable |
| `triggerHashChange` | 2 | Hash set, hashchange event dispatched |

**Total: 27 tests** covering all 5 exports and their key behaviors.

---

## File Map

```
packages/testing/
  package.json              Package metadata, peer dep (rxjs only)
  vite.config.ts            Vite library build (ES + CJS), rxjs external
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (291 lines)
    public.test.ts          Complete test suite (273 lines, 27 tests)
```

---

## API Surface Summary

**Utilities:**
- `collectFrom<T>(obs$): { values: T[], subscription: Subscription }`
- `triggerHashChange(path): void`

**Mock Factories:**
- `createMockStore<S, A>(initialState): MockStore<S, A>`
- `createMockRouter<N>(initialRoute?): MockRouter<N>`
- `createMockHttpClient(): MockHttpClient`

**Interfaces:**
- `MockStore<S, A>` — extends `Store<S, A>` with `setState()` and `dispatchedActions`
- `MockRouter<N>` — extends `Router<N>` with `emit()` and `navigatedTo`
- `MockHttpClient` — extends `HttpClient` with `calls`, `when*()` methods
- `MockCall` — `{ method, url, body? }`
- `MockResponse` — `{ respond(data), respondWith(obs$) }`

---

## Summary

`@rxjs-spa/testing` is a focused ~291-line testing utility package that provides fully typed mock implementations of the three core rxjs-spa services — Store, Router, and HttpClient — plus `collectFrom()` for Observable value capture and `triggerHashChange()` for jsdom hash navigation. Each mock offers dual imperative/reactive tracking: arrays for quick assertions and Observables for stream-based integration testing. The package avoids importing framework packages by duplicating interfaces locally, keeping it decoupled and dependency-free beyond RxJS. At 5 exports and 27 tests, it provides the essential testing infrastructure for the entire rxjs-spa ecosystem.
