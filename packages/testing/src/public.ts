import { BehaviorSubject, Observable, of, Subject, Subscription, throwError } from 'rxjs'
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators'

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
export function collectFrom<T>(obs$: Observable<T>): {
  values: T[]
  subscription: Subscription
} {
  const values: T[] = []
  const subscription = obs$.subscribe((v) => values.push(v))
  return { values, subscription }
}

// ---------------------------------------------------------------------------
// MockStore — drop-in replacement for Store<S, A>
// ---------------------------------------------------------------------------

/**
 * Store interface (mirrors @rxjs-spa/store's Store<S, A>).
 * Duplicated here to avoid a package dependency.
 */
interface Store<S, A> {
  state$: Observable<S>
  actions$: Observable<A>
  dispatch(action: A): void
  select<T>(selector: (state: S) => T): Observable<T>
  getState(): S
}

export interface MockStore<S, A> extends Store<S, A> {
  /** Drive state$ directly without dispatching an action. */
  setState(state: S): void
  /** Array of every action passed to dispatch(), in order. */
  dispatchedActions: A[]
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
export function createMockStore<S, A>(initialState: S): MockStore<S, A> {
  const stateBs = new BehaviorSubject<S>(initialState)
  const actionsSubject = new Subject<A>()
  const dispatchedActions: A[] = []

  const state$ = stateBs.pipe(
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  return {
    state$,
    actions$: actionsSubject.asObservable(),
    dispatch(action: A) {
      dispatchedActions.push(action)
      actionsSubject.next(action)
    },
    select<T>(selector: (state: S) => T): Observable<T> {
      return state$.pipe(map(selector), distinctUntilChanged())
    },
    getState(): S {
      return stateBs.value
    },
    setState(state: S) {
      stateBs.next(state)
    },
    dispatchedActions,
  }
}

// ---------------------------------------------------------------------------
// MockRouter — drop-in replacement for Router<N>
// ---------------------------------------------------------------------------

interface RouteMatch<N extends string = string> {
  name: N
  params: Record<string, string>
  query: Record<string, string>
  path: string
}

interface Router<N extends string> {
  route$: Observable<RouteMatch<N>>
  navigate(path: string): void
  link(path: string): string
  destroy(): void
}

export interface MockRouter<N extends string> extends Router<N> {
  /** Push a route change into `route$`. */
  emit(route: RouteMatch<N>): void
  /** Array of every path passed to navigate(), in order. */
  navigatedTo: string[]
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
export function createMockRouter<N extends string>(
  initialRoute?: RouteMatch<N>,
): MockRouter<N> {
  const routeSubject = new BehaviorSubject<RouteMatch<N> | null>(
    initialRoute ?? null,
  )
  const navigatedTo: string[] = []

  const route$ = routeSubject.pipe(
    // Filter out the null initial value when no initialRoute is provided
    map((r) => r as RouteMatch<N>),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  return {
    route$: initialRoute
      ? route$
      : (routeSubject.pipe(
          map((r) => r!),
          shareReplay({ bufferSize: 1, refCount: false }),
        ) as Observable<RouteMatch<N>>),
    navigate(path: string) {
      navigatedTo.push(path)
    },
    link(path: string): string {
      return path.startsWith('/') ? path : '/' + path
    },
    destroy() {},
    emit(route: RouteMatch<N>) {
      routeSubject.next(route)
    },
    navigatedTo,
  }
}

// ---------------------------------------------------------------------------
// MockHttpClient — drop-in replacement for HttpClient
// ---------------------------------------------------------------------------

interface HttpClient {
  get<T>(url: string, options?: unknown): Observable<T>
  post<T>(url: string, body?: unknown, options?: unknown): Observable<T>
  put<T>(url: string, body?: unknown, options?: unknown): Observable<T>
  patch<T>(url: string, body?: unknown, options?: unknown): Observable<T>
  delete<T>(url: string, options?: unknown): Observable<T>
}

export interface MockCall {
  method: string
  url: string
  body?: unknown
}

export interface MockResponse {
  respond<T>(data: T): void
  respondWith<T>(obs$: Observable<T>): void
}

export interface MockHttpClient extends HttpClient {
  /** Array of every request made, in order. */
  calls: MockCall[]
  whenGet(url: string): MockResponse
  whenPost(url: string): MockResponse
  whenPut(url: string): MockResponse
  whenPatch(url: string): MockResponse
  whenDelete(url: string): MockResponse
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
export function createMockHttpClient(): MockHttpClient {
  const responses = new Map<string, Observable<unknown>>()
  const calls: MockCall[] = []

  function makeKey(method: string, url: string): string {
    return `${method}:${url}`
  }

  function configureMock(method: string, url: string): MockResponse {
    return {
      respond<T>(data: T) {
        responses.set(makeKey(method, url), of(data))
      },
      respondWith<T>(obs$: Observable<T>) {
        responses.set(makeKey(method, url), obs$)
      },
    }
  }

  function doRequest<T>(method: string, url: string, body?: unknown): Observable<T> {
    calls.push({ method, url, ...(body !== undefined ? { body } : {}) })
    const key = makeKey(method, url)
    const response = responses.get(key)
    if (!response) {
      return throwError(() => new Error(`No mock configured for ${method} ${url}`))
    }
    return response as Observable<T>
  }

  return {
    calls,
    get<T>(url: string) {
      return doRequest<T>('GET', url)
    },
    post<T>(url: string, body?: unknown) {
      return doRequest<T>('POST', url, body)
    },
    put<T>(url: string, body?: unknown) {
      return doRequest<T>('PUT', url, body)
    },
    patch<T>(url: string, body?: unknown) {
      return doRequest<T>('PATCH', url, body)
    },
    delete<T>(url: string) {
      return doRequest<T>('DELETE', url)
    },
    whenGet(url: string) { return configureMock('GET', url) },
    whenPost(url: string) { return configureMock('POST', url) },
    whenPut(url: string) { return configureMock('PUT', url) },
    whenPatch(url: string) { return configureMock('PATCH', url) },
    whenDelete(url: string) { return configureMock('DELETE', url) },
  }
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
export function triggerHashChange(path: string): void {
  window.location.hash = path
  window.dispatchEvent(new Event('hashchange'))
}
