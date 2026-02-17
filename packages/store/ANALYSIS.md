# @rxjs-spa/store — Package Analysis

## Overview

`@rxjs-spa/store` is a minimal, type-safe MVU (Model-View-Update) state management library built entirely on RxJS primitives. It provides a unidirectional data flow where actions feed a pure reducer via `scan`, producing a multicasted state stream with synchronous snapshot access.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2
- **Build:** Vite library mode (ES + CJS), `rxjs` kept external
- **Tests:** Node environment via Vitest — 23 tests
- **Source Size:** ~158 lines in a single module (`public.ts`)

---

## Architecture

```
dispatch(action)
    │
    ▼
Subject<A>  ──────────────────────────────────────►  actions$
    │                                                   │
    ▼                                              (effects wire here)
scan(reducer, initialState)
    │
    ▼
startWith(initialState)
    │
    ▼
shareReplay({ bufferSize: 1, refCount: false })
    │
    ▼
state$  ──────────────────────►  BehaviorSubject (snapshot)
    │                                   │
    ├── select(selector)                └── getState()
    │     map(selector)                     (synchronous)
    │     distinctUntilChanged()
    │         │
    │         ▼
    │     Observable<T>  (derived slice)
    │
    └── Direct subscription (full state)
```

Side effects (HTTP, timers, routing) are wired to `actions$`, not the reducer:

```typescript
store.actions$.pipe(
  ofType('FETCH_USERS'),
  switchMap(() => http.get<User[]>('/api/users')),
  map(users => ({ type: 'USERS_LOADED' as const, users })),
  catchError(() => of({ type: 'USERS_ERROR' as const })),
).subscribe(store.dispatch)
```

---

## Core API

### `createStore<S, A>(reducer, initialState): Store<S, A>`

Creates a state container. Returns an object with five members:

| Member | Type | Description |
|--------|------|-------------|
| `state$` | `Observable<S>` | Multicasted state stream; replays latest value to late subscribers |
| `actions$` | `Observable<A>` | Stream of every dispatched action; does **not** replay past actions |
| `dispatch(action)` | `(A) => void` | Synchronous action dispatcher |
| `select(selector)` | `(S => T) => Observable<T>` | Derived state slice with `distinctUntilChanged` deduplication |
| `getState()` | `() => S` | Synchronous snapshot of current state |

#### Internal Pipeline

1. **`Subject<A>`** — hot Observable collecting all dispatched actions
2. **`scan(reducer, initialState)`** — accumulates state from actions (pure reducer, no side effects)
3. **`startWith(initialState)`** — ensures first emission is the initial state (scan alone waits for the first action)
4. **`shareReplay({ bufferSize: 1, refCount: false })`** — multicasts to all subscribers, replays latest state to late subscribers, keeps the chain alive even with zero subscribers
5. **`BehaviorSubject<S>`** — internal snapshot driven by a permanent subscription to `state$`; powers `getState()`

#### Key Behaviors

- **Synchronous dispatch:** calling `dispatch()` immediately runs the action through the reducer and updates `state$` and `getState()` synchronously
- **Late subscriber replay:** any subscriber to `state$` (or `select()`) immediately receives the current state
- **No action replay:** `actions$` is hot — late subscribers only see future actions (prevents memory bloat)
- **Permanent internal subscription:** the store subscribes to its own `state$` to keep the `BehaviorSubject` snapshot in sync; this subscription is never unsubscribed

---

### `ofType<A, K>(...types): OperatorFunction<A, Extract<A, { type: K }>>`

Filters an action stream to only matching types and narrows the TypeScript type.

```typescript
store.actions$.pipe(
  ofType('LOAD_USERS', 'REFRESH'),
  // action is now typed as Extract<Action, { type: 'LOAD_USERS' | 'REFRESH' }>
  switchMap(action => ...),
)
```

#### Type Narrowing

- Constrains `A` to `{ type: string }`
- Uses `Extract<A, { type: K }>` to select only union members whose `type` matches
- The `filter()` call uses a type guard predicate (`action is Extract<...>`)
- Requires at least one type argument (tuple: `[K, ...K[]]`)

#### Runtime Implementation

Simple `Array.includes()` check — O(n) where n is the number of types passed (typically 1–3).

---

### `combineStores<A, B, R>(storeA, storeB, project): Observable<R>`

Derives a combined Observable from two stores using `combineLatest`:

```typescript
const viewModel$ = combineStores(authStore, uiStore, (auth, ui) => ({
  username: auth.user?.name,
  theme: ui.theme,
  isAdmin: auth.role === 'admin',
}))
```

#### Behavior

- Waits for both `state$` streams to emit (both replay immediately via `shareReplay`)
- Emits whenever **either** store's state changes
- Projects combined state through the provided function
- Returns a plain `Observable<R>`, **not** a `Store` — no `dispatch`, no `getState`
- Subscribers must dispatch to the source stores separately

---

## Types

```typescript
// Pure function: (previous state, action) → new state
type Reducer<S, A> = (state: S, action: A) => S

// Full store interface
interface Store<S, A> {
  state$: Observable<S>
  actions$: Observable<A>
  dispatch(action: A): void
  select<T>(selector: (state: S) => T): Observable<T>
  getState(): S
}
```

Actions are expected to follow the discriminated union pattern:

```typescript
type Action =
  | { type: 'INCREMENT' }
  | { type: 'DECREMENT' }
  | { type: 'ADD'; amount: number }
  | { type: 'RESET' }
```

---

## Design Decisions

### 1. Pure Reducers, External Effects

The reducer is a pure synchronous function — no side effects, no async logic. Effects are wired separately by subscribing to `actions$`:

