import { BehaviorSubject, combineLatest, Subject, } from 'rxjs';
import { distinctUntilChanged, filter, map, scan, shareReplay, startWith } from 'rxjs/operators';
// ---------------------------------------------------------------------------
// createStore
// ---------------------------------------------------------------------------
/**
 * createStore<S, A>(reducer, initialState)
 *
 * MVU-style store built on RxJS:
 *
 *   Subject<A>  →  scan(reducer, initial)  →  startWith(initial)  →  shareReplay(1)
 *                        ↑                                                 ↓
 *                   dispatch(action)                               state$ / select()
 *
 * The `actions$` stream lets you wire side-effects (HTTP, timers, routing)
 * without polluting the pure reducer — analogous to NgRx Effects.
 *
 * @example
 *   type State = { count: number }
 *   type Action = { type: 'INC' } | { type: 'DEC' } | { type: 'RESET' }
 *
 *   const store = createStore<State, Action>(
 *     (s, a) => {
 *       switch (a.type) {
 *         case 'INC':   return { count: s.count + 1 }
 *         case 'DEC':   return { count: s.count - 1 }
 *         case 'RESET': return { count: 0 }
 *       }
 *     },
 *     { count: 0 },
 *   )
 *
 *   store.select(s => s.count).subscribe(n => console.log('count:', n))
 *   store.dispatch({ type: 'INC' })
 */
export function createStore(reducer, initialState) {
    const actionsSubject = new Subject();
    // Synchronous snapshot — kept in sync by subscribing to state$
    const stateBs = new BehaviorSubject(initialState);
    const actions$ = actionsSubject.asObservable();
    // Core MVU pipeline:
    //   actions → reduce → startWith(initial) → multicast + replay latest
    const state$ = actionsSubject.pipe(scan(reducer, initialState), startWith(initialState), shareReplay({ bufferSize: 1, refCount: false }));
    // Keep the synchronous snapshot up-to-date
    state$.subscribe((s) => stateBs.next(s));
    return {
        state$,
        actions$,
        dispatch(action) {
            actionsSubject.next(action);
        },
        select(selector) {
            return state$.pipe(map(selector), distinctUntilChanged());
        },
        getState() {
            return stateBs.value;
        },
    };
}
// ---------------------------------------------------------------------------
// ofType — filter actions by their `type` property
// ---------------------------------------------------------------------------
/**
 * ofType(...types)
 *
 * Filters an action stream to only those whose `type` is in the provided list,
 * narrowing the TypeScript type automatically.
 *
 * @example
 *   store.actions$.pipe(
 *     ofType('LOAD_USERS', 'REFRESH'),
 *     switchMap(() => http.get<User[]>(API)),
 *   )
 */
export function ofType(...types) {
    return filter((action) => types.includes(action.type));
}
// ---------------------------------------------------------------------------
// combineStores
// ---------------------------------------------------------------------------
/**
 * combineStores(storeA, storeB, project)
 *
 * Derives a new Observable by combining the latest state of two stores.
 *
 * @example
 *   const vm$ = combineStores(authStore, uiStore, (auth, ui) => ({
 *     username: auth.user?.name,
 *     theme: ui.theme,
 *   }))
 */
export function combineStores(storeA, storeB, project) {
    return combineLatest([storeA.state$, storeB.state$]).pipe(map(([sa, sb]) => project(sa, sb)));
}
