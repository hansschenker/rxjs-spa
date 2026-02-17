import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
// ---------------------------------------------------------------------------
// collectFrom — reduce test boilerplate for Observable assertions
// ---------------------------------------------------------------------------
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
export function collectFrom(obs$) {
    const values = [];
    const subscription = obs$.subscribe((v) => values.push(v));
    return { values, subscription };
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
export function createMockStore(initialState) {
    const stateBs = new BehaviorSubject(initialState);
    const actionsSubject = new Subject();
    const dispatchedActions = [];
    const state$ = stateBs.pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return {
        state$,
        actions$: actionsSubject.asObservable(),
        dispatch(action) {
            dispatchedActions.push(action);
            actionsSubject.next(action);
        },
        select(selector) {
            return state$.pipe(map(selector), distinctUntilChanged());
        },
        getState() {
            return stateBs.value;
        },
        setState(state) {
            stateBs.next(state);
        },
        dispatchedActions,
    };
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
export function createMockRouter(initialRoute) {
    const routeSubject = new BehaviorSubject(initialRoute ?? null);
    const navigatedTo = [];
    const route$ = routeSubject.pipe(
    // Filter out the null initial value when no initialRoute is provided
    map((r) => r), shareReplay({ bufferSize: 1, refCount: false }));
    return {
        route$: initialRoute
            ? route$
            : routeSubject.pipe(map((r) => r), shareReplay({ bufferSize: 1, refCount: false })),
        navigate(path) {
            navigatedTo.push(path);
        },
        link(path) {
            return path.startsWith('/') ? path : '/' + path;
        },
        destroy() { },
        emit(route) {
            routeSubject.next(route);
        },
        navigatedTo,
    };
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
export function createMockHttpClient() {
    const responses = new Map();
    const calls = [];
    function makeKey(method, url) {
        return `${method}:${url}`;
    }
    function configureMock(method, url) {
        return {
            respond(data) {
                responses.set(makeKey(method, url), of(data));
            },
            respondWith(obs$) {
                responses.set(makeKey(method, url), obs$);
            },
        };
    }
    function doRequest(method, url, body) {
        calls.push({ method, url, ...(body !== undefined ? { body } : {}) });
        const key = makeKey(method, url);
        const response = responses.get(key);
        if (!response) {
            return throwError(() => new Error(`No mock configured for ${method} ${url}`));
        }
        return response;
    }
    return {
        calls,
        get(url) {
            return doRequest('GET', url);
        },
        post(url, body) {
            return doRequest('POST', url, body);
        },
        put(url, body) {
            return doRequest('PUT', url, body);
        },
        patch(url, body) {
            return doRequest('PATCH', url, body);
        },
        delete(url) {
            return doRequest('DELETE', url);
        },
        whenGet(url) { return configureMock('GET', url); },
        whenPost(url) { return configureMock('POST', url); },
        whenPut(url) { return configureMock('PUT', url); },
        whenPatch(url) { return configureMock('PATCH', url); },
        whenDelete(url) { return configureMock('DELETE', url); },
    };
}
// ---------------------------------------------------------------------------
// triggerHashChange — promote from router test helper
// ---------------------------------------------------------------------------
/**
 * triggerHashChange(path)
 *
 * Sets `window.location.hash` and dispatches a `hashchange` event.
 * Needed in jsdom because setting `location.hash` doesn't fire real events.
 *
 * @example
 *   triggerHashChange('#/users')
 */
export function triggerHashChange(path) {
    window.location.hash = path;
    window.dispatchEvent(new Event('hashchange'));
}
