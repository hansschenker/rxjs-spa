# @rxjs-spa/persist — Package Analysis

## Overview

`@rxjs-spa/persist` is a lightweight persistence layer for RxJS stores that provides localStorage/sessionStorage integration with schema versioning, selective field persistence, and custom storage backend support. It acts as a transparent drop-in replacement for `createStore` from `@rxjs-spa/store`.

- **Version:** 0.1.0
- **Peer Dependencies:** RxJS 7.8.2, `@rxjs-spa/store` 0.1.0
- **Build:** Vite library mode (ES + CJS), `rxjs` and `@rxjs-spa/store` kept external
- **Tests:** jsdom via Vitest — 18 tests across 4 suites
- **Source Size:** ~143 lines in a single module (`public.ts`)

---

## Architecture

```
createPersistedStore(reducer, initialState, key, opts?)
    │
    ├── 1. VERSION CHECK
    │       Read storage[key.__version__]
    │       Mismatch? → wipe storage[key], write new version
    │
    ├── 2. HYDRATION
    │       loadState(key, initialState, opts)
    │       → JSON.parse(storage[key])
    │       → shallow merge: { ...initialState, ...saved }
    │       → graceful fallback on corrupt JSON
    │
    ├── 3. STORE CREATION
    │       createStore(reducer, hydratedState)
    │       → full Store<S, A> interface
    │
    └── 4. PERSISTENCE WIRING
            persistState(store, key, opts)
            → subscribe to store.state$
            → JSON.stringify on each emission
            → write to storage[key]
            → fire-and-forget (subscription lives for app lifetime)
```

The returned `Store<S, A>` is identical to a regular store — consumers cannot tell whether persistence is active.

---

## Storage Key Convention

Each persisted store uses two storage keys:

| Key | Content |
|-----|---------|
| `key` | JSON-serialized state (full or partial via `pick`) |
| `key.__version__` | Schema version number as string |

Both are removed by `clearState(key)`.

---

## Core API

### `createPersistedStore<S, A>(reducer, initialState, key, opts?): Store<S, A>`

Drop-in replacement for `createStore` with automatic hydration and persistence.

```typescript
import { createPersistedStore } from '@rxjs-spa/persist'

const store = createPersistedStore(
  reducer,
  { count: 0, theme: 'light', token: '' },
  'app:settings',
  { version: 2, pick: ['count', 'theme'] },
)
```

**Lifecycle:**

1. **Version check** — reads `app:settings.__version__` from storage. If it doesn't match `version` (default `1`), wipes the stored state and writes the new version. This protects the app from stale or incompatible persisted data after schema changes.

2. **Hydration** — calls `loadState()` to read and merge stored state with `initialState`. Stored keys override defaults; missing keys fall back to defaults (shallow merge).

3. **Store creation** — passes the hydrated state to `createStore()` as the initial state.

