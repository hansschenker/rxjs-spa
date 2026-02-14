# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

`rxjs-spa` is an npm workspaces monorepo that is a full-featured SPA framework built entirely on **RxJS + TypeScript** — no third-party framework. It ships eight packages covering state management, HTTP, routing, DOM bindings, forms, persistence, error handling, and core utilities, plus a full-stack demo app and a VitePress docs site.

## Commands

**From the repo root:**
```bash
npm run dev          # Start all workspace dev servers
npm run build        # Build all workspaces
npm run test         # Run all tests in watch mode
npm run test:run     # Run all tests once (CI mode)
npm run docs:dev     # Start VitePress docs dev server
npm run docs:build   # Build docs
```

**Target a specific workspace:**
```bash
npm -w apps/demo run dev
npm -w apps/playground run dev
npm -w packages/store run test
npm -w packages/http run build
```

**Run a single test file:**
```bash
npx vitest run packages/store/src/public.test.ts
npx vitest run packages/router/src/public.test.ts
```

## Monorepo Layout

```
rxjs-spa/
  apps/
    demo/           Full-stack demo: 6 routes (incl. 404), MVU, HTTP, global + local stores
    playground/     Original quick-start playground (counter + todos)
  packages/
    core/           @rxjs-spa/core    — remember(), rememberWhileSubscribed()
    dom/            @rxjs-spa/dom     — DOM sources, sinks, component primitives
    errors/         @rxjs-spa/errors  — global error handling, catchAndReport, safeScan
    forms/          @rxjs-spa/forms   — reactive forms with schema validation
    http/           @rxjs-spa/http    — http client (rxjs/ajax), RemoteData, toRemoteData
    persist/        @rxjs-spa/persist — localStorage/sessionStorage persistence for stores
    router/         @rxjs-spa/router  — hash-based router, :param matching, withGuard
    store/          @rxjs-spa/store   — createStore (MVU), ofType, combineStores
    vitest.config.ts  Workspace-level Vitest multi-project runner
  docs/             VitePress documentation
```

## Package Exports Strategy

Each package uses conditional exports — TypeScript source in dev, compiled dist in production:
```json
"exports": {
  "development": "./src/index.ts",
  "default": "./dist/index.js"
}
```
App `vite.config.ts` files list local packages in `optimizeDeps.exclude` so Vite resolves them as source without pre-bundling.

## Architecture

### MVU Data Flow

```
dispatch(action)
    │
Subject<Action> → scan(reducer, initial) → startWith(initial) → shareReplay(1)
                                                                      │
                                                              state$ (Observable<S>)
                                                                      │
                                          ┌───────────────────────────┤
                                       select()                  DOM sinks
                                    (derived slices)         (text, attr, …)
```

Side-effects (HTTP, timers) are wired to `store.actions$`, not the reducer:
```
store.actions$.pipe(ofType('FETCH'), switchMap(() => http.get(…))).subscribe(store.dispatch)
```

### Package Responsibilities

