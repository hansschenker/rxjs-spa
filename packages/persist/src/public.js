import { createStore } from '@rxjs-spa/store';
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
export function loadState(key, defaultState, opts) {
    const storage = opts?.storage ?? localStorage;
    try {
        const raw = storage.getItem(key);
        if (!raw)
            return defaultState;
        const saved = JSON.parse(raw);
        return { ...defaultState, ...saved };
    }
    catch {
        return defaultState;
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
export function persistState(source, key, opts) {
    const storage = opts?.storage ?? localStorage;
    const pick = opts?.pick;
    return source.state$.subscribe((state) => {
        const toSave = pick
            ? Object.fromEntries(pick.map((k) => [k, state[k]]))
            : state;
        storage.setItem(key, JSON.stringify(toSave));
    });
}
// ---------------------------------------------------------------------------
// clearState
// ---------------------------------------------------------------------------
/**
 * clearState(key, storage?)
 *
 * Removes both the state entry and its version key from storage.
 */
export function clearState(key, storage = localStorage) {
    storage.removeItem(key);
    storage.removeItem(`${key}.__version__`);
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
export function createPersistedStore(reducer, initialState, key, opts) {
    const storage = opts?.storage ?? localStorage;
    const version = opts?.version ?? 1;
    const versionKey = `${key}.__version__`;
    // Wipe on version mismatch so stale/incompatible state doesn't break the app
    if (storage.getItem(versionKey) !== String(version)) {
        storage.removeItem(key);
        storage.setItem(versionKey, String(version));
    }
    const hydratedState = loadState(key, initialState, opts);
    const store = createStore(reducer, hydratedState);
    // Fire-and-forget — store lives for the app's lifetime
    persistState(store, key, opts);
    return store;
}