4. **Persistence wiring** — subscribes to `store.state$` and writes to storage on every emission. If `pick` is provided, only the listed keys are serialized. The subscription is fire-and-forget (never unsubscribed — lives for the app's lifetime).

**Returns:** Full `Store<S, A>` interface (`state$`, `actions$`, `dispatch`, `select`, `getState`).

---

### `loadState<S>(key, defaultState, opts?): S`

Reads state from storage and shallow-merges with defaults.

```typescript
const state = loadState('app:settings', { count: 0, theme: 'light' }, { storage: sessionStorage })
```

- Returns `defaultState` if key is missing or JSON is corrupt (graceful degradation)
- Shallow merge: `{ ...defaultState, ...saved }` — only top-level keys override
- New fields added to `defaultState` since last persist automatically get their defaults

---

### `persistState<S>(source, key, opts?): Subscription`

Subscribes to `source.state$` and writes to storage on every emission.

```typescript
const sub = persistState(store, 'app:settings', { pick: ['count'] })
// Later:
sub.unsubscribe()  // stops persisting
```

- `source` can be any object with `state$: Observable<S>` (works with regular stores too)
- If `pick` is provided, constructs a partial object with only those keys before serializing
- Returns a `Subscription` — unsubscribing stops further writes

---

### `clearState(key, storage?): void`

Removes both the state entry and its version marker from storage.

```typescript
clearState('app:settings')                    // clears from localStorage
clearState('app:settings', sessionStorage)    // clears from sessionStorage
```

---

## Configuration

```typescript
interface PersistOptions<S> {
  pick?: Array<keyof S>    // Only persist these keys (whitelist)
  storage?: Storage        // Custom storage backend (default: localStorage)
  version?: number         // Schema version (default: 1)
}
```

### `pick` — Selective Field Persistence

Whitelist approach: only specified keys are written to storage.

```typescript
createPersistedStore(reducer, initialState, 'key', {
  pick: ['theme', 'locale'],  // token, user data, etc. stay in-memory only
})
```

Use cases:
- Exclude sensitive data (auth tokens, PII) from localStorage
- Reduce storage footprint by persisting only user preferences
- Keep transient UI state (loading flags, modals) out of storage

### `storage` — Custom Backend

Any object implementing the `Storage` interface works:

```typescript
// sessionStorage instead of localStorage
createPersistedStore(reducer, initial, 'key', { storage: sessionStorage })

// In-memory mock for testing
const mock = makeStorage()
createPersistedStore(reducer, initial, 'key', { storage: mock })
```

### `version` — Schema Versioning

When the version number changes, stored state is wiped and the store starts fresh from `initialState`.

```typescript
// Version 1: { count: number, theme: string }
// Version 2: { count: number, theme: string, locale: string }  ← new field
createPersistedStore(reducer, initialState, 'key', { version: 2 })
// On first run after upgrade: old storage wiped, starts from initialState
```

This prevents runtime errors from deserializing state that no longer matches the expected shape.

---

## Design Decisions

### 1. Shallow Merge, Not Deep Merge

`loadState` uses `{ ...defaultState, ...saved }`. Only top-level keys are overridden — nested objects are replaced entirely, not recursively merged. This is simple and predictable: if a field exists in storage, it wins completely.

### 2. Fire-and-Forget Persistence

`createPersistedStore` discards the subscription returned by `persistState`. The subscription lives for the app's lifetime with no cleanup. This matches the SPA paradigm where the store and its persistence outlive any individual component.

### 3. Transparent Interface

The returned store is indistinguishable from a regular `createStore` result. Consumers interact with the same `state$`, `dispatch`, `select`, `getState` — persistence is an invisible infrastructure concern.

### 4. Composable Primitives

The four exports serve two audiences:
- **Quick setup:** `createPersistedStore` composes everything in one call
- **Custom patterns:** `loadState`, `persistState`, `clearState` can be used independently for advanced scenarios (e.g., debounced writes, conditional persistence, multi-key storage)

### 5. Graceful Degradation

Corrupt JSON, missing keys, and storage errors don't crash the app — `loadState` catches exceptions and falls back to `defaultState`. The app always boots into a valid state.

### 6. Version Wipe, Not Migration

On version mismatch, the stored state is deleted entirely. There's no migration logic — the assumption is that `initialState` provides safe defaults for the new version. This keeps the implementation simple and avoids complex migration chains.

---

## Test Coverage

| Suite | Tests | Key Scenarios |
|-------|-------|---------------|
| `loadState` | 4 | Empty storage returns defaults; partial merge (stored keys override, missing keys fall back); corrupt JSON returns defaults; null storage value |
| `persistState` | 3 | Full state writes on each emission; `pick` filters to specified keys only; unsubscribe stops further writes |
| `clearState` | 1 | Removes both state key and `__version__` key |
| `createPersistedStore` | 9 | Cold start (empty storage); warm start (hydration from storage); partial hydration merge; auto-persist on dispatch; `pick` filtering; version mismatch wipes and starts fresh; version match retains data; first-run version initialization; full `Store<S,A>` interface check |

**Total: 18 tests** covering all paths including error handling, partial state, version migration, and interface transparency.

All tests use a mock in-memory `Storage` implementation (`makeStorage()`) to avoid browser dependency.

---

## Integration with rxjs-spa

| Package | Relationship |
|---------|-------------|
| `@rxjs-spa/store` | Direct dependency — `createPersistedStore` wraps `createStore`; imports `Reducer<S,A>` and `Store<S,A>` types |
| `@rxjs-spa/errors` | No integration — persistence failures silently degrade |
| `@rxjs-spa/testing` | Mock storage for tests; `createMockStore` can substitute in test scenarios |

---

## File Map

```
packages/persist/
  package.json              Package metadata, peer deps (rxjs + @rxjs-spa/store)
  vite.config.ts            Vite library build (ES + CJS), externals
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (143 lines)
    public.test.ts          Complete test suite (213 lines, 18 tests)
```

---

## API Surface Summary

**Factory:**
- `createPersistedStore<S, A>(reducer, initialState, key, opts?): Store<S, A>`

**Primitives:**
- `loadState<S>(key, defaultState, opts?): S`
- `persistState<S>(source, key, opts?): Subscription`
- `clearState(key, storage?): void`

**Types:**
- `PersistOptions<S>` — `{ pick?, storage?, version? }`

---

## Summary

`@rxjs-spa/persist` is a focused ~143-line persistence layer that wraps `@rxjs-spa/store` with automatic localStorage hydration, continuous state persistence, schema versioning, and selective field storage. It provides both an opinionated one-liner (`createPersistedStore`) and composable primitives (`loadState`, `persistState`, `clearState`) for custom patterns. The design prioritizes graceful degradation (corrupt JSON and missing keys never crash), transparency (identical `Store<S,A>` interface), and simplicity (shallow merge, version wipe over migration, fire-and-forget subscription). At 4 functions and 18 tests, it achieves reliable persistence with minimal surface area.
