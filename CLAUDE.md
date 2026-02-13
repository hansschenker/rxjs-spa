# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

`rxjs-spa` is an npm workspaces monorepo that is a full-featured SPA framework built entirely on **RxJS + TypeScript** — no third-party framework. It ships five packages covering state management, HTTP, routing, DOM bindings, and core utilities, plus a full-stack demo app and a VitePress docs site.

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
    demo/           Full-stack demo: 3 routes, MVU, HTTP, global + local stores
    playground/     Original quick-start playground (counter + todos)
  packages/
    core/           @rxjs-spa/core   — remember(), rememberWhileSubscribed()
    dom/            @rxjs-spa/dom    — DOM sources, sinks, component primitives
    router/         @rxjs-spa/router — hash-based router, :param matching
    store/          @rxjs-spa/store  — createStore (MVU), ofType, combineStores
    http/           @rxjs-spa/http   — http client (rxjs/ajax), RemoteData, toRemoteData
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
- `http.get/post/put/patch/delete` — cold Observables via `rxjs/ajax`; unsubscribe cancels XHR
- `RemoteData<T>` — `idle | loading | success | error` discriminated union
- `toRemoteData()` — operator that wraps any Observable into a `RemoteData<T>` stream

**`@rxjs-spa/router`** (`packages/router/src/public.ts`)
- `createRouter<N>(routes)` → `{ route$, navigate, link }`
- Hash-based (`window.location.hash` + `fromEvent(window, 'hashchange')`)
- `:param` segment matching; `distinctUntilChanged` deduplicates same-path navigation

**`@rxjs-spa/dom`** (`packages/dom/src/public.ts`, `events.ts`, `observe.ts`)
- Sources: `events`, `valueChanges`, `checkedChanges`, `textChanges`, `attrChanges`, `hasClass`
- Sinks: `text`, `html`, `attr`, `prop`, `style`, `classToggle`, `dispatch`
- `renderKeyedComponents` — per-item `BehaviorSubject` keeps internal streams alive across updates
- `mount(root, setup)` — runs setup once, returns unified `Subscription`

**`@rxjs-spa/core`** (`packages/core/src/public.ts`)
- `remember()` — `shareReplay({ bufferSize: 1, refCount: false })`
- `rememberWhileSubscribed()` — same but tears down when subscriber count hits zero

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
- Test environments: `jsdom` for dom/router/http/demo; `node` for core/store
- RxJS 7.8.2 pinned via root `package.json` `overrides`