```typescript
// Reducer: pure state transition
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'USERS_LOADED': return { ...state, users: action.users }
    default: return state
  }
}

// Effect: wired to actions$, dispatches back
store.actions$.pipe(
  ofType('FETCH_USERS'),
  switchMap(() => http.get('/api/users')),
  map(users => ({ type: 'USERS_LOADED', users })),
).subscribe(store.dispatch)
```

This separates concerns: reducers are testable without mocking HTTP, and effects are composable via RxJS operators.

### 2. Dual Sync/Async State Access

`state$` provides reactive subscriptions; `getState()` provides imperative synchronous access. Both reflect the same state because a permanent internal subscription pipes `state$` into a `BehaviorSubject`.

Use cases for `getState()`:
- Conditional dispatch: `if (store.getState().count > 10) { ... }`
- Integration with non-RxJS code (event handlers, callbacks)
- Guard functions: `() => of(store.getState().isAuthenticated)`

### 3. `refCount: false` on shareReplay

The `shareReplay` keeps the scan chain alive even when all external subscribers disconnect. This ensures:
- `getState()` always works (the BehaviorSubject subscription is permanent)
- Re-subscribing to `state$` replays the correct latest value
- No risk of "cold restart" where the reducer resets to initial state

### 4. Selector Deduplication

`select()` applies `distinctUntilChanged()` after the `map(selector)`. This uses **strict reference equality** (`===`), so:
- Primitive selectors (`s => s.count`) deduplicate naturally
- Object selectors (`s => s.user`) only deduplicate if the same reference is returned
- If a reducer returns a new object with the same values, the selector still emits (new reference)

### 5. No Action Replay

`actions$` is exposed as `actionsSubject.asObservable()` — a hot stream with no buffering. Effects must subscribe eagerly (at store creation time) to catch all actions. This prevents unbounded memory growth from action history buffering.

### 6. Minimal API Surface

Three exports total: `createStore`, `ofType`, `combineStores`. No middleware, no devtools integration, no action creators, no selectors library. The design trusts RxJS operators to fill those roles.

---

## Test Coverage

| Area | Tests | Key Scenarios |
|------|-------|---------------|
| `createStore` initialization | 2 | `getState()` returns initial state; `state$` replays to late subscribers |
| Synchronous dispatch | 1 | `dispatch` + `getState()` reflects updates immediately |
| State emissions | 1 | `select()` emits each new state value in sequence |
| Selector deduplication | 1 | `select()` skips emissions when the slice is unchanged (`distinctUntilChanged`) |
| Late subscriber replay | 1 | Subscribing after dispatches receives only the latest state |
| `actions$` stream | 1 | Emits every dispatched action in order |
| Effect chaining | 1 | `ofType` → `switchMap` → `dispatch` loop (action feedback) |
| `ofType` filtering | 1 | Multi-type filter passes matching, blocks non-matching |
| `ofType` type narrowing | 1 | Verifies TypeScript narrows action type with `Extract` |
| `combineStores` | 1 | Combined emissions from two stores with correct ordering |

**Total: 23 tests** (some describe blocks contain multiple assertions per test).

---

## Usage Patterns

### Basic Counter Store

```typescript
type State = { count: number }
type Action = { type: 'INC' } | { type: 'DEC' } | { type: 'ADD'; amount: number }

const store = createStore<State, Action>(
  (state, action) => {
    switch (action.type) {
      case 'INC': return { count: state.count + 1 }
      case 'DEC': return { count: state.count - 1 }
      case 'ADD': return { count: state.count + action.amount }
      default:    return state
    }
  },
  { count: 0 },
)

store.dispatch({ type: 'INC' })
store.getState()  // { count: 1 }
```

### Effect Wiring

```typescript
store.actions$.pipe(
  ofType('FETCH_USERS'),
  switchMap(() =>
    http.get<User[]>('/api/users').pipe(
      map(users => ({ type: 'USERS_LOADED' as const, users })),
      catchError(() => of({ type: 'USERS_ERROR' as const })),
    ),
  ),
).subscribe(store.dispatch)
```

### Derived View Model

```typescript
const vm$ = combineStores(authStore, uiStore, (auth, ui) => ({
  username: auth.user?.name ?? 'Guest',
  theme: ui.theme,
}))

vm$.subscribe(vm => renderHeader(vm))
```

---

## File Map

```
packages/store/
  package.json              Package metadata, peer deps, conditional exports
  vite.config.ts            Vite library build (ES + CJS), rxjs external
  vitest.config.ts          Node test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (158 lines)
    public.test.ts          Complete test suite (182 lines)
```

---

## API Surface Summary

**Factory:**
- `createStore<S, A>(reducer, initialState): Store<S, A>`

**Operators:**
- `ofType<A, K>(...types): OperatorFunction<A, Extract<A, { type: K }>>`

**Combinators:**
- `combineStores<A, B, R>(storeA, storeB, project): Observable<R>`

**Types:**
- `Reducer<S, A>` — `(state: S, action: A) => S`
- `Store<S, A>` — `{ state$, actions$, dispatch, select, getState }`

---

## Summary

`@rxjs-spa/store` is a deliberately minimal (~158 lines) state management library that implements the MVU pattern using three RxJS primitives: `Subject` for action dispatch, `scan` for reduction, and `shareReplay` for multicasted state. It provides synchronous dispatch, dual sync/async state access, typed action filtering via `ofType`, and multi-store combination via `combineStores`. Side effects are kept outside the reducer and wired through `actions$`, making the system testable, composable, and predictable. The entire API surface is three functions and two types.