**`@rxjs-spa/store`** (`packages/store/src/public.ts`)
- `createStore<S, A>(reducer, initial)` → `{ state$, actions$, dispatch, select, getState }`
- `ofType(...types)` — filters + narrows action stream (analogous to NgRx's ofType)
- `combineStores(a, b, project)` — derives from two stores via `combineLatest`

**`@rxjs-spa/http`** (`packages/http/src/public.ts`)
- `http.get/post/put/patch/delete` — default client; cold Observables via `rxjs/ajax`; unsubscribe cancels XHR
- `createHttpClient(config?)` → `HttpClient` — factory with `baseUrl` and `interceptors` support
- `HttpInterceptor` — `{ request?(config) → config, response?(source$) → source$ }`; request phase runs left-to-right, response phase right-to-left
- `RemoteData<T>` — `idle | loading | success | error` discriminated union
- `toRemoteData()` — operator that wraps any Observable into a `RemoteData<T>` stream

**`@rxjs-spa/router`** (`packages/router/src/public.ts`)
- `createRouter<N>(routes, options?)` → `{ route$, navigate, link, destroy }`
- `RouterOptions` — `{ mode?: 'hash' | 'history' }` (default: `'hash'`)
- Hash mode: `window.location.hash` + `hashchange` — URLs like `#/users/42`
- History mode: `history.pushState` + `popstate` — clean URLs like `/users/42`; auto-intercepts `<a>` clicks (same-origin, no modifier keys, no `target`/`download`); requires server fallback to `index.html`
- `:param` segment matching; `distinctUntilChanged` deduplicates same path+query
- `RouteMatch<N>` includes `name`, `params`, `query`, and `path`
- Query params: `?page=2&sort=name` → `{ query: { page: '2', sort: 'name' } }` — URI-decoded, emits on query-only changes
- Wildcard route: `'*': 'not-found'` — catch-all for unrecognised paths, always checked last
- `withGuard(protectedRoutes, guardFn, onDenied)` — route guard operator; async-capable via `Observable<boolean>`
- `destroy()` — removes global listeners (click interceptor, popstate); no-op in hash mode

**`@rxjs-spa/dom`** (`packages/dom/src/public.ts`, `events.ts`, `observe.ts`)
- Sources: `events`, `valueChanges`, `checkedChanges`, `textChanges`, `attrChanges`, `hasClass`
- Sinks: `text`, `html`, `attr`, `prop`, `style`, `classToggle`, `dispatch`
- `renderKeyedComponents` — per-item `BehaviorSubject` keeps internal streams alive across updates
- `mount(root, setup)` — runs setup once, returns unified `Subscription`

**`@rxjs-spa/core`** (`packages/core/src/public.ts`)
- `remember()` — `shareReplay({ bufferSize: 1, refCount: false })`
- `rememberWhileSubscribed()` — same but tears down when subscriber count hits zero

**`@rxjs-spa/errors`** (`packages/errors/src/public.ts`)
- `createErrorHandler(config?)` → `[ErrorHandler, Subscription]` — centralized error bus; captures `window.onerror` and `unhandledrejection`; exposes `errors$` stream and `reportError()` method
- `catchAndReport(handler, options?)` — drop-in `catchError` replacement that auto-reports to the handler; optional `fallback` value/Observable and `context` label
- `safeScan(reducer, initial, handler, options?)` — wraps `scan` with try/catch inside the accumulator; on reducer throw reports error and returns previous state (pipeline stays alive)
- `safeSubscribe(source$, handler, next, options?)` — subscribes with auto-wired error callback to prevent silent subscription deaths
- `createSafeStore(reducer, initial, handler, options?)` — drop-in `createStore` replacement using `safeScan` internally

**`@rxjs-spa/forms`** (`packages/forms/src/`)
- `createForm<S>(schema)` → `{ values$, errors$, touched$, valid$, submitting$, actions$, field(), setValue(), submit(), reset(), … }`
- `s.string()`, `s.number()`, `s.boolean()` — fluent schema builders with `.required()`, `.email()`, `.minLength()`, `.pattern()`, etc.
- `bindInput`, `bindCheckbox`, `bindSelect`, `bindError`, `bindField` — two-way DOM binders

**`@rxjs-spa/persist`** (`packages/persist/src/public.ts`)
- `createPersistedStore(reducer, initial, key, opts?)` — drop-in `createStore` with localStorage hydration + persistence
- `loadState`, `persistState`, `clearState` — lower-level persistence primitives
- Supports `pick` (partial persistence), `version` (wipe on mismatch), custom `Storage` backends

### Error Handling Pattern (apps/demo/src/error-handler.ts)
```typescript
const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) => console.error(`[${e.source}] ${e.message}`),
})

// In effects — replaces manual catchError:
store.actions$.pipe(
  ofType('FETCH'),
  switchMap(() =>
    http.get('/api/data').pipe(
      map(data => ({ type: 'SUCCESS' as const, data })),
      catchAndReport(errorHandler, {
        fallback: { type: 'ERROR' as const, error: 'Request failed' },
        context: 'myView/FETCH',
      }),
    ),
  ),
).subscribe(store.dispatch)
```

### Router Outlet Pattern (apps/demo/src/main.ts)
```typescript
let currentViewSub: Subscription | null = null

router.route$.subscribe(({ name, params }) => {
  currentViewSub?.unsubscribe()  // cancels HTTP, removes listeners
  outlet.innerHTML = ''
  switch (name) {
    case 'home':        currentViewSub = homeView(outlet, globalStore); break
    case 'users':       currentViewSub = usersView(outlet, globalStore, router); break
    case 'user-detail': currentViewSub = userDetailView(outlet, globalStore, router, params); break
  }
})
```

### View Convention (apps/demo/src/views/)
Each view is a function `(container, globalStore, …) => Subscription`. It:
1. Writes an HTML skeleton to `container.innerHTML`
2. Creates a local `createStore` for route-scoped state
3. Wires effects on `store.actions$`
4. Returns `mount(container, () => [sinks…])`

### Subscription Lifecycle
All subscriptions are explicit. HMR `import.meta.hot.dispose` calls `.unsubscribe()` on the top-level subscription to prevent leaks during development.

## Build Config
- Packages: Vite library mode (`es` + `cjs`), `rxjs` and `rxjs/ajax` always external
- TypeScript: ES2022 target, `moduleResolution: "Bundler"`, strict mode
- Test environments: `jsdom` for dom/router/http/errors/forms/persist/demo; `node` for core/store
- RxJS 7.8.2 pinned via root `package.json` `overrides`
