import { Observable, Subscription } from 'rxjs';
/**
 * collectFrom(obs$)
 *
 * Subscribes to an Observable and collects all emitted values into an array.
 * Call `.subscription.unsubscribe()` when done.
 *
 * @example
 *   const result = collectFrom(store.select(s => s.count))
 *   store.dispatch({ type: 'INC' })
 *   expect(result.values).toEqual([0, 1])
 *   result.subscription.unsubscribe()
 */
export declare function collectFrom<T>(obs$: Observable<T>): {
    values: T[];
    subscription: Subscription;
};
/**
 * Store interface (mirrors @rxjs-spa/store's Store<S, A>).
 * Duplicated here to avoid a package dependency.
 */
interface Store<S, A> {
    state$: Observable<S>;
    actions$: Observable<A>;
    dispatch(action: A): void;
    select<T>(selector: (state: S) => T): Observable<T>;
    getState(): S;
}
export interface MockStore<S, A> extends Store<S, A> {
    /** Drive state$ directly without dispatching an action. */
    setState(state: S): void;
    /** Array of every action passed to dispatch(), in order. */
    dispatchedActions: A[];
}
/**
 * createMockStore(initialState)
 *
 * Creates a mock store that satisfies the Store<S, A> interface.
 * Use `setState()` to drive state changes directly, and inspect
 * `dispatchedActions` to assert what was dispatched.
 *
 * @example
 *   const store = createMockStore<MyState, MyAction>({ count: 0 })
 *   store.setState({ count: 5 })
 *   store.dispatch({ type: 'INC' })
 *   expect(store.dispatchedActions).toEqual([{ type: 'INC' }])
 *   expect(store.getState().count).toBe(5)
 */
export declare function createMockStore<S, A>(initialState: S): MockStore<S, A>;
interface RouteMatch<N extends string = string> {
    name: N;
    params: Record<string, string>;
    query: Record<string, string>;
    path: string;
    matched: Array<{
        name: N;
        params: Record<string, string>;
        path: string;
    }>;
}
interface Router<N extends string> {
    route$: Observable<RouteMatch<N>>;
    navigate(path: string): void;
    link(path: string): string;
    destroy(): void;
}
export interface MockRouter<N extends string> extends Router<N> {
    /** Push a route change into `route$`. */
    emit(route: RouteMatch<N>): void;
    /** Array of every path passed to navigate(), in order. */
    navigatedTo: string[];
}
/**
 * createMockRouter(initialRoute?)
 *
 * Creates a mock router that satisfies the Router<N> interface.
 * Use `emit()` to push route changes, and inspect `navigatedTo`
 * to assert what was navigated to.
 *
 * @example
 *   const router = createMockRouter<'home' | 'users'>({
 *     name: 'home', params: {}, query: {}, path: '/',
 *   })
 *   router.emit({ name: 'users', params: {}, query: {}, path: '/users' })
 *   router.navigate('/users/42')
 *   expect(router.navigatedTo).toEqual(['/users/42'])
 */
export declare function createMockRouter<N extends string>(initialRoute?: RouteMatch<N>): MockRouter<N>;
interface HttpClient {
    get<T>(url: string, options?: unknown): Observable<T>;
    post<T>(url: string, body?: unknown, options?: unknown): Observable<T>;
    put<T>(url: string, body?: unknown, options?: unknown): Observable<T>;
    patch<T>(url: string, body?: unknown, options?: unknown): Observable<T>;
    delete<T>(url: string, options?: unknown): Observable<T>;
}
export interface MockCall {
    method: string;
    url: string;
    body?: unknown;
}
export interface MockResponse {
    respond<T>(data: T): void;
    respondWith<T>(obs$: Observable<T>): void;
}
export interface MockHttpClient extends HttpClient {
    /** Array of every request made, in order. */
    calls: MockCall[];
    whenGet(url: string): MockResponse;
    whenPost(url: string): MockResponse;
    whenPut(url: string): MockResponse;
    whenPatch(url: string): MockResponse;
    whenDelete(url: string): MockResponse;
}
/**
 * createMockHttpClient()
 *
 * Creates a mock HTTP client that satisfies the HttpClient interface.
 * Configure responses with `when*()`, and inspect `calls` to assert
 * what was requested.
 *
 * @example
 *   const http = createMockHttpClient()
 *   http.whenGet('/api/users').respond([{ id: 1, name: 'Alice' }])
 *
 *   http.get('/api/users').subscribe(users => {
 *     expect(users).toEqual([{ id: 1, name: 'Alice' }])
 *   })
 *   expect(http.calls).toEqual([{ method: 'GET', url: '/api/users' }])
 */
export declare function createMockHttpClient(): MockHttpClient;
/**
 * triggerHashChange(path)
 *
 * Sets `window.location.hash` and dispatches a `hashchange` event.
 * Needed in jsdom because setting `location.hash` doesn't fire real events.
 *
 * @example
 *   triggerHashChange('#/users')
 */
export declare function triggerHashChange(path: string): void;
export {};
