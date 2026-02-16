# @rxjs-spa State Management — Deep Dive

A complete, step-by-step explanation of how state management works in `rxjs-spa` — from dispatching an action to the final state emission. Covers the core store, action filtering, store composition, error-resilient stores, state persistence, testing utilities, and real-world integration patterns.

---

## Table of Contents

1. [The MVU Pattern & Store Interface](#step-1-the-mvu-pattern--store-interface)
2. [`createStore()` — Full Implementation](#step-2-createstore--full-implementation)
3. [`dispatch()` — How Actions Flow](#step-3-dispatch--how-actions-flow)
4. [`select()` — Deriving Slices with Deduplication](#step-4-select--deriving-slices-with-deduplication)
5. [`actions$` — The Side-Effect Hook](#step-5-actions--the-side-effect-hook)
6. [`ofType()` — Action Filtering with Type Narrowing](#step-6-oftype--action-filtering-with-type-narrowing)
7. [`combineStores()` — Multi-Store Composition](#step-7-combinestores--multi-store-composition)
8. [Core Utilities — `remember()` and `rememberWhileSubscribed()`](#step-8-core-utilities--remember-and-rememberwhilesubscribed)
9. [Error-Resilient Stores — `@rxjs-spa/errors`](#step-9-error-resilient-stores--rxjs-spaerrors)
10. [State Persistence — `@rxjs-spa/persist`](#step-10-state-persistence--rxjs-spapersist)
11. [Testing Utilities — `@rxjs-spa/testing`](#step-11-testing-utilities--rxjs-spatesting)
12. [Real-World Integration — Demo App Patterns](#step-12-real-world-integration--demo-app-patterns)
13. [Complete Data Flow Diagram](#step-13-complete-data-flow-diagram)
14. [Key Architectural Principles](#step-14-key-architectural-principles)

---

## Step 1: The MVU Pattern & Store Interface

### Model-View-Update

The store implements a reactive **MVU (Model-View-Update)** pattern built entirely on RxJS. The data flow is strictly unidirectional:

```
dispatch(action)
    │
Subject<Action> → scan(reducer, initial) → startWith(initial) → shareReplay(1)
                                                                      │
                                                              state$ (Observable<S>)
                                                                      │
                                          ┌───────────────────────────┤
                                       select()                  DOM sinks
                                    (derived slices)         (text, attr, …)
```

Side-effects (HTTP, timers) are wired to `store.actions$`, never inside the reducer:

```typescript
store.actions$
  .pipe(
    ofType('FETCH'),
    switchMap(() => http.get(…)),
  )
  .subscribe(store.dispatch)
```

### The Store Interface

```typescript
export interface Store<S, A> {
  state$: Observable<S> // Multicasted, replays latest to late subscribers
  actions$: Observable<A> // Hot stream of every dispatched action
  dispatch(action: A): void // Synchronous action submission
  select<T>(selector: (state: S) => T): Observable<T> // Derive slices
  getState(): S // Synchronous state snapshot
}
```

The `Store<S, A>` is generic over:

- **S** — State type (the entire state shape)
- **A** — Action type (discriminated union of all possible actions)

### Reducer Type

```typescript
export type Reducer<S, A> = (state: S, action: A) => S
```

A reducer is a **pure function**: no side-effects, no mutations, just `(currentState, action) → newState`.

---

## Step 2: `createStore()` — Full Implementation

### The Three RxJS Patterns Inside

The store is actually **three intertwined RxJS patterns** working together:

1. A **Subject-based action sink** for receiving dispatches
2. A **scan-based state accumulator** for reducer application
3. A **BehaviorSubject wrapper** for synchronous `getState()`

### Implementation

```typescript
export function createStore<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
): Store<S, A> {
  // ──────────────────────────────────────────────────────────────────────
  // Subjects: The action intake and state snapshot
  // ──────────────────────────────────────────────────────────────────────
  const actionsSubject = new Subject<A>() // Accepts dispatched actions
  const stateBs = new BehaviorSubject<S>(initialState) // Synchronous snapshot

  const actions$ = actionsSubject.asObservable() // Expose read-only

  // ──────────────────────────────────────────────────────────────────────
  // The Core MVU Pipeline
  // ──────────────────────────────────────────────────────────────────────
  const state$ = actionsSubject.pipe(
    scan(reducer, initialState),
    startWith(initialState),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  // ──────────────────────────────────────────────────────────────────────
  // Keep BehaviorSubject in sync for getState()
  // ──────────────────────────────────────────────────────────────────────
  state$.subscribe((s) => stateBs.next(s))

  return {
    state$,
    actions$,
    dispatch(action: A) {
      actionsSubject.next(action)
    },
    select<T>(selector: (state: S) => T): Observable<T> {
      return state$.pipe(map(selector), distinctUntilChanged())
    },
    getState(): S {
      return stateBs.value
    },
  }
}
```

### Pipeline Breakdown

Each operator in the `state$` pipeline serves a specific purpose:

| Operator | Purpose |
| --- | --- |
| `scan(reducer, initialState)` | Accumulates state: each action runs through the reducer to produce a new state |
| `startWith(initialState)` | Ensures late subscribers immediately receive the initial state, even if no action has been dispatched yet |
| `shareReplay({ bufferSize: 1, refCount: false })` | **Multicasts** the stream so all subscribers share one pipeline; **replays** the latest state to late subscribers; **`refCount: false`** keeps the stream alive even if all subscribers unsubscribe |

### Why `refCount: false`?

The store is a singleton that must outlive its subscribers. If a view unsubscribes from `state$` and then resubscribes, it must still receive the current state — not a reset state. `refCount: false` keeps the internal scan pipeline alive permanently.

### The BehaviorSubject Sync Subscription

```typescript
state$.subscribe((s) => stateBs.next(s))
```

This subscription **never unsubscribes**. It keeps the BehaviorSubject in lockstep with `state$`, so `getState()` always returns the current value synchronously. This is critical for code that needs the state outside of an Observable context (event handlers, imperative logic).

---

## Step 3: `dispatch()` — How Actions Flow

When `store.dispatch(action)` is called, the following happens synchronously:

```
actionsSubject.next(action)       // 1. Action enters the Subject
    ↓
scan(reducer, accumulator)        // 2. Reducer runs: (prevState, action) → newState
    ↓
new state emitted from state$     // 3. All state$ subscribers receive the new state
    ↓
stateBs.next(state)               // 4. BehaviorSubject updates
    ↓
getState() now returns new value  // 5. Synchronous access reflects the update
```

### Example

```typescript
interface CountState {
  count: number
}

type CountAction = { type: 'INC' } | { type: 'DEC' } | { type: 'ADD'; amount: number }

function countReducer(state: CountState, action: CountAction): CountState {
  switch (action.type) {
    case 'INC':
      return { count: state.count + 1 }
    case 'DEC':
      return { count: state.count - 1 }
    case 'ADD':
      return { count: state.count + action.amount }
    default:
      return state
  }
}

const store = createStore(countReducer, { count: 0 })

console.log(store.getState().count) // 0
store.dispatch({ type: 'INC' })
console.log(store.getState().count) // 1  ← Already updated!
store.dispatch({ type: 'ADD', amount: 10 })
console.log(store.getState().count) // 11 ← Already updated!
```

### Dispatch Is Synchronous

Unlike some frameworks that batch or defer state updates, `dispatch()` immediately runs the reducer and updates the state. After `dispatch()` returns, `getState()` reflects the new value. This makes reasoning about state trivial.

---

## Step 4: `select()` — Deriving Slices with Deduplication

### Implementation

```typescript
select<T>(selector: (state: S) => T): Observable<T> {
  return state$.pipe(
    map(selector),          // Transform full state to a derived value
    distinctUntilChanged()  // Only emit when the value CHANGES (=== comparison)
  )
}
```

### How Deduplication Works

`distinctUntilChanged()` uses **strict equality** (`===`) by default:

```typescript
interface AppState {
  count: number
  label: string
  theme: string
}

const store = createStore(reducer, { count: 0, label: 'hello', theme: 'light' })

// Select only the count slice
const count$ = store.select((s) => s.count)

count$.subscribe((c) => console.log('count changed:', c))

// Emissions:
store.dispatch({ type: 'SET_LABEL', label: 'world' })
// State changes to { count: 0, label: 'world', theme: 'light' }
// select(s => s.count) → 0
// distinctUntilChanged: 0 === 0 → SAME → NO EMISSION

store.dispatch({ type: 'INC' })
// State changes to { count: 1, label: 'world', theme: 'light' }
// select(s => s.count) → 1
// distinctUntilChanged: 1 !== 0 → DIFFERENT → EMITS 1
```

### Why This Matters

If you have 50 state properties and only `select` the `count` field, your subscriber will **not** fire when other properties change. This is how `rxjs-spa` avoids unnecessary re-renders — only the parts of the UI subscribed to changed values update.

### Selecting Derived Values

```typescript
// Computed: filtered list
const activeUsers$ = store.select((s) =>
  s.users.filter((u) => u.isActive),
)

// Computed: aggregation
const totalPrice$ = store.select((s) =>
  s.cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
)
```

**Caveat**: If the selector returns a **new object or array** on every call (like `filter()` does), `distinctUntilChanged` won't deduplicate because `[] !== []`. For such cases, either:

- Use `distinctUntilChanged` with a custom comparator:
  ```typescript
  state$.pipe(
    map((s) => s.users.filter((u) => u.isActive)),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )
  ```
- Or cache the derived value using `remember()`.

---

## Step 5: `actions$` — The Side-Effect Hook

### How It Works

The `actions$` stream emits **every** action that was dispatched, regardless of whether the reducer handled it. This is where you wire side-effects — HTTP calls, timers, navigation, analytics, logging:

```typescript
const actions$ = actionsSubject.asObservable() // Read-only Observable of all actions
```

### The Effects Pattern

Effects listen on `actions$`, filter for specific action types, perform async work, and dispatch result actions back into the store:

```typescript
// Effect: FETCH → HTTP → FETCH_SUCCESS or FETCH_ERROR
store.actions$
  .pipe(
    ofType('FETCH'),
    switchMap(() =>
      http.get('/api/users').pipe(
        map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchError((err) =>
          of({ type: 'FETCH_ERROR' as const, error: err.message }),
        ),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

### Effects Flow

```
User clicks "Load"
  ↓
store.dispatch({ type: 'FETCH' })
  ↓
Reducer handles FETCH: sets loading = true
  ↓
Action also flows through actions$
  ↓
ofType('FETCH') catches it
  ↓
switchMap starts http.get('/api/users')
  ↓
...HTTP request in flight...
  ↓
Response arrives
  ↓
map() transforms to { type: 'FETCH_SUCCESS', users: [...] }
  ↓
subscribe() dispatches FETCH_SUCCESS
  ↓
Reducer handles FETCH_SUCCESS: sets loading = false, users = data
  ↓
UI updates automatically via state$ subscriptions
```

### Why `switchMap`?

`switchMap` cancels the previous inner Observable when a new action arrives. If the user clicks "Load" twice quickly, the first HTTP request is cancelled (XHR aborted) and only the second one completes. This prevents race conditions.

Other operators for different use cases:

| Operator | Behavior |
| --- | --- |
| `switchMap` | Cancel previous, start new (most common for fetches) |
| `mergeMap` | Run all in parallel (independent requests) |
| `concatMap` | Queue sequentially (ordered mutations) |
| `exhaustMap` | Ignore new while previous is in-flight (submit buttons) |

---

## Step 6: `ofType()` — Action Filtering with Type Narrowing

### Implementation

```typescript
export function ofType<
  A extends { type: string },
  K extends A['type'],
>(
  ...types: [K, ...K[]]
): OperatorFunction<A, Extract<A, { type: K }>> {
  return filter(
    (action): action is Extract<A, { type: K }> =>
      (types as K[]).includes(action.type as K),
  )
}
```

### What It Does

`ofType` is both a **runtime filter** and a **compile-time type narrower**:

1. **Runtime**: Checks if `action.type` is in the provided list
2. **Compile-time**: Narrows the TypeScript type to the specific action variant(s)

### Type Narrowing in Action

```typescript
type CountAction =
  | { type: 'INC' }
  | { type: 'DEC' }
  | { type: 'ADD'; amount: number }
  | { type: 'RESET' }

store.actions$.pipe(ofType('ADD')).subscribe((action) => {
  // TypeScript KNOWS action is { type: 'ADD'; amount: number }
  console.log(action.amount) // ← No type error!
})
```

**The magic is `Extract<A, { type: K }>`:**

- `Extract` is a TypeScript utility that pulls out union members matching a condition
- `Extract<CountAction, { type: 'ADD' }>` yields `{ type: 'ADD'; amount: number }`
- The `action is ...` type guard tells TypeScript to narrow for the rest of the pipeline

### Filtering Multiple Types

```typescript
store.actions$.pipe(ofType('INC', 'DEC')).subscribe((action) => {
  // action is { type: 'INC' } | { type: 'DEC' }
})
```

The variadic signature `...types: [K, ...K[]]` requires at least one type argument.

---

## Step 7: `combineStores()` — Multi-Store Composition

### Implementation

```typescript
export function combineStores<A, B, R>(
  storeA: Store<A, unknown>,
  storeB: Store<B, unknown>,
  project: (a: A, b: B) => R,
): Observable<R> {
  return combineLatest([storeA.state$, storeB.state$]).pipe(
    map(([sa, sb]) => project(sa, sb)),
  )
}
```

### How It Works

`combineLatest` emits whenever **either** store emits a new state, using the **latest value** from both:

```typescript
const authStore = createStore(authReducer, {
  user: null,
  isAuth: false,
})

const uiStore = createStore(uiReducer, {
  theme: 'light',
  sidebarOpen: true,
})

const viewModel$ = combineStores(authStore, uiStore, (auth, ui) => ({
  username: auth.user?.name,
  theme: ui.theme,
  isAuthenticated: auth.isAuth,
}))
```

### Emission Timeline

```
Initial auth: { user: null, isAuth: false }
Initial ui:   { theme: 'light', sidebarOpen: true }
  ↓ combineLatest: both emit initial
  ↓ project: { username: undefined, theme: 'light', isAuthenticated: false }

Dispatch LOGIN_SUCCESS to authStore:
  ↓ authStore.state$ emits { user: { name: 'Alice' }, isAuth: true }
  ↓ combineLatest uses latest ui (unchanged)
  ↓ project: { username: 'Alice', theme: 'light', isAuthenticated: true }

Dispatch TOGGLE_THEME to uiStore:
  ↓ uiStore.state$ emits { theme: 'dark', sidebarOpen: true }
  ↓ combineLatest uses latest auth (unchanged)
  ↓ project: { username: 'Alice', theme: 'dark', isAuthenticated: true }
```

### Use Cases

- **View models**: Combine auth + UI + data stores into a single stream for a component
- **Cross-store derived data**: Compute values that depend on multiple stores
- **Dashboard aggregation**: Combine metrics from separate domain stores

---

## Step 8: Core Utilities — `remember()` and `rememberWhileSubscribed()`

These two operators from `@rxjs-spa/core` control how Observable results are cached and shared.

### `remember()` — Permanent Cache

```typescript
export function remember<T>(): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) =>
    source.pipe(shareReplay({ bufferSize: 1, refCount: false }))
}
```

- **`refCount: false`** — Connection stays alive even if all subscribers unsubscribe
- **`bufferSize: 1`** — Keeps latest value
- **Use for**: Global state, frequently-subscribed streams, expensive computations

```typescript
const expensive$ = heavyComputation().pipe(remember())

const subA = expensive$.subscribe() // Connects, computation runs
const subB = expensive$.subscribe() // Reuses connection, no recomputation

subA.unsubscribe() // Still connected (refCount: false)
subB.unsubscribe() // Still connected

const subC = expensive$.subscribe() // No recomputation — cached value replayed
```

### `rememberWhileSubscribed()` — Lifecycle-Aware Cache

```typescript
export function rememberWhileSubscribed<T>(): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) =>
    source.pipe(shareReplay({ bufferSize: 1, refCount: true }))
}
```

- **`refCount: true`** — Connection tears down when subscriber count hits zero
- **`bufferSize: 1`** — Keeps latest value while connected
- **Use for**: View-scoped streams, temporary subscriptions

```typescript
const stream$ = heavyComputation().pipe(rememberWhileSubscribed())

const subA = stream$.subscribe() // Connects
const subB = stream$.subscribe() // Reuses

subA.unsubscribe()
subB.unsubscribe() // Count hits zero → DISCONNECTS, resources released

const subC = stream$.subscribe() // Count was 0 → RECONNECTS, computation runs again!
```

### When to Use Which

| Scenario | Use | Reason |
| --- | --- | --- |
| Global store `state$` | `remember()` | Must outlive all subscribers |
| View-scoped computation | `rememberWhileSubscribed()` | Should clean up when view is destroyed |
| HTTP cache you want to keep | `remember()` | Cached even after navigation |
| HTTP cache for current view only | `rememberWhileSubscribed()` | Re-fetches if user returns |

---

## Step 9: Error-Resilient Stores — `@rxjs-spa/errors`

### The Problem

In RxJS, if an error reaches a `scan()` operator, the entire pipeline terminates. This means a single reducer bug or failed side-effect can kill your store permanently — no more state updates, no UI reactivity.

`@rxjs-spa/errors` solves this with several complementary tools.

### 9a. `createErrorHandler()` — Global Error Bus

```typescript
export function createErrorHandler(
  config?: ErrorHandlerConfig,
): [ErrorHandler, Subscription]
```

Creates a centralized error event bus:

```typescript
const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true, // Capture window.onerror + unhandledrejection
  onError: (e) => console.error(`[${e.source}] ${e.message}`),
})
```

#### The `AppError` Type

Every error flowing through the handler is normalized to:

```typescript
export interface AppError {
  source: 'observable' | 'global' | 'promise' | 'manual'
  error: Error
  message: string
  timestamp: number
  context?: string // Developer label (e.g. "usersView/FETCH")
}
```

#### Internal Architecture

```typescript
const bus = new Subject<AppError>() // Hot stream, does NOT replay

function reportError(raw: unknown, source: AppError['source'], context?: string): void {
  const error = toError(raw) // Normalize any thrown value to Error
  const appError: AppError = {
    source,
    error,
    message: error.message,
    timestamp: Date.now(),
    context,
  }

  onError?.(appError) // Call onError callback immediately (logging, Sentry)
  bus.next(appError) // Emit to the hot bus
}
```

#### Global Capture

When `enableGlobalCapture: true`:

```typescript
// Catches synchronous JS errors
fromEvent<ErrorEvent>(window, 'error').subscribe((e) => {
  reportError(e.error ?? new Error(e.message), 'global')
})

// Catches unhandled promise rejections
fromEvent<PromiseRejectionEvent>(window, 'unhandledrejection').subscribe((e) => {
  reportError(e.reason, 'promise')
})
```

#### Consuming Errors

```typescript
// Show toast on every error
errorHandler.errors$.subscribe((e) => {
  showToast(`Error: ${e.message}`, { context: e.context })
})
```

**Key**: `errors$` is **hot** (uses `Subject`, not `BehaviorSubject`). Late subscribers do NOT see past errors. This is intentional — you want to show toasts for new errors, not replay old ones.

### 9b. `catchAndReport()` — Drop-in Error Handling for Streams

```typescript
export function catchAndReport<T>(
  handler: ErrorHandler,
  options?: {
    fallback?: T | Observable<T> // Value to emit on error
    context?: string // Developer label for debugging
  },
): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> =>
    source.pipe(
      catchError((raw): Observable<T> => {
        // 1. Report to centralized handler
        handler.reportError(raw, 'observable', options?.context)

        // 2. Emit fallback or complete
        if (options?.fallback !== undefined) {
          const fb = options.fallback
          return fb instanceof Observable ? fb : of(fb as T)
        }
        return EMPTY // Complete without emitting
      }),
    )
}
```

#### Usage in Effects

```typescript
store.actions$
  .pipe(
    ofType('FETCH'),
    switchMap(() =>
      http.get('/api/users').pipe(
        map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Network failed' },
          context: 'usersView/FETCH',
        }),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

**If HTTP fails:**

1. Error is reported to handler with `context='usersView/FETCH'`
2. `FETCH_ERROR` action is dispatched as the fallback value
3. The outer `switchMap` stream stays alive — future FETCH actions still work

### 9c. `safeScan()` — Reducer Protection

Wraps `scan()` so a reducer throw doesn't kill the state pipeline:

```typescript
export function safeScan<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
  handler: ErrorHandler,
  options?: { context?: string },
): OperatorFunction<A, S> {
  return (source: Observable<A>): Observable<S> =>
    source.pipe(
      scan((state: S, action: A): S => {
        try {
          return reducer(state, action)
        } catch (raw) {
          // Report error but return PREVIOUS state
          handler.reportError(raw, 'observable', options?.context)
          return state // ← Pipeline survives, state unchanged
        }
      }, initial),
    )
}
```

**Example:**

```typescript
store.dispatch({ type: 'INC' }) // count = 1
store.dispatch({ type: 'BOOM' }) // Reducer throws → error reported → state stays at 1
store.dispatch({ type: 'INC' }) // count = 2 — pipeline survived!
```

### 9d. `createSafeStore()` — Full Store with Reducer Protection

Drop-in replacement for `createStore` using `safeScan` internally:

```typescript
export function createSafeStore<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
  handler: ErrorHandler,
  options?: { context?: string },
): Store<S, A> {
  const actionsSubject = new Subject<A>()
  const stateBs = new BehaviorSubject<S>(initialState)
  const actions$ = actionsSubject.asObservable()

  const state$ = actionsSubject.pipe(
    safeScan(reducer, initialState, handler, options), // ← Only difference
    startWith(initialState),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  state$.subscribe((s) => stateBs.next(s))

  return {
    state$,
    actions$,
    dispatch: (action) => actionsSubject.next(action),
    select: (selector) => state$.pipe(map(selector), distinctUntilChanged()),
    getState: () => stateBs.value,
  }
}
```

The only difference from `createStore` is using `safeScan` instead of `scan`. The rest of the API is identical.

### 9e. `safeSubscribe()` — Protected Subscriptions

```typescript
export function safeSubscribe<T>(
  source$: Observable<T>,
  handler: ErrorHandler,
  next: (value: T) => void,
  options?: { context?: string },
): Subscription {
  return source$.subscribe({
    next,
    error: (raw) => handler.reportError(raw, 'observable', options?.context),
  })
}
```

Prevents silent subscription deaths by auto-wiring the error callback to the centralized handler.

---

## Step 10: State Persistence — `@rxjs-spa/persist`

### Three-Tier API

`@rxjs-spa/persist` provides three levels of abstraction for persisting state to `localStorage` (or any custom `Storage` backend).

### 10a. `loadState()` — Hydrate from Storage

```typescript
export function loadState<S>(
  key: string,
  defaultState: S,
  opts?: PersistOptions<S>,
): S {
  const storage = opts?.storage ?? localStorage

  try {
    const raw = storage.getItem(key)
    if (!raw) return defaultState // Nothing saved

    const saved = JSON.parse(raw) as Partial<S>
    return { ...defaultState, ...saved } // Shallow merge
  } catch {
    return defaultState // JSON corrupt → graceful fallback
  }
}
```

**Merge strategy:**

```typescript
const defaultState = { count: 0, label: 'hello', theme: 'light' }

// localStorage has: { "count": 5 }  (only count was saved)
const hydrated = loadState('app', defaultState)
// Result: { count: 5, label: 'hello', theme: 'light' }
//         ↑ from storage   ↑ from defaults    ↑ from defaults
```

Missing keys are filled from defaults. This means adding new state properties in a code update won't break existing users — they get the default for new fields.

### 10b. `persistState()` — Sync State to Storage

```typescript
export function persistState<S>(
  source: { state$: Observable<S> },
  key: string,
  opts?: PersistOptions<S>,
): Subscription {
  const storage = opts?.storage ?? localStorage
  const pick = opts?.pick // Optional: only persist these keys

  return source.state$.subscribe((state) => {
    const toSave = pick
      ? (Object.fromEntries(pick.map((k) => [k, state[k]])) as Partial<S>)
      : state

    storage.setItem(key, JSON.stringify(toSave))
  })
}
```

The `pick` option allows **selective persistence** — only specified keys are saved:

```typescript
persistState(store, 'app:state', {
  pick: ['theme', 'user'], // Persist these
  // 'redirectPath', 'toastNotification' are NOT persisted (ephemeral)
})
```

### 10c. `createPersistedStore()` — Integrated Solution

Combines `createStore` + `loadState` + `persistState` into a single call:

```typescript
export function createPersistedStore<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
  key: string,
  opts?: PersistOptions<S>,
): Store<S, A> {
  const storage = opts?.storage ?? localStorage
  const version = opts?.version ?? 1
  const versionKey = `${key}.__version__`

  // 1. Version check — wipe on mismatch
  if (storage.getItem(versionKey) !== String(version)) {
    storage.removeItem(key)
    storage.setItem(versionKey, String(version))
  }

  // 2. Hydrate: load saved state merged with defaults
  const hydratedState = loadState(key, initialState, opts)

  // 3. Create store with hydrated initial state
  const store = createStore<S, A>(reducer, hydratedState)

  // 4. Start persisting on every state change
  persistState(store, key, opts)

  return store
}
```

### Complete Persistence Flow

```typescript
interface UIState {
  theme: 'light' | 'dark'
  sidebarOpen: boolean
  toastNotification: string | null // Ephemeral — don't persist
}

// First run: localStorage is empty
const store = createPersistedStore(
  uiReducer,
  { theme: 'light', sidebarOpen: true, toastNotification: null },
  'ui:state',
  { pick: ['theme', 'sidebarOpen'], version: 1 },
)
// store starts with defaults

store.dispatch({ type: 'TOGGLE_THEME' }) // theme → 'dark'
// localStorage: {"theme":"dark","sidebarOpen":true}

// ──── PAGE RELOAD ────

// Second run: localStorage has saved data
// loadState merges: { theme: 'dark', sidebarOpen: true, toastNotification: null }
// Store initializes with hydrated state → user sees dark theme!

// ──── SCHEMA CHANGE (version bump to 2) ────

// Third run: version check fails (stored: 1, code: 2)
// Storage is wiped, store starts from defaults
// User gets fresh state with new schema
```

### PersistOptions

```typescript
interface PersistOptions<S> {
  storage?: Storage // Default: localStorage. Can use sessionStorage or custom
  pick?: (keyof S)[] // Only persist these keys
  version?: number // Wipe storage when version changes
}
```

---

## Step 11: Testing Utilities — `@rxjs-spa/testing`

### 11a. `collectFrom()` — Observable Assertion Helper

```typescript
export function collectFrom<T>(
  obs$: Observable<T>,
): {
  values: T[]
  subscription: Subscription
} {
  const values: T[] = []
  const subscription = obs$.subscribe((v) => values.push(v))
  return { values, subscription }
}
```

Eliminates boilerplate for testing Observable emissions:

```typescript
// Before (boilerplate):
const values: number[] = []
const sub = store.select((s) => s.count).subscribe((v) => values.push(v))
store.dispatch({ type: 'INC' })
expect(values).toEqual([0, 1])
sub.unsubscribe()

// After (clean):
const result = collectFrom(store.select((s) => s.count))
store.dispatch({ type: 'INC' })
expect(result.values).toEqual([0, 1])
result.subscription.unsubscribe()
```

### 11b. `createMockStore()` — Drop-in Store Replacement

```typescript
export function createMockStore<S, A>(initialState: S): MockStore<S, A>
```

Provides a full `Store<S, A>` implementation plus two extra features:

| Method/Property | Purpose |
| --- | --- |
| `setState(state)` | Drive state directly without dispatching actions |
| `dispatchedActions` | Array of all actions passed to `dispatch()` for assertions |

**Implementation highlights:**

```typescript
export function createMockStore<S, A>(initialState: S): MockStore<S, A> {
  const stateBs = new BehaviorSubject<S>(initialState)
  const actionsSubject = new Subject<A>()
  const dispatchedActions: A[] = []

  return {
    state$: stateBs.pipe(shareReplay({ bufferSize: 1, refCount: false })),
    actions$: actionsSubject.asObservable(),

    dispatch(action: A) {
      dispatchedActions.push(action) // Record for assertions
      actionsSubject.next(action) // Emit for effect subscribers
    },

    select: (selector) => stateBs.pipe(map(selector), distinctUntilChanged()),
    getState: () => stateBs.value,

    // Mock-specific:
    setState(state: S) {
      stateBs.next(state) // Drive state directly
    },
    dispatchedActions,
  }
}
```

**Key difference from real store**: `setState()` bypasses the reducer entirely. This lets you set up any state scenario without needing to dispatch a sequence of actions.

**Testing a component:**

```typescript
it('dispatches FETCH on mount', () => {
  const store = createMockStore<UsersState, UsersAction>({ users: [], loading: false })
  usersView(container, store)

  expect(store.dispatchedActions).toContainEqual({ type: 'FETCH' })
})

it('renders users when state changes', () => {
  const store = createMockStore<UsersState, UsersAction>({ users: [], loading: false })
  usersView(container, store)

  store.setState({
    users: [{ id: '1', name: 'Alice' }],
    loading: false,
  })

  expect(container.textContent).toContain('Alice')
})
```

### 11c. `createMockHttpClient()` — Mock HTTP Requests

```typescript
export function createMockHttpClient(): MockHttpClient
```

Provides a configurable HTTP client mock:

```typescript
const http = createMockHttpClient()

// Configure responses
http.whenGet('/api/users').respond([{ id: 1, name: 'Alice' }])
http.whenPost('/api/users').respond({ id: 2, name: 'Bob' })

// Use in code under test
http.get('/api/users').subscribe((users) => {
  console.log(users) // [{ id: 1, name: 'Alice' }]
})

// Assert calls
expect(http.calls).toEqual([{ method: 'GET', url: '/api/users' }])

// Unconfigured URLs throw
http.get('/api/unknown').subscribe({
  error: (e) => console.log(e.message), // "No mock configured for GET /api/unknown"
})
```

**Advanced: Custom Observable responses:**

```typescript
// Simulate delay
http.whenGet('/api/slow').respondWith(of(data).pipe(delay(1000)))

// Simulate error
http.whenGet('/api/fail').respondWith(throwError(() => new Error('500')))
```

### 11d. Testing Effects End-to-End

```typescript
it('FETCH effect dispatches FETCH_SUCCESS', () => {
  const http = createMockHttpClient()
  const store = createMockStore<UsersState, UsersAction>({
    users: [],
    loading: false,
  })

  // Configure mock
  http.whenGet('/api/users').respond([{ id: 1, name: 'Alice' }])

  // Wire up effect (same code as production)
  const effectSub = store.actions$
    .pipe(
      ofType('FETCH'),
      switchMap(() =>
        http.get<User[]>('/api/users').pipe(
          map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        ),
      ),
    )
    .subscribe((action) => store.dispatch(action))

  // Trigger
  store.dispatch({ type: 'FETCH' })

  // Assert
  expect(http.calls).toEqual([{ method: 'GET', url: '/api/users' }])
  expect(store.dispatchedActions).toEqual([
    { type: 'FETCH' },
    { type: 'FETCH_SUCCESS', users: [{ id: 1, name: 'Alice' }] },
  ])

  effectSub.unsubscribe()
})
```

---

## Step 12: Real-World Integration — Demo App Patterns

### Global Store (App-Wide Singleton)

```typescript
// store/global.store.ts
export interface GlobalState {
  theme: Theme
  isAuthenticated: boolean
  user: AuthUser | null
  redirectPath: string | null
}

export type GlobalAction =
  | { type: 'TOGGLE_THEME' }
  | { type: 'LOGIN_SUCCESS'; user: AuthUser }
  | { type: 'LOGOUT' }
  | { type: 'SET_REDIRECT'; path: string | null }

function globalReducer(state: GlobalState, action: GlobalAction): GlobalState {
  switch (action.type) {
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    case 'LOGIN_SUCCESS':
      return { ...state, isAuthenticated: true, user: action.user }
    case 'LOGOUT':
      return { ...state, isAuthenticated: false, user: null }
    case 'SET_REDIRECT':
      return { ...state, redirectPath: action.path }
    default:
      return state
  }
}

export const globalStore = createPersistedStore<GlobalState, GlobalAction>(
  globalReducer,
  { theme: 'light', isAuthenticated: false, user: null, redirectPath: null },
  'rxjs-spa:global',
  {
    pick: ['theme', 'isAuthenticated', 'user'], // Don't persist ephemeral redirectPath
    version: 1,
  },
)
```

### Local Store (View-Scoped, Destroyed on Navigation)

```typescript
// views/users.view.ts
export function usersView(container: Element, globalStore: Store, router: Router): Subscription {
  // ── LOCAL STATE: Only exists while this view is mounted ──
  interface UsersState {
    users: User[]
    loading: boolean
    error: string | null
    search: string
  }

  type UsersAction =
    | { type: 'FETCH' }
    | { type: 'FETCH_SUCCESS'; users: User[] }
    | { type: 'FETCH_ERROR'; error: string }
    | { type: 'SET_SEARCH'; query: string }

  function usersReducer(state: UsersState, action: UsersAction): UsersState {
    switch (action.type) {
      case 'FETCH':
        return { ...state, loading: true, error: null }
      case 'FETCH_SUCCESS':
        return { ...state, loading: false, users: action.users }
      case 'FETCH_ERROR':
        return { ...state, loading: false, error: action.error }
      case 'SET_SEARCH':
        return { ...state, search: action.query }
      default:
        return state
    }
  }

  const store = createStore<UsersState, UsersAction>(usersReducer, {
    users: [],
    loading: false,
    error: null,
    search: '',
  })

  // ── EFFECTS: Side-effects wired to actions$ ──
  const effectSub = store.actions$.pipe(
    ofType('FETCH'),
    switchMap(() =>
      http.get<User[]>('/api/users').pipe(
        map(users => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load users' },
          context: 'usersView/FETCH',
        }),
      ),
    ),
  ).subscribe(action => store.dispatch(action))

  // ── TRIGGER INITIAL LOAD ──
  store.dispatch({ type: 'FETCH' })

  // ── DERIVED STREAMS ──
  const filteredUsers$ = store.state$.pipe(
    map(s => s.search.trim()
      ? s.users.filter(u => u.name.toLowerCase().includes(s.search.toLowerCase()))
      : s.users
    ),
  )
  const loading$ = store.select(s => s.loading)
  const error$ = store.select(s => s.error)

  // ── RENDER ──
  container.innerHTML = `
    <section class="users-view">
      <h1>Users</h1>
      <input id="search" type="search" placeholder="Filter…" />
      <button id="refresh">Refresh</button>
      <p id="error"></p>
      <p id="loading">Loading…</p>
      <ul id="list"></ul>
    </section>
  `

  // ── MOUNT: Wire sinks and return unified subscription ──
  return mount(container, (root) => [
    effectSub,

    // Search input → dispatch SET_SEARCH
    events(root.querySelector('#search')!, 'input').pipe(
      map(e => (e.target as HTMLInputElement).value),
    ).subscribe(query => store.dispatch({ type: 'SET_SEARCH', query })),

    // Refresh button → dispatch FETCH
    events(root.querySelector('#refresh')!, 'click')
      .subscribe(() => store.dispatch({ type: 'FETCH' })),

    // Bind loading visibility
    classToggle(root.querySelector('#loading')!, 'hidden')(
      loading$.pipe(map(l => !l))
    ),

    // Bind error text
    text(root.querySelector('#error')!)(error$.pipe(map(e => e ?? ''))),

    // Bind user list
    renderKeyedList(
      root.querySelector('#list')!,
      u => u.id,
      (user) => {
        const li = document.createElement('li')
        li.textContent = user.name
        return { node: li, sub: null }
      },
    )(filteredUsers$),
  ])
}
```

**Lifecycle**: When the router navigates away from this view, the returned `Subscription` is unsubscribed. This:

1. Cancels all in-flight HTTP requests
2. Removes all event listeners
3. Destroys the local store (garbage collected)
4. Clears all DOM bindings

### Error Handler Setup (App Bootstrap)

```typescript
// error-handler.ts
const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) => console.error(`[${e.source}] ${e.message}`),
})

// Show error toasts
errorHandler.errors$.subscribe((e) => {
  showToast(e.message, { type: 'error', duration: 4000 })
})

export { errorHandler }
```

### HMR Cleanup (Vite)

```typescript
// main.ts
let appSub: Subscription | null = null

function bootstrap() {
  const router = createRouter(routes, { mode: 'history' })
  appSub = mountApp(document.getElementById('app')!, router, globalStore)
}

bootstrap()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    appSub?.unsubscribe() // Tear down all views, effects, listeners
    router.destroy() // Remove history mode click interceptor
  })
}
```

---

## Step 13: Complete Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        RXJS-SPA STATE MANAGEMENT                         │
└──────────────────────────────────────────────────────────────────────────┘

USER INTERACTION (e.g., button click)
  │
  ├─→ store.dispatch({ type: 'FETCH', userId: 42 })
  │     │
  │     ├─→ actionsSubject.next(action)          ← Action enters Subject
  │     │
  │     ├─→ scan(reducer, prevState)             ← Reducer runs synchronously
  │     │     └─→ reducer(prevState, action) → newState
  │     │
  │     ├─→ state$ emits newState                ← All subscribers notified
  │     │
  │     ├─→ stateBs.next(newState)               ← BehaviorSubject syncs
  │     │
  │     └─→ getState() returns newState          ← Synchronous access
  │
  └─→ actions$ emits action                      ← Effects can observe
        │
        ├─→ ofType('FETCH') filters
        │
        ├─→ switchMap: http.get('/api/users/42')
        │     └─→ Cold Observable → XHR sent on subscribe
        │
        ├─→ HTTP response arrives
        │     └─→ map → { type: 'FETCH_SUCCESS', user: {...} }
        │
        └─→ subscribe: store.dispatch(resultAction)
              └─→ Cycle repeats: reducer → state$ → UI


PERSISTENCE LAYER (fire-and-forget)
  state$
    └─→ subscribe: localStorage.setItem(key, JSON.stringify(state))
        └─→ Every state change auto-saved


ERROR HANDLING LAYER
  Any error in pipeline:
    └─→ catchAndReport(handler, { fallback, context })
          ├─→ handler.reportError(error, source, context)
          │     ├─→ onError callback (logging, Sentry)
          │     └─→ bus.next(appError) → errors$ subscribers (toasts, UI)
          └─→ Emit fallback value or EMPTY
                └─→ Pipeline stays alive


REDUCER PROTECTION (safeScan)
  action → try { reducer(state, action) }
         catch → reportError, return prevState
                 └─→ Pipeline survives, state unchanged
```

---

## Step 14: Key Architectural Principles

### 1. Unidirectional Data Flow

Actions → Reducer → State → View. Data only flows one way. The view dispatches actions, never mutates state directly.

### 2. Pure Reducers

Reducers are pure functions: `(state, action) → newState`. No side-effects, no API calls, no randomness. They're trivially testable.

### 3. Side-Effects via `actions$`

HTTP, timers, navigation, analytics — all wired as subscriptions on `store.actions$`. Effects are separate from the reducer, making both independently testable.

### 4. Multicasting with Replay

`state$` uses `shareReplay({ bufferSize: 1, refCount: false })`. All subscribers share one pipeline. Late subscribers immediately receive the current state.

### 5. Synchronous Snapshots

`getState()` and the internal `BehaviorSubject` provide immediate, synchronous access to the current state — useful in event handlers and imperative code.

### 6. Composition over Configuration

Instead of one monolithic store, compose small focused stores per domain. Combine them with `combineStores()` when needed.

### 7. Error Resilience

`safeScan` and `catchAndReport` keep pipelines alive through errors. A single bug doesn't kill the entire app's reactivity.

### 8. Type Safety

`ofType()` provides automatic TypeScript type narrowing on action discriminated unions. The compiler catches mismatched action types at build time.

### 9. Explicit Subscription Lifecycle

All subscriptions are explicit and tracked. HMR `dispose` and view navigation call `.unsubscribe()` to prevent leaks. No magic cleanup — you own the lifecycle.

### 10. Testability by Design

Mock store, mock HTTP, and `collectFrom()` make testing straightforward. Effects can be tested end-to-end with mock responses. Components can be tested with `setState()` to drive any state scenario.
