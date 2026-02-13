import { Observable, Subscription } from 'rxjs'
import { createStore } from '@rxjs-spa/store'
import type { Reducer, Store } from '@rxjs-spa/store'

// ---------------------------------------------------------------------------
// PersistOptions
// ---------------------------------------------------------------------------

export interface PersistOptions<S> {
  /** Only persist these keys. Defaults to all keys. */
  pick?: Array<keyof S>
  /** Storage backend. Defaults to `localStorage`. */
  storage?: Storage
  /**
   * Schema version. If the stored version doesn't match, the stored state is
   * wiped and the store starts fresh from `initialState`. Bump this whenever
   * the persisted shape changes in a breaking way. Defaults to `1`.
   */
  version?: number
}

// ---------------------------------------------------------------------------
// loadState
// ---------------------------------------------------------------------------

/**
 * loadState(key, defaultState, options?)
 *
 * Reads JSON from storage and shallow-merges it with `defaultState`.
 * Any key present in storage wins; missing keys fall back to `defaultState`.
 * Handles corrupt JSON gracefully by returning `defaultState`.
 *
 * @example
 *   const state = loadState('app:ui', { theme: 'light', count: 0 })
 *   // → { theme: 'dark', count: 0 }  (if only theme was persisted)
 */
export function loadState<S>(
  key: string,
  defaultState: S,
  opts?: PersistOptions<S>,
): S {
  const storage = opts?.storage ?? localStorage
  try {
    const raw = storage.getItem(key)
    if (!raw) return defaultState
    const saved = JSON.parse(raw) as Partial<S>
    return { ...defaultState, ...saved }
  } catch {
    return defaultState
  }
}

// ---------------------------------------------------------------------------
// persistState
// ---------------------------------------------------------------------------

/**
 * persistState(source, key, options?)
 *
 * Subscribes to `source.state$` and writes JSON to storage on every emission.
 * If `options.pick` is provided, only those keys are saved.
 * Returns a `Subscription` — unsubscribe to stop persisting.
 *
 * @example
 *   const sub = persistState(store, 'app:ui', { pick: ['theme'] })
 *   // later:
 *   sub.unsubscribe()
 */
export function persistState<S>(
  source: { state$: Observable<S> },
  key: string,
  opts?: PersistOptions<S>,
): Subscription {
  const storage = opts?.storage ?? localStorage
  const pick = opts?.pick

  return source.state$.subscribe((state) => {
    const toSave = pick
      ? (Object.fromEntries(pick.map((k) => [k, state[k]])) as Partial<S>)
      : state
    storage.setItem(key, JSON.stringify(toSave))
  })
}

// ---------------------------------------------------------------------------
// clearState
// ---------------------------------------------------------------------------

/**
 * clearState(key, storage?)
 *
 * Removes both the state entry and its version key from storage.
 */
export function clearState(key: string, storage: Storage = localStorage): void {
  storage.removeItem(key)
  storage.removeItem(`${key}.__version__`)
}

// ---------------------------------------------------------------------------
// createPersistedStore
// ---------------------------------------------------------------------------

/**
 * createPersistedStore<S, A>(reducer, initialState, key, options?)
 *
 * Drop-in replacement for `createStore` that automatically:
 *   1. Checks the version key — wipes storage if it doesn't match `options.version`
 *   2. Hydrates from storage (shallow-merge with `initialState`)
 *   3. Creates the store with the hydrated state
 *   4. Writes back to storage on every state change
 *
 * Returns the same `Store<S, A>` interface as `createStore` — fully transparent.
 *
 * @example
 *   const store = createPersistedStore(reducer, { theme: 'light' }, 'app:ui', {
 *     pick: ['theme'],
 *     version: 1,
 *   })
 */
export function createPersistedStore<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
  key: string,
  opts?: PersistOptions<S>,
): Store<S, A> {
  const storage = opts?.storage ?? localStorage
  const version = opts?.version ?? 1
  const versionKey = `${key}.__version__`

  // Wipe on version mismatch so stale/incompatible state doesn't break the app
  if (storage.getItem(versionKey) !== String(version)) {
    storage.removeItem(key)
    storage.setItem(versionKey, String(version))
  }

  const hydratedState = loadState(key, initialState, opts)
  const store = createStore<S, A>(reducer, hydratedState)

  // Fire-and-forget — store lives for the app's lifetime
  persistState(store, key, opts)

  return store
}
