# rxjs-spa — In-Depth Feature Explanations

This document walks through every feature of the **rxjs-spa** monorepo step by step.  
`rxjs-spa` is a complete SPA framework built entirely on **RxJS + TypeScript** — no React, Angular, or Vue. It ships nine library packages, a full demo app, and starter templates, all wired together with npm workspaces.

---

## Table of Contents

1. [Architecture Overview — Model-View-Update (MVU)](#1-architecture-overview--model-view-update-mvu)
2. [@rxjs-spa/store — State Management](#2-rxjs-spastore--state-management)
3. [@rxjs-spa/router — Client-Side Routing](#3-rxjs-sparouter--client-side-routing)
4. [@rxjs-spa/dom — Reactive DOM Bindings](#4-rxjs-spadom--reactive-dom-bindings)
5. [@rxjs-spa/http — Observable HTTP Client](#5-rxjs-spahttp--observable-http-client)
6. [@rxjs-spa/forms — Schema-Driven Reactive Forms](#6-rxjs-spaforms--schema-driven-reactive-forms)
7. [@rxjs-spa/errors — Centralized Error Handling](#7-rxjs-spaerrors--centralized-error-handling)
8. [@rxjs-spa/persist — State Persistence](#8-rxjs-spapersist--state-persistence)
9. [@rxjs-spa/core — Shared Operators](#9-rxjs-spacore--shared-operators)
10. [@rxjs-spa/testing — Test Utilities](#10-rxjs-spatesting--test-utilities)
11. [Demo App — Putting It All Together](#11-demo-app--putting-it-all-together)
12. [Build & Development Infrastructure](#12-build--development-infrastructure)

---

## 1. Architecture Overview — Model-View-Update (MVU)

rxjs-spa follows the **Model-View-Update** (MVU) architecture, also known as the Elm Architecture. Every piece of state flows through a unidirectional data loop:

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

### How It Works — Step by Step

1. **Actions** are plain objects with a `type` discriminant (e.g. `{ type: 'INC' }`). They describe *what happened*.
2. **dispatch(action)** pushes the action into an internal RxJS `Subject<A>`.
3. The `Subject` feeds into RxJS's `scan` operator, which works exactly like `Array.reduce` — it applies a **reducer** function `(state, action) => newState` to produce the next state.
4. `startWith(initialState)` ensures subscribers immediately receive the initial state before any action is dispatched.
5. `shareReplay({ bufferSize: 1, refCount: false })` multicasts the state stream so every subscriber gets the same values, and late subscribers always receive the latest state.
6. **Side effects** (HTTP calls, timers, routing) are wired separately through `store.actions$` — they listen for specific action types and dispatch result actions back. This keeps the reducer pure.
7. **Views** subscribe to `state$` (or slices via `select()`) and write values to the DOM using **sinks** like `text(el)(value$)`.

This design gives you:
- **Predictable state transitions** — all state changes flow through one reducer
- **Time-travel debugging** — every action is logged and replayable
- **Separation of concerns** — side effects live outside the reducer
- **Testability** — reducers are pure functions, effects are independently testable

---

## 2. @rxjs-spa/store — State Management

**Package:** `packages/store/src/public.ts`

### 2.1 `createStore<S, A>(reducer, initialState)`

The core factory. Creates a store that manages state through a reducer function.

**What it returns:**

| Property | Type | Description |
|----------|------|-------------|
| `state$` | `Observable<S>` | Multicasted state stream. Replays latest value to late subscribers. |
| `actions$` | `Observable<A>` | Stream of every dispatched action. Used for side effects. |
| `dispatch(action)` | `(A) => void` | Pushes an action through the reducer. |
| `select(selector)` | `(S => T) => Observable<T>` | Derives a slice of state. Only emits when the slice changes (`distinctUntilChanged`). |
| `getState()` | `() => S` | Synchronous snapshot of current state (backed by an internal `BehaviorSubject`). |

**Step-by-step internals:**

1. A `Subject<A>` is created as the action bus.
2. A `BehaviorSubject<S>` holds the synchronous snapshot.
3. The core pipeline is built: `subject.pipe(scan(reducer, initial), startWith(initial), shareReplay(1))`.
4. The `BehaviorSubject` subscribes to `state$` so `getState()` always returns the latest value synchronously.
5. `dispatch()` simply calls `subject.next(action)`.
6. `select()` pipes `state$` through `map(selector)` and `distinctUntilChanged()` — only emitting when the selected value actually changes by strict equality.

**Example:**

```typescript
type State = { count: number }
type Action = { type: 'INC' } | { type: 'DEC' } | { type: 'RESET' }

const store = createStore<State, Action>(
  (s, a) => {
    switch (a.type) {
      case 'INC':   return { count: s.count + 1 }
      case 'DEC':   return { count: s.count - 1 }
      case 'RESET': return { count: 0 }
    }
  },
  { count: 0 },
)

store.select(s => s.count).subscribe(n => console.log('count:', n))
store.dispatch({ type: 'INC' })  // logs: count: 1
```

### 2.2 `ofType(...types)` — Action Filtering

An RxJS operator that filters an action stream by the `type` property and **narrows the TypeScript type** automatically. This is the mechanism for wiring side effects:

```typescript
store.actions$.pipe(
  ofType('LOAD_USERS'),                              // narrows A to { type: 'LOAD_USERS' }
  switchMap(() => http.get<User[]>('/api/users').pipe(
    map(users => ({ type: 'LOAD_SUCCESS' as const, users })),
    catchError(err => of({ type: 'LOAD_ERROR' as const, error: String(err) })),
  )),
).subscribe(store.dispatch)
```

**How it works:** Uses `filter()` with a type predicate — `(types as K[]).includes(action.type as K)` — so TypeScript narrows the downstream type to only matching action variants.

### 2.3 `combineStores(storeA, storeB, project)` — Store Composition

Derives a new `Observable` from the latest state of two stores using `combineLatest`:

```typescript
const vm$ = combineStores(authStore, uiStore, (auth, ui) => ({
  username: auth.user?.name,
  theme: ui.theme,
}))
```

This is useful for creating view models that depend on multiple stores. The projection function runs whenever either store's state changes, and `distinctUntilChanged()` deduplicates the output.

---

## 3. @rxjs-spa/router — Client-Side Routing

**Package:** `packages/router/src/public.ts`

### 3.1 `createRouter(routes, options?)` — Router Creation

Creates a client-side router. Supports two navigation modes and two route definition formats.

**Route Definition — Flat Format:**

```typescript
const router = createRouter({
  '/':           'home',
  '/users':      'users',
  '/users/:id':  'user-detail',
  '*':           'not-found',     // wildcard catch-all
})
```

**Route Definition — Nested Format (Tree-Based):**

```typescript
const router = createRouter([
  { path: '/', name: 'home' },
  { path: '/users', name: 'users-layout', children: [
    { path: '', name: 'users-list' },       // index route
    { path: ':id', name: 'user-detail' },
  ]},
])
```

### 3.2 Navigation Modes

#### Hash Mode (default)
- Uses `window.location.hash` + the `hashchange` event.
- URLs look like `#/users/42`.
- No server configuration needed.
- `navigate('/users/42')` sets `window.location.hash = '/users/42'`.
- `link('/users/42')` returns `'#/users/42'` (for `<a href>`).

#### History Mode
- Uses `history.pushState` + the `popstate` event.
- Clean URLs like `/users/42`.
- Requires the server to serve `index.html` for all routes (SPA fallback).
- **Automatic `<a>` click interception**: A delegated `click` handler on `document` intercepts same-origin anchor clicks (left-click only, no modifier keys, no `target`/`download` attribute) and calls `pushState` instead of triggering a full page reload.
- `destroy()` removes the click interceptor and popstate listener.

### 3.3 Route Matching — Step by Step

1. **Normalization**: Route definitions (flat or nested) are converted into an internal tree of `InternalRouteNode` objects.
2. **Segment splitting**: The current URL path is split into segments (e.g. `/users/42` → `['users', '42']`).
3. **Recursive tree matching**: The `matchRoutesTree` function walks the tree, matching each node's segments against the URL:
   - Static segments must match exactly.
   - `:param` segments match anything and extract the value (URI-decoded).
   - The `*` wildcard is tried last as a fallback.
4. **Query parsing**: The query string (`?page=2&sort=name`) is parsed into a `Record<string, string>`, with URI-decoded keys and values.
5. **Deduplication**: `distinctUntilChanged` compares path + query, so the same route is not emitted twice.

**The `RouteMatch<N>` object:**

```typescript
{
  name: 'user-detail',              // route name
  params: { id: '42' },            // extracted URL params
  query: { tab: 'posts' },         // parsed query string
  path: '/users/42',               // matched path without query
  matched: [                        // full chain (for nested routes)
    { name: 'users', params: {}, path: '/users' },
    { name: 'user-detail', params: { id: '42' }, path: '/users/42' },
  ],
}
```

### 3.4 `withGuard(protectedRoutes, guardFn, onDenied)` — Route Guards

An RxJS operator that intercepts route emissions and evaluates a guard function before allowing navigation to protected routes:

```typescript
const guarded$ = router.route$.pipe(
  withGuard(
    ['dashboard', 'profile'],
    () => of(authStore.getState().isAuthenticated),
    () => router.navigate('/login'),
  ),
)
```

**Step by step:**
1. On each route emission, checks if `match.name` is in the protected list.
2. If not protected, passes through immediately.
3. If protected, calls `guardFn()` which returns an `Observable<boolean>`.
4. If `true`, the route passes through. If `false`, calls `onDenied()` (typically a redirect) and suppresses the emission via `EMPTY`.
5. Uses `switchMap` internally, so rapid navigation cancels stale guard checks.

### 3.5 `withScrollReset()` — Scroll to Top

An operator that scrolls to `(0, 0)` on each route emission. Pipe it **after** `withGuard` so denied routes don't trigger a scroll:

```typescript
const routed$ = router.route$.pipe(
  withGuard([...], guardFn, onDenied),
  withScrollReset(),
)
```

### 3.6 `lazy(loader)` — Code Splitting

Wraps a dynamic `import()` call in a cold Observable. The import is only triggered on subscribe, and `switchMap` in the consumer naturally cancels stale loads:

```typescript
lazy(() => import('./views/home.view')).pipe(
  map(m => m.homeView),
)
```

Internally, this is simply `defer(() => from(loader()))`.

### 3.7 `createOutlet(element, route$, animation?)` — View Lifecycle Management

Formalizes the router outlet pattern. On each route emission:
1. Runs a leave animation on the old content (if configured).
2. Unsubscribes the previous view's subscription (cancels HTTP, removes listeners).
3. Clears `element.innerHTML`.
4. Calls the `renderFn` with the new route match.
5. Runs an enter animation on the new content (if configured).

```typescript
const outlet = createOutlet(outletEl, guarded$, {
  enter: fadeIn(300),
  leave: fadeOut(200),
})

const outletSub = outlet.subscribe((match) => {
  switch (match.name) {
    case 'home':  return homeView(outletEl, store)
    case 'users': return usersView(outletEl, store, router)
    default:      return null
  }
})
```

### 3.8 `routeAtDepth(depth)` — Nested Outlet Filtering

An operator that only emits when the route at a given nesting depth changes. Parent outlets use depth 0, child outlets use depth 1, etc. Uses `distinctUntilChanged` on `matched[depth]` to avoid re-renders when only deeper children change.

### 3.9 SSR / Static Mode

If `options.initialUrl` is provided, the router creates a static `route$` that emits only the matching route for that URL. `navigate()` is a no-op. This enables server-side rendering without a browser `window`.

---

## 4. @rxjs-spa/dom — Reactive DOM Bindings

**Package:** `packages/dom/src/`

This package bridges RxJS Observables to the DOM. It has three categories: **Sources** (DOM → Observable), **Sinks** (Observable → DOM), and a **Tagged Template Engine** (`html`).

### 4.1 Sources — DOM Events to Observables

Sources create Observables from DOM events:

| Function | Description |
|----------|-------------|
| `textChanges(input)` | Emits `input.value` on each `input` event. Starts with current value. |
| `valueChanges(input)` | Same as `textChanges`, works on `<input>`, `<select>`, `<textarea>`. |
| `checkedChanges(checkbox)` | Emits `input.checked` on each `change` event. |
| `attrChanges(el, attr)` | Uses `MutationObserver` to emit when an attribute changes. |
| `hasClass(el, className)` | Emits `true/false` when the element's class list changes. |
| `fromKeypress(target)` | Emits the `key` string on each `keypress` event. |
| `fromKeydown(target)` | Emits the `key` string on each `keydown` event. |
| `fromKeyup(target)` | Emits the `key` string on each `keyup` event. |

All sources are **cold Observables** — nothing is listened to until you subscribe, and unsubscribing removes the listener.

### 4.2 Sinks — Observables to DOM

Sinks subscribe to an Observable and write each emission to a DOM property:

| Function | Signature | What It Does |
|----------|-----------|--------------|
| `text(el)` | `(Observable<string>) => Subscription` | Writes to `el.textContent`. Deduplicates with `distinctUntilChanged`. |
| `innerHtml(el)` | `(Observable<string>) => Subscription` | Writes raw HTML to `el.innerHTML`. **Warning:** no escaping. |
| `safeHtml(el)` | `(Observable<string>) => Subscription` | Escapes `& < > " '` before writing to `innerHTML`. Safe for user input. |
| `attr(el, name)` | `(Observable<string\|null>) => Subscription` | Sets or removes an attribute. `null/undefined` → `removeAttribute`. |
| `prop(el, key)` | `(Observable<T>) => Subscription` | Writes to `(el as any)[key]`. Useful for `value`, `checked`, etc. |
| `style(el, name)` | `(Observable<string\|null>) => Subscription` | Sets or clears a CSS style property. |
| `classToggle(el, className)` | `(Observable<boolean>) => Subscription` | Adds/removes a class based on `true/false`. |
| `dispatch(target)` | `(Observable<T>) => Subscription` | Forwards each value to `target.next()` (typically a Subject). |
| `documentTitle(suffix?)` | `(Observable<string>) => Subscription` | Sets `document.title`. Optional suffix appended with ` \| `. |
| `metaContent(name)` | `(Observable<string>) => Subscription` | Upserts a `<meta>` tag in `<head>`. |

**Example — wiring a counter display:**

```typescript
const count$ = store.select(s => s.count)
const countEl = document.getElementById('count')!

// This subscribes to count$ and writes each new value to the element
const sub = text(countEl)(count$.pipe(map(String)))
```

### 4.3 `mount(root, setup)` — View Lifecycle

Runs the setup function once and returns a single `Subscription` representing the entire view:

```typescript
const viewSub = mount(container, (root) => [
  text(root.querySelector('.count')!)(count$.pipe(map(String))),
  classToggle(root.querySelector('.warning')!, 'active')(isWarning$),
])
```

### 4.4 `effect(...items)` — Subscription Aggregation

Combines multiple subscriptions or teardown functions into one `Subscription`:

```typescript
const sub = effect(
  text(el)(value$),
  () => console.log('teardown'),
)
```

### 4.5 List Rendering — `renderList`, `renderKeyedList`, `renderKeyedComponents`

Three progressively more powerful list renderers:

#### `renderList(container, keyFn, createNode, updateNode?)(items$)`
Basic keyed list rendering. Creates DOM nodes per key, optionally updates them. Removes nodes when keys disappear.

#### `renderKeyedList(container, keyFn, createView, updateView?)(items$)`
Like `renderList`, but each item can have its own `Subscription` lifecycle. When an item disappears, its subscription is unsubscribed — preventing memory leaks from per-item streams.

#### `renderKeyedComponents(container, keyFn, factory, actions)(items$)`
Each keyed item becomes a mini-component with its own `BehaviorSubject<T>` (`item$`). When the item's data changes, the `BehaviorSubject` is updated — internal streams stay alive and only re-emit the changed data. Items also get a `dispatch` function for sending actions upstream.

### 4.6 The `html` Tagged Template — Reactive DOM Construction

The star of the DOM package. A tagged template literal that parses HTML with reactive bindings:

```typescript
const template = html`
  <div class="card">
    <h2>${title$}</h2>
    <p>${description$}</p>
    <a href=${url$}>Read more</a>
    <button @click=${() => dispatch({ type: 'SAVE' })}>Save</button>
    <input .value=${inputValue$} />
    <div ?hidden=${isHidden$}>Secret content</div>
  </div>
`
// template.fragment → DocumentFragment ready to insert
// template.sub → Subscription managing all bindings
```

**Binding types:**

| Syntax | Kind | Description |
|--------|------|-------------|
| `${expr}` in text | Text | Auto-escaped. If Observable, auto-subscribed. |
| `attr=${expr}` | Attribute | Sets/removes attribute. Reactive if Observable. |
| `@event=${fn}` | Event | Adds event listener. Removed on teardown. |
| `.prop=${expr}` | Property | Sets JS property directly. Reactive if Observable. |
| `?attr=${expr}` | Boolean attr | Adds attr if truthy, removes if falsy. |

**Step-by-step internals:**

1. **Template preparation** (cached per `TemplateStringsArray`): The static strings are joined with marker comments (`<!--__RX_N__-->` for text, `__RX_N__` for attributes). Special prefixes (`@`, `.`, `?`) are rewritten to `data-rx-*` attributes so the HTML parser doesn't mangle them.
2. **Template cloning**: The prepared `<template>` element's content is cloned via `cloneNode(true)`.
3. **Slot binding**: The DOM is walked to find marker nodes. For each slot:
   - **Text slots**: Comment nodes are found and replaced. Observables are subscribed; static values create text nodes.
   - **Attribute slots**: Values are set via `setAttribute` / `removeAttribute`. Observables auto-update.
   - **Event slots**: `addEventListener` is called, with `removeEventListener` on teardown.
   - **Property slots**: Values assigned to `el[propName]`. Observables auto-update.
   - **Boolean attribute slots**: Attribute is toggled based on truthiness.

### 4.7 `when(condition$, thenFn, elseFn?, animation?)` — Conditional Rendering

Mounts/unmounts a template based on a boolean Observable:

```typescript
html`
  ${when(
    isLoggedIn$,
    () => html`<p>Welcome back!</p>`,
    () => html`<p>Please log in.</p>`,
  )}
`
```

**How it works:**
1. A comment anchor node marks the position in the DOM.
2. When `condition$` emits `true`, `thenFn()` is called to create a template, and its fragment is inserted after the anchor.
3. When `condition$` flips to `false`, the current nodes are removed (with optional leave animation), and `elseFn()` is mounted if provided.
4. Each branch's `Subscription` is properly torn down to prevent leaks.

### 4.8 `list(items$, keyFn, templateFn, animation?)` — Keyed List Rendering

Renders a list of items with keyed reconciliation:

```typescript
html`
  <ul>
    ${list(
      users$,
      u => String(u.id),
      (user$, key) => html`<li>${user$.pipe(map(u => u.name))}</li>`,
    )}
  </ul>
`
```

**How it works:**
1. Each item gets a `BehaviorSubject` (`LiveValue<T>`) that the template subscribes to.
2. When the items array changes, existing keys have their `BehaviorSubject` updated (`.next(newItem)`) — the template DOM stays alive.
3. New keys create new templates.
4. Removed keys trigger subscription teardown and node removal (with optional leave animation).
5. Items are reordered in the DOM to match the new array order.

### 4.9 `LiveValue<T>` — Observable with Synchronous Access

A `LiveValue` is an Observable backed by a `BehaviorSubject` that exposes a `snapshot()` method. This is crucial inside event handlers where you need the current value without subscribing:

```typescript
list(items$, i => i.id, (item$) => html`
  <button @click=${() => dispatch(item$.snapshot().id)}>Go</button>
`)
```

### 4.10 `hydrate(root, template)` — Server-Side Rendering Support

Attaches reactive bindings to existing server-rendered DOM nodes. Instead of creating new DOM, it walks the existing DOM structure and binds Observables to matching slots. Cleans up SSR marker comments during the process.

### 4.11 `defineComponent(setup)` — Component System

Creates reusable components with lifecycle hooks:

```typescript
const MyCard = defineComponent<{ title: string }>((props, { onMount, onDestroy }) => {
  onMount(() => {
    console.log('Card mounted')
    return () => console.log('Card mount cleanup')
  })
  onDestroy(() => console.log('Card destroyed'))

  return html`<div class="card"><h2>${props.title}</h2></div>`
})

// Usage: embed directly in html template
html`${MyCard({ title: 'Hello' })}`
```

**Lifecycle hooks:**
- `onMount(fn)` — runs after the component is inserted into the DOM. Return a cleanup function.
- `onDestroy(fn)` — runs when the component's `Subscription` is unsubscribed.

### 4.12 Animations

Built-in animation functions for enter/leave transitions:

| Function | Description |
|----------|-------------|
| `slideUp(duration?)` | Animates height to 0. |
| `scaleIn(duration?)` | Scales from 0.95 + fades in. |
| `scaleOut(duration?)` | Scales to 0.95 + fades out. |

These can be used with `when()`, `list()`, and `createOutlet()`:

```typescript
when(show$, 
  () => html`<div>Content</div>`,
  undefined,
  { enter: scaleIn(200), leave: scaleOut(200) }
)
```

### 4.13 `setDomErrorHandler(fn)` — Error Handling Integration

Replaces the default error handler (`console.warn`) for all DOM bindings. Integrate with `@rxjs-spa/errors`:

```typescript
setDomErrorHandler((error, context) => {
  errorHandler.reportError(error, 'dom', context)
})
```

---

## 5. @rxjs-spa/http — Observable HTTP Client

**Package:** `packages/http/src/public.ts`

### 5.1 `http` — Default Client

A pre-configured HTTP client with no base URL or interceptors. Every method returns a **cold Observable** — the XHR is only sent when you subscribe, and unsubscribing cancels the in-flight request.

```typescript
http.get<User[]>('/api/users').subscribe(console.log)
http.post<User>('/api/users', { name: 'Alice' }).subscribe(console.log)
```

**Supported methods:** `get`, `post`, `put`, `patch`, `delete`.

Each method internally creates an `ajax()` Observable from `rxjs/ajax` with `Content-Type: application/json` and `Accept: application/json` headers, then maps the response to extract `response.response`.

### 5.2 `createHttpClient(config?)` — Custom Client Factory

Creates an HTTP client with a base URL and/or interceptors:

```typescript
const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  interceptors: [
    {
      request: (config) => ({
        ...config,
        headers: { ...config.headers, Authorization: `Bearer ${token}` },
      }),
    },
    {
      response: (res$) => res$.pipe(retry(2)),
    },
  ],
})

api.get<User[]>('/users').subscribe(console.log)
// → GET https://api.example.com/users  (with auth header + retry)
```

### 5.3 Interceptors — Request/Response Pipeline

Interceptors can modify outgoing requests and/or incoming responses:

```typescript
interface HttpInterceptor {
  request?(config: AjaxConfig): AjaxConfig    // modify before sending
  response?<T>(source$: Observable<T>): Observable<T>  // transform response
}
```

**Execution order:**
- **Request phase**: interceptors run **left-to-right** (`[0] → [1] → [2] → XHR`)
- **Response phase**: interceptors run **right-to-left** (`XHR → [2] → [1] → [0] → subscriber`)

This mirrors the "onion" model — the first interceptor added wraps the outermost layer.

### 5.4 `RemoteData<T>` — Async State Union

A discriminated union type representing the lifecycle of an async request:

```typescript
type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; statusCode?: number }
```

**Factory functions:** `idle()`, `loading()`, `success(data)`, `failure(error, statusCode?)`

**Type guards:** `isIdle(rd)`, `isLoading(rd)`, `isSuccess(rd)`, `isError(rd)`

This eliminates "boolean flag soup" — instead of juggling `isLoading`, `error`, `data` independently, you have a single discriminated value that guarantees only one state is active at a time.

### 5.5 `toRemoteData()` — Operator

Wraps any Observable into a `RemoteData<T>` stream:

```typescript
const users$ = http.get<User[]>('/api/users').pipe(toRemoteData())
// Emits:  { status: 'loading' }  →  { status: 'success', data: [...] }
// On error: { status: 'loading' }  →  { status: 'error', error: '...', statusCode: 404 }
```

**Step by step:**
1. `startWith({ status: 'loading' })` — immediately signals loading.
2. `map(data => ({ status: 'success', data }))` — wraps the response.
3. `catchError` — catches `AjaxError` and extracts status code + message.

---

## 6. @rxjs-spa/forms — Schema-Driven Reactive Forms

**Package:** `packages/forms/src/`

### 6.1 Schema Definition — Fluent Builders

Forms start with a schema that defines field types, initial values, and validation rules:

```typescript
import { s, createForm } from '@rxjs-spa/forms'

const schema = {
  name:     s.string().required().minLength(2),
  email:    s.string().required().email(),
  age:      s.number().min(0).max(150),
  agree:    s.boolean().required(),   // "Must be checked"
  address:  s.group({                 // nested group
    street: s.string().required(),
    city:   s.string().required(),
  }),
}
```

**Available field types and validators:**

| Builder | Validators |
|---------|-----------|
| `s.string(initial?)` | `.required()`, `.minLength(n)`, `.maxLength(n)`, `.email()`, `.pattern(regex)`, `.oneOf(options)`, `.refine(fn)` |
| `s.number(initial?)` | `.required()`, `.min(n)`, `.max(n)`, `.refine(fn)` |
| `s.boolean(initial?)` | `.required()`, `.refine(fn)` |
| `s.group(shape)` | Nested group of fields |

Each builder is **immutable** — calling `.required()` returns a new builder with the validator appended. Validators run in order; the first error wins.

### 6.2 `createForm(schema, options?)` — Form Creation

Creates a reactive form from a schema:

```typescript
const form = createForm(schema)
```

**What it returns:**

| Property | Type | Description |
|----------|------|-------------|
| `values$` | `Observable<FormValues<S>>` | Current values for all fields. |
| `errors$` | `Observable<FormErrors<S>>` | Validation errors (null if valid). |
| `touched$` | `Observable<FormTouched<S>>` | Which fields have been touched. |
| `valid$` | `Observable<boolean>` | `true` when all fields pass validation. |
| `submitting$` | `Observable<boolean>` | Whether a submit is in progress. |
| `actions$` | `Observable<FormAction>` | Action stream for wiring submit effects. |
| `field(name)` | `FieldControl<T>` | Per-field reactive control. |
| `setValue(name, value)` | `void` | Set a field value. |
| `setTouched(name)` | `void` | Mark a field as touched. |
| `submit()` | `void` | Touch all fields + start submit. |
| `submitEnd(ok)` | `void` | End the submit phase. |
| `reset()` | `void` | Reset to initial values. |
| `group(name)` | `FormGroup<Inner>` | Access a nested field group. |
| `getValues()` | Synchronous snapshot of values. |
| `getErrors()` | Synchronous snapshot of errors. |
| `isValid()` | Synchronous validity check. |

### 6.3 `FieldControl<T>` — Per-Field Observables

Each field provides fine-grained reactive streams:

```typescript
const nameField = form.field('name')

nameField.value$      // Observable<string>   — current value
nameField.error$      // Observable<string | null> — validation error
nameField.touched$    // Observable<boolean>  — has been interacted with
nameField.dirty$      // Observable<boolean>  — differs from initial value
nameField.showError$  // Observable<string | null> — error only if touched (standard UX)
```

`showError$` is the key UX feature — it combines `error$` and `touched$` so validation messages only appear after the user has interacted with the field.

### 6.4 Cross-Field Validation

Form-level validators that can compare multiple fields:

```typescript
const form = createForm(schema, {
  validators: [
    (values) => {
      const errors: Record<string, string> = {}
      if (values.password !== values.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match'
      }
      return errors
    },
  ],
})
```

Cross-field errors only apply to fields whose field-level validation passes (error is `null`), preventing conflicting error messages.

### 6.5 Nested Groups

Groups provide scoped access to nested field structures:

```typescript
const addressGroup = form.group('address')

addressGroup.values$     // Observable<{ street: string; city: string }>
addressGroup.valid$      // Observable<boolean>
addressGroup.field('street').value$  // Observable<string>
```

Internally, groups prefix action paths (e.g. `address.street`) and dispatch `SET_NESTED_VALUE`/`TOUCH_NESTED` actions that use `deepSet` to update nested state immutably.

### 6.6 DOM Binders — Two-Way Binding

Utility functions that wire form fields to DOM elements:

| Function | Description |
|----------|-------------|
| `bindInput(input, form, name)` | Syncs `<input>`/`<textarea>` value bidirectionally. Sets touched on blur. |
| `bindCheckbox(input, form, name)` | Syncs checkbox `checked` state. |
| `bindSelect(select, form, name)` | Syncs `<select>` value. |
| `bindError(el, error$)` | Displays error text + toggles `.has-error` class. |
| `bindField(container, form, name)` | Convenience: auto-finds input/select/checkbox + `.field-error` element inside a container and binds everything. |

### 6.7 Internal Architecture

The form uses the same MVU pattern as the store:

1. A `Subject<FormAction>` receives all actions (`SET_VALUE`, `TOUCH`, `SUBMIT_START`, etc.).
2. `scan(formReducer, initialState)` reduces actions into `FormState<S>`.
3. `values$`, `touched$`, `submitting$` are derived via `select()`.
4. `errors$` is derived reactively from `values$` by running `validateAll()` on every value change.
5. `valid$` is derived from `errors$`.

---

## 7. @rxjs-spa/errors — Centralized Error Handling

**Package:** `packages/errors/src/public.ts`

### 7.1 `createErrorHandler(config?)` — Error Bus

Creates a centralized error handler that captures errors from multiple sources:

```typescript
const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) => console.error(`[${e.source}] ${e.message}`),
})
```

**Returns:** `[ErrorHandler, Subscription]`

**The `ErrorHandler` exposes:**
- `errors$` — hot Observable of all captured `AppError` objects (does NOT replay).
- `reportError(error, source?, context?)` — manually report an error.

**The `AppError` type:**

```typescript
{
  source: 'observable' | 'global' | 'promise' | 'manual',
  error: Error,          // normalized Error object
  message: string,       // error.message
  timestamp: number,     // Date.now()
  context?: string,      // optional label
}
```

**Global capture** (enabled by default): Listens to `window.onerror` (uncaught JS errors) and `window.onunhandledrejection` (unhandled Promise rejections) via `fromEvent`. Unsubscribing the returned `Subscription` removes these listeners.

### 7.2 `catchAndReport(handler, options?)` — Drop-In `catchError`

An RxJS operator that catches errors, reports them to the handler, and optionally emits a fallback value:

```typescript
http.get('/api/users').pipe(
  map(users => ({ type: 'SUCCESS' as const, users })),
  catchAndReport(errorHandler, {
    fallback: { type: 'ERROR' as const, error: 'Request failed' },
    context: 'usersView/FETCH',
  }),
)
```

If no `fallback` is provided, the stream completes (`EMPTY`). If a `fallback` is provided, it can be a value or an Observable.

### 7.3 `safeScan(reducer, initial, handler, options?)` — Error-Resilient Reducer

A drop-in replacement for `scan()` that wraps the reducer in a try/catch. If the reducer throws:
1. The error is reported to the handler.
2. The **previous state** is returned (not the broken state).
3. The pipeline stays alive — no subscriber death.

```typescript
const state$ = actionsSubject.pipe(
  safeScan(reducer, initialState, errorHandler, { context: 'myStore' }),
  startWith(initialState),
  shareReplay({ bufferSize: 1, refCount: false }),
)
```

### 7.4 `safeSubscribe(source$, handler, next, options?)` — Safe Subscription

Subscribes with an auto-wired error callback that reports to the handler, preventing silent subscription deaths:

```typescript
safeSubscribe(value$, errorHandler, (v) => {
  el.textContent = String(v)
})
```

### 7.5 `createSafeStore(reducer, initial, handler, options?)` — Safe Store

A drop-in replacement for `createStore` that uses `safeScan` internally. A reducer throw cannot kill `state$`:

```typescript
const store = createSafeStore(reducer, { count: 0 }, errorHandler, {
  context: 'counterStore',
})
```

Internally identical to `createStore`, but swaps `scan` for `safeScan`.

---

## 8. @rxjs-spa/persist — State Persistence

**Package:** `packages/persist/src/public.ts`

### 8.1 `createPersistedStore(reducer, initial, key, options?)` — Drop-In Persistent Store

A transparent replacement for `createStore` that adds localStorage persistence:

```typescript
const store = createPersistedStore(reducer, { theme: 'light', count: 0 }, 'app:ui', {
  pick: ['theme'],     // only persist the 'theme' key
  version: 2,          // bump when schema changes
})
```

**Step-by-step lifecycle:**

1. **Version check**: Reads `key.__version__` from storage. If it doesn't match `options.version`, wipes the stored state (prevents stale/incompatible state from breaking the app).
2. **Hydration**: Calls `loadState(key, initialState)` — reads JSON from storage and shallow-merges with `initialState`. Missing keys fall back to defaults. Handles corrupt JSON gracefully.
3. **Store creation**: Creates a normal store with the hydrated state.
4. **Persistence**: Subscribes to `state$` and writes JSON to storage on every emission. If `pick` is specified, only those keys are saved.

### 8.2 `PersistOptions<S>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pick` | `Array<keyof S>` | all keys | Only persist these keys. |
| `storage` | `Storage` | `localStorage` | Custom storage backend (e.g. `sessionStorage`). |
| `version` | `number` | `1` | Schema version. Wipes on mismatch. |

### 8.3 Low-Level Primitives

| Function | Description |
|----------|-------------|
| `loadState(key, default, opts?)` | Read + shallow-merge from storage. |
| `persistState(source, key, opts?)` | Subscribe to `source.state$` and write to storage. Returns `Subscription`. |
| `clearState(key, storage?)` | Remove both the state entry and version key from storage. |

---

## 9. @rxjs-spa/core — Shared Operators

**Package:** `packages/core/src/public.ts`

Two essential multicasting operators:

### 9.1 `remember<T>()` — Persistent Replay

```typescript
source$.pipe(remember())
```

Equivalent to `shareReplay({ bufferSize: 1, refCount: false })`:
- First subscriber triggers the source connection.
- The connection stays alive **forever**, even if all subscribers leave.
- Late subscribers immediately receive the latest cached value.

**Use case:** State streams that must always be "hot" — like `state$` in a store.

### 9.2 `rememberWhileSubscribed<T>()` — Conditional Replay

```typescript
source$.pipe(rememberWhileSubscribed())
```

Equivalent to `shareReplay({ bufferSize: 1, refCount: true })`:
- First subscriber triggers the source connection.
- When the **last** subscriber unsubscribes, the connection is torn down.
- A later subscriber restarts the source — the previous cached value is gone.

**Use case:** Derived streams or computed values that are only needed while a view is mounted.

---

## 10. @rxjs-spa/testing — Test Utilities

**Package:** `packages/testing/src/public.ts`

### 10.1 `collectFrom(obs$)` — Emission Collector

Subscribes to an Observable and collects all emissions into an array for assertions:

```typescript
const result = collectFrom(store.select(s => s.count))
store.dispatch({ type: 'INC' })
store.dispatch({ type: 'INC' })

expect(result.values).toEqual([0, 1, 2])
result.subscription.unsubscribe()
```

### 10.2 `createMockStore(initialState)` — Mock Store

A drop-in replacement for `Store<S, A>` with two extra features:

| Feature | Description |
|---------|-------------|
| `setState(state)` | Drive `state$` directly without dispatching (bypasses reducer). |
| `dispatchedActions` | Array of every action passed to `dispatch()` — use for assertions. |

```typescript
const store = createMockStore<MyState, MyAction>({ count: 0 })
store.setState({ count: 5 })
store.dispatch({ type: 'INC' })
expect(store.dispatchedActions).toEqual([{ type: 'INC' }])
expect(store.getState().count).toBe(5)
```

### 10.3 `createMockRouter(initialRoute?)` — Mock Router

A drop-in replacement for `Router<N>` with:

| Feature | Description |
|---------|-------------|
| `emit(route)` | Push a route change into `route$`. |
| `navigatedTo` | Array of every path passed to `navigate()` — use for assertions. |

```typescript
const router = createMockRouter<'home' | 'users'>()
router.emit({ name: 'users', params: {}, query: {}, path: '/users', matched: [] })
router.navigate('/users/42')
expect(router.navigatedTo).toEqual(['/users/42'])
```

### 10.4 `createMockHttpClient()` — Mock HTTP Client

A drop-in replacement for `HttpClient` with:

| Feature | Description |
|---------|-------------|
| `whenGet(url).respond(data)` | Configure a mock response for GET requests. |
| `whenPost(url).respond(data)` | Same for POST. (Also `whenPut`, `whenPatch`, `whenDelete`.) |
| `whenGet(url).respondWith(obs$)` | Respond with a custom Observable (for testing loading/error states). |
| `calls` | Array of every request made — `{ method, url, body? }`. |

Unconfigured URLs throw an error, preventing silent missing mocks.

```typescript
const http = createMockHttpClient()
http.whenGet('/api/users').respond([{ id: 1, name: 'Alice' }])

http.get('/api/users').subscribe(users => {
  expect(users).toEqual([{ id: 1, name: 'Alice' }])
})
expect(http.calls).toEqual([{ method: 'GET', url: '/api/users' }])
```

### 10.5 `triggerHashChange(path)` — jsdom Helper

Sets `window.location.hash` and dispatches a synthetic `hashchange` event. Needed because jsdom doesn't fire real events when setting `location.hash`:

```typescript
triggerHashChange('#/users')
```

---

## 11. Demo App — Putting It All Together

**Location:** `apps/demo/`

The demo app is a full-featured SPA demonstrating every package working together:

### 11.1 Application Bootstrap (`main.ts`)

1. **Router creation**: `createRouter()` with history mode, 6 routes including a wildcard 404.
2. **Global store**: A shared store for app-wide state.
3. **Error handler**: `createErrorHandler` with global capture enabled. Error toasts auto-dismiss after 4 seconds.
4. **DevTools**: A logger and visual DevTools panel for development.
5. **Hydration support**: Checks for existing SSR content and hydrates or mounts accordingly.
6. **HMR cleanup**: `import.meta.hot.dispose` unsubscribes everything to prevent leaks during development.

### 11.2 View Convention

Each view is a function `(container, store, router?, params?) => Subscription`:

1. Writes an HTML skeleton to `container.innerHTML`.
2. Creates a **local store** for route-scoped state.
3. Wires **effects** on `store.actions$` (e.g. fetch data on mount).
4. Returns `mount(container, () => [...sinks])`.

When the router navigates away, the returned `Subscription` is unsubscribed — canceling HTTP requests, removing event listeners, and cleaning up all DOM bindings.

### 11.3 Routes

| Path | View | Features Demonstrated |
|------|------|----------------------|
| `/` | Home | Static content |
| `/users` | Users list | HTTP fetch, `RemoteData`, list rendering |
| `/users/:id` | User detail | Param extraction, HTTP fetch |
| `/contact` | Contact form | `@rxjs-spa/forms` with validation |
| `/login` | Login | Authentication flow |
| `*` | Not Found | Wildcard route |

---

## 12. Build & Development Infrastructure

### 12.1 Monorepo Structure

- **npm workspaces**: Packages are linked via npm workspaces. No `workspace:*` protocol — instead, local packages are referenced by matching their version (`0.1.0`).
- **Conditional exports**: Each package exports TypeScript source in dev mode (`development` condition) and compiled dist in production. Vite resolves `development` automatically, so `vite dev` works without building packages first.

### 12.2 Build Configuration

- **Packages**: Vite library mode producing ESM + CJS bundles. `rxjs` and `rxjs/ajax` are always external.
- **TypeScript**: ES2022 target, `moduleResolution: "Bundler"`, strict mode.
- **RxJS**: Pinned to exactly 7.8.2 via root `package.json` `overrides`.

### 12.3 Testing

- **Framework**: Vitest with workspace runner.
- **Environments**: `jsdom` for packages that touch the DOM (dom, router, http, errors, forms, persist, demo); `node` for pure logic (core, store).
- **Commands**:
  - `npm run test` — watch mode
  - `npm run test:run` — single run (CI)
  - `npx vitest run <path>` — run a single test file

### 12.4 Starter Templates

The `apps/starters/` directory provides graduated templates:
- `starter-minimal` — bare minimum setup
- `starter-standard` — common features included
- `starter-full` — all packages wired together

---

## Summary

| Package | Purpose | Key Export |
|---------|---------|-----------|
| `@rxjs-spa/store` | MVU state management | `createStore`, `ofType`, `combineStores` |
| `@rxjs-spa/router` | Client-side routing | `createRouter`, `withGuard`, `createOutlet`, `lazy` |
| `@rxjs-spa/dom` | Reactive DOM bindings | `html`, `when`, `list`, sinks, sources |
| `@rxjs-spa/http` | Observable HTTP client | `http`, `createHttpClient`, `RemoteData`, `toRemoteData` |
| `@rxjs-spa/forms` | Schema-driven forms | `createForm`, `s.string()`, binders |
| `@rxjs-spa/errors` | Error handling | `createErrorHandler`, `catchAndReport`, `safeScan` |
| `@rxjs-spa/persist` | State persistence | `createPersistedStore`, `loadState`, `persistState` |
| `@rxjs-spa/core` | Shared operators | `remember`, `rememberWhileSubscribed` |
| `@rxjs-spa/testing` | Test utilities | `createMockStore`, `createMockRouter`, `createMockHttpClient` |

Each package is independently usable but designed to compose naturally. The MVU pattern runs through everything — stores, forms, and the router all follow the same `Subject → scan → shareReplay` pipeline. Subscriptions are explicit everywhere, giving you full control over lifecycle and preventing memory leaks.
