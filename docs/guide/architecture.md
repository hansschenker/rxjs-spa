# Architecture

rxjs-spa is a pure RxJS + TypeScript SPA framework. No virtual DOM, no component class hierarchy — just streams, reducers, and explicit subscriptions.

## Five pillars

| Package | Responsibility |
|---------|---------------|
| `@rxjs-spa/core`   | Multicasting helpers (`remember`, `rememberWhileSubscribed`) |
| `@rxjs-spa/dom`    | DOM sources (events, valueChanges…) and sinks (text, attr…) |
| `@rxjs-spa/store`  | MVU state management (`createStore`, `ofType`) |
| `@rxjs-spa/http`   | HTTP client (`http.get/post/…`, `toRemoteData`, `RemoteData`) |
| `@rxjs-spa/router` | Hash-based client router (`createRouter`, `:param` matching) |

## MVU data flow

```
User Event
    │
    ▼
dispatch(action)
    │
    ▼
Subject<Action> ──→ scan(reducer, initial) ──→ startWith(initial) ──→ shareReplay(1)
                                                                           │
                                                              state$ (Observable<State>)
                                                                           │
                                                     ┌────────────────────┤
                                                     │                    │
                                                  select()             DOM sinks
                                               (derived slices)    (text, attr, …)
```

Side-effects (HTTP, timers) are driven by `store.actions$`:

```
actions$ ──→ ofType('FETCH') ──→ switchMap(() => http.get(…)) ──→ dispatch(result)
```

## Route-scoped MVU slices

Each view owns a **local store** that is created when the view mounts and implicitly garbage-collected (subscriptions cancelled) when the router swaps to another view.

The **global store** (`globalStore`) is created once at app startup and shared via dependency injection (passed as a plain argument).

```
main.ts
  ├── globalStore (singleton)
  ├── router.route$ ──→ teardown previous view ──→ mount new view
  │
  ├── homeView(outlet, globalStore)
  │     └── local createStore(homeReducer, …)
  ├── usersView(outlet, globalStore, router)
  │     └── local createStore(usersReducer, …)
  │           └── effect: FETCH → http.get → FETCH_SUCCESS
  └── userDetailView(outlet, globalStore, router, params)
        └── local createStore(userDetailReducer, …)
              └── effect: FETCH → combineLatest([user$, posts$]) → FETCH_SUCCESS
```

## Subscription lifecycle

Every view returns a `Subscription`. The router outlet calls `.unsubscribe()` on the
outgoing view before mounting the next one, which:

- Cancels any in-flight XHRs (via RxJS cancellation)
- Removes all DOM event listeners (cold Observables clean up on unsubscribe)
- Completes per-item `BehaviorSubject`s in `renderKeyedComponents`
