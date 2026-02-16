# Persistence Deep Dive

The `@rxjs-spa/persist` package provides a lightweight, flexible mechanism to persist your application's state to `localStorage` (or any `Storage` implementation). It is designed to work seamlessly with `@rxjs-spa/store`.

## Core Concepts

The persistence strategy is built around the "Event Sourcing" or "State Snapshot" model, but simplified:
1.  **Hydration**: When the app starts, we attempt to load the state from storage.
2.  **Synchronization**: Every time the state changes, we save the new state (or a part of it) to storage.
3.  **Versioning**: We version the data to avoid breaking the app when the state schema changes.

## Integration

The easiest way to use persistence is via `createPersistedStore`, which is a drop-in replacement for `createStore`.

### 1. Basic Usage

```typescript
import { createPersistedStore } from '@rxjs-spa/persist'

interface ThemeState {
  mode: 'light' | 'dark'
}

const store = createPersistedStore<ThemeState, any>(
  themeReducer,
  { mode: 'light' }, // Initial state (fallback)
  'app:theme',       // Storage key
)
```

**What happens here?**
1.  The store looks for `app:theme` in `localStorage`.
2.  If found, it parses the JSON and merges it with `{ mode: 'light' }`.
3.  The store initializes with this hydrated state.
4.  Every time `state$` emits, the new state is written to `localStorage`.

### 2. Partial Persistence (`pick`)

Often, you don't want to persist the *entire* state (e.g., loading flags, temporary errors). Use the `pick` option to select specific keys.

```typescript
const store = createPersistedStore(
  reducer,
  initialState,
  'app:global',
  {
    // Only persist 'theme' and 'user'. 
    // 'isLoading' and 'errors' will inevitably reset to initial values on reload.
    pick: ['theme', 'user'] 
  }
)
```

### 3. Versioning

As your app evolves, your state shape might change. If a user has old state in local storage, loading it might crash your app.
Use `version` to invalidate old state.

```typescript
const store = createPersistedStore(
  reducer,
  initialState,
  'app:global',
  {
    version: 2 // Bump this when you change the state schema!
  }
)
```

**How it works:**
- The library stores a sidecar key: `app:global.__version__`.
- On load, if `storage.getItem('app:global.__version__')` does not match `2`:
    - The old state is wiped.
    - The store starts fresh with `initialState`.
    - The new version is saved.

## Low-Level API

If you need more control (e.g., persisting to `sessionStorage` or persisting an existing store), you can use the lower-level functions.

### `persistState`

Subscribes to an observable and writes to storage.

```typescript
import { persistState } from '@rxjs-spa/persist'

// Persist to Session Storage instead
persistState(store, 'my-session-key', { 
  storage: sessionStorage 
})
```

### `loadState`

Reads and parses state from storage.

```typescript
import { loadState } from '@rxjs-spa/persist'

const saved = loadState('my-key', { default: 'values' })
```

### `clearState`

Manually removes state and its version key.

```typescript
import { clearState } from '@rxjs-spa/persist'

clearState('app:global') // Removes 'app:global' and 'app:global.__version__'
```

## Step-by-Step implementation flow

1.  **Define State Interface**: clearly define what your state looks like.
2.  **Identify Persistent Fields**: Decide which fields should survive a reload (e.g., User preferences, Auth tokens) and which shouldn't (e.g., Modal open status, Loading spinners).
3.  **Choose a Key**: Pick a unique namespace for your key (e.g., `my-app:feature`).
4.  **Create Store**: Use `createPersistedStore` with the `pick` option.
5.  **Handle Schema Changes**: If you rename a field in your state interface, bump the `version` number in the config to prevent runtime errors for existing users.
