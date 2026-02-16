import { Store } from '@rxjs-spa/store'
import { tap } from 'rxjs/operators'

/**
 * Creates a console logger for the store.
 * 
 * @param store The store instance to log.
 * @param name Optional name for the store (e.g. 'Global').
 */
export function createLogger<S, A extends { type: string }>(
    store: Store<S, A>,
    name = 'Store',
) {
    // Log Actions
    store.actions$.subscribe((action) => {
        console.groupCollapsed(`%cReflu%c ${name}: ${action.type}`, 'color: #4CAF50; font-weight: bold;', 'color: inherit;')
        console.log('%cAction:', 'color: #03A9F4; font-weight: bold;', action)
        console.groupEnd()
    })

    // Log State Changes (Debounced/Sampled via normal subscription)
    // We can't know *which* action caused the state change easily without a middleware pipeline
    // that couples them, but we can log the new state.
    store.state$.pipe(
        tap(state => {
            // Intentionally not grouping here to avoid spamming groups if state updates frequently
            // or maybe we just want to see the latest state.
            // Actually, let's just log it quietly.
            // console.log(`%c[${name}] State:`, 'color: #9E9E9E;', state) 
        })
    ).subscribe()

        // Expose to window for debugging
        ; (window as any)[`store_${name}`] = store
    console.log(`[DevTools] ${name} store exposed as window.store_${name}`)
}
