import { Observable, OperatorFunction } from 'rxjs';
export type Reducer<S, A> = (state: S, action: A) => S;
export interface Store<S, A> {
    /** Multicasted state stream. Replays the latest value to late subscribers. */
    state$: Observable<S>;
    /**
     * Stream of every action that was dispatched.
     * Use this to implement side-effects (effects) without putting them in the reducer.
     *
     * @example
     *   store.actions$.pipe(
     *     ofType('LOAD_USERS'),
     *     switchMap(() => http.get<User[]>(API).pipe(
     *       map(users => ({ type: 'LOAD_SUCCESS' as const, users })),
     *       catchError(err => of({ type: 'LOAD_ERROR' as const, error: String(err.message) })),
     *     )),
     *   ).subscribe(action => store.dispatch(action))
     */
    actions$: Observable<A>;
    /** Send an action through the reducer to update state. */
    dispatch(action: A): void;
    /**
     * Derive a slice of state. Emits only when the selected value changes
     * (strict equality check).
     */
    select<T>(selector: (state: S) => T): Observable<T>;
    /** Synchronous snapshot of the current state. */
    getState(): S;
}
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
export declare function createStore<S, A>(reducer: Reducer<S, A>, initialState: S): Store<S, A>;
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
export declare function ofType<A extends {
    type: string;
}, K extends A['type']>(...types: [K, ...K[]]): OperatorFunction<A, Extract<A, {
    type: K;
}>>;
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
export declare function combineStores<A, B, R>(storeA: Store<A, unknown>, storeB: Store<B, unknown>, project: (a: A, b: B) => R): Observable<R>;
