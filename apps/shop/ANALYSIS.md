# apps/shop — How the Shop App Uses @rxjs-spa Packages

## Overview

The shop app is a full e-commerce SPA (product catalog, detail pages, cart with persistence, checkout with form validation) that demonstrates integrated usage of all 9 `@rxjs-spa` packages. It fetches products from the [FakeStore API](https://fakestoreapi.com), supports filtering/sorting/pagination, persists the cart to localStorage, and processes checkout via a reactive form with schema validation.

---

## Package Usage Map

| Package | Where Used | Primary Role |
|---------|-----------|--------------|
| **@rxjs-spa/router** | `main.ts`, `App.ts`, all views | 5-route history-mode router with lazy loading |
| **@rxjs-spa/store** | `cart.store.ts`, all views | Global cart store + per-view local stores (MVU) |
| **@rxjs-spa/dom** | All views, components | `html` templates, `when()`, `list()`, `defineComponent()` |
| **@rxjs-spa/http** | `api.ts`, views, checkout | `createHttpClient` with logging interceptor + `toRemoteData` |
| **@rxjs-spa/errors** | `error-handler.ts`, `main.ts`, views | Global error bus with toast UI + `catchAndReport` in effects |
| **@rxjs-spa/forms** | `checkout.view.ts` | 11-field checkout form with schema validation + DOM binders |
| **@rxjs-spa/persist** | `cart.store.ts` | Cart items persisted to localStorage with `pick` + `version` |
| **@rxjs-spa/core** | `products.view.ts` | `remember()` on filtered/sorted product list |
| **@rxjs-spa/testing** | `cart.store.test.ts`, `App.test.ts` | `collectFrom`, `createMockStore`, `createMockRouter` |

---

## 1. Router — `@rxjs-spa/router`

### Route Definition (`main.ts`)

```typescript
const router = createRouter({
  '/': 'products',
  '/product/:id': 'product-detail',
  '/cart': 'cart',
  '/checkout': 'checkout',
  '*': 'not-found',
} as const, { mode: 'history' })
```

Five named routes with a wildcard fallback. History mode with clean URLs.

### Router Outlet with Lazy Loading (`App.ts`)

The root component subscribes to `route$` and lazy-loads view modules via `switchMap` + `lazy()`:

```typescript
const routed$ = router.route$.pipe(withScrollReset())

const view$ = routed$.pipe(
  switchMap(({ name, params }) => {
    switch (name) {
      case 'products':
        return lazy(() => import('./views/products.view')).pipe(
          map(m => m.productsView({ router, cartStore }))
        )
      case 'product-detail':
        return lazy(() => import('./views/product-detail.view')).pipe(
          map(m => m.productDetailView({ router, cartStore, params }))
        )
      // ... cart, checkout, not-found
    }
  })
)

return html`<main>${view$}</main>`
```

- `withScrollReset()` scrolls to top on every route change
- `lazy()` wraps dynamic `import()` in a cold Observable — code splitting per route
- `switchMap` cancels the previous view's subscriptions (and in-flight HTTP) on navigation

### Query Parameters for Filtering (`products.view.ts`)

The products view reads filter/search/pagination state from URL query params:

```typescript
const activeCategory$ = router.route$.pipe(
  map(r => r.query?.category || ''),
  distinctUntilChanged()
)
const activeSearch$ = router.route$.pipe(
  map(r => r.query?.search || ''),
  distinctUntilChanged()
)
const activePage$ = router.route$.pipe(
  map(r => Math.max(1, parseInt(r.query?.page || '1', 10))),
  distinctUntilChanged()
)
```

Filters update the URL via `router.navigate(buildQueryString(...))`, making filter state shareable via URL.

### Link Generation

```html
<a href="${router.link('/')}">RxJS Shop</a>
<a href="${router.link('/product/' + p.id)}">View</a>
<a href="${router.link('/cart')}">Cart</a>
```

---

## 2. Store — `@rxjs-spa/store`

### Global Cart Store (`cart.store.ts`)

**State:**
```typescript
interface CartState {
  items: CartItem[]     // { product: Product, quantity: number }
  drawerOpen: boolean
}
```

**Actions:** `ADD_TO_CART`, `REMOVE_FROM_CART`, `UPDATE_QUANTITY`, `CLEAR_CART`, `TOGGLE_DRAWER`, `CLOSE_DRAWER`, `OPEN_DRAWER`

**Reducer highlights:**
- `ADD_TO_CART`: merges quantities if product exists, appends otherwise
- `UPDATE_QUANTITY`: removes item if quantity drops to 0
- `CLEAR_CART`: empties items and closes drawer

**Created as a persisted store** (see persist section below).

**Selectors in App.ts:**
```typescript
const cartCount$ = cartStore.select(s =>
  s.items.reduce((sum, i) => sum + i.quantity, 0)
)
const drawerOpen$ = cartStore.select(s => s.drawerOpen)
const drawerItems$ = cartStore.select(s => s.items)
const drawerSubtotal$ = cartStore.select(s =>
  s.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
)
```

### Per-View Local Stores

Each view creates its own local store for route-scoped state:

**Products view** — fetches products + categories, stores loading/error state:
```typescript
const store = createStore<ProductsState, ProductsAction>(productsReducer, INITIAL)

store.actions$.pipe(
  ofType('FETCH'),
  switchMap(() =>
    combineLatest([api.products.list(), api.products.categories()]).pipe(
      map(([products, categories]) => ({ type: 'FETCH_SUCCESS', products, categories })),
      catchAndReport(errorHandler, {
        fallback: { type: 'FETCH_ERROR', error: 'Failed to load products' },
        context: 'productsView/FETCH',
      }),
    )
  ),
).subscribe(action => store.dispatch(action))

store.dispatch({ type: 'FETCH' })  // Trigger initial load
```

**Product detail view** — same pattern for single-product fetch with `params.id`.

### Side-Effects Pattern

Effects are wired to `store.actions$` via `ofType()` → `switchMap()` → HTTP → `dispatch()`:

```
dispatch({ type: 'FETCH' })
    ↓
actions$.pipe(ofType('FETCH'))
    ↓
switchMap(() => api.products.list())
    ↓
map(data => ({ type: 'FETCH_SUCCESS', data }))
    ↓
catchAndReport(errorHandler, { fallback: { type: 'FETCH_ERROR' } })
    ↓
.subscribe(action => store.dispatch(action))
```

---

## 3. DOM — `@rxjs-spa/dom`

### `defineComponent` — Reusable Components

**Star rating component (`components/star-rating.ts`):**
```typescript
export const StarRating = defineComponent<{
  rate$: Observable<number>
  count$: Observable<number>
}>(({ rate$, count$ }) => {
  const stars$ = rate$.pipe(map(rate => {
    const full = Math.floor(rate)
    const half = rate - full >= 0.5 ? 1 : 0
    const empty = 5 - full - half
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
  }))

  return html`
    <span class="star-rating">
      <span class="stars">${stars$}</span>
      <span class="rating-text">${rate$} (${count$})</span>
    </span>
  `
})
```

Components accept Observable props and return `TemplateResult`. No class hierarchy — just functions.

### `html` Tagged Templates — Reactive Bindings

**Text interpolation** (auto-escaped, auto-subscribed):
```html
<span class="cart-badge">${cartCount$}</span>
<h3>${title$}</h3>
<span>${price$}</span>
```

**Attribute binding** (reactive):
```html
<img src="${image$}" alt="${title$}" />
<a href="${href$}">${title$}</a>
<div class="${loading$.pipe(map(l => l ? 'visible' : 'hidden'))}">
```

**Boolean attribute binding:**
```html
<button ?disabled=${hasPrev$.pipe(map(h => !h))}>Prev</button>
```

**Event binding:**
```html
<button @click=${() => cartStore.dispatch({ type: 'ADD_TO_CART', product })}>
  Add to Cart
</button>
<input @input=${(e: Event) => searchInput$.next((e.target as HTMLInputElement).value)} />
```

### `when()` — Conditional Rendering

**Cart badge (show only when non-zero):**
```html
${when(cartBadgeVisible$, () => html`
  <span class="cart-badge">${cartCount$}</span>
`)}
```

**Cart drawer (show/hide):**
```html
${when(drawerOpen$, () => html`
  <aside class="cart-drawer">
    <h2>Your Cart</h2>
    ${list(drawerItems$, ...)}
    <p>Subtotal: $${drawerSubtotal$}</p>
  </aside>
`)}
```

**Empty cart vs items:**
```html
${when(isEmpty$, () => html`<p>Your cart is empty.</p>`)}
${when(hasItems$, () => html`<!-- items list + summary -->`)}
```

### `list()` — Keyed List Rendering

**Product grid with `snapshot()` for event handlers:**
```typescript
${list(paginatedProducts$, p => String(p.id), (product$) => {
  const title$ = product$.pipe(map(p => p.title))
  const price$ = product$.pipe(map(p => `$${p.price.toFixed(2)}`))
  const image$ = product$.pipe(map(p => p.image))

  return html`
    <article class="product-card">
      <img src="${image$}" alt="${title$}" />
      <h3>${title$}</h3>
      <span>${price$}</span>
      <button @click=${() => cartStore.dispatch({
        type: 'ADD_TO_CART',
        product: product$.snapshot()  // sync access to current value
      })}>Add to Cart</button>
    </article>
  `
})}
```

**Cart items with quantity controls:**
```typescript
${list(items$, i => String(i.product.id), (item$) => {
  const qty$ = item$.pipe(map(i => String(i.quantity)))

  return html`
    <div class="cart-item">
      <span>${qty$}</span>
      <button @click=${() => {
        const ci = item$.snapshot()
        cartStore.dispatch({
          type: 'UPDATE_QUANTITY',
          productId: ci.product.id,
          quantity: ci.quantity - 1,
        })
      }}>-</button>
    </div>
  `
})}
```

**Category filter buttons:**
```typescript
${list(categories$, c => c, (cat$) => {
  return html`
    <button class="${activeCategory$.pipe(map(active =>
      'filter-btn' + (active === cat$.snapshot() ? ' active' : '')
    ))}" @click=${() => setCategory(cat$.snapshot())}>
      ${cat$}
    </button>
  `
})}
```

`LiveValue.snapshot()` is used throughout event handlers to synchronously access the current item value.

---

## 4. HTTP — `@rxjs-spa/http`

### Client Setup (`api.ts`)

```typescript
const loggingInterceptor: HttpInterceptor = {
  request: (config) => {
    console.log(`[shop] ${config.method} ${config.url}`)
    return config
  },
}

const http = createHttpClient({
  baseUrl: 'https://fakestoreapi.com',
  interceptors: [loggingInterceptor],
})

export const api = {
  products: {
    list:       () => http.get<Product[]>('/products'),
    get:        (id) => http.get<Product>(`/products/${id}`),
    categories: () => http.get<string[]>('/products/categories'),
  },
}
```

- `baseUrl` prepended to all relative URLs
- Logging interceptor prints every request to console
- All methods return cold Observables — request fires on subscribe, cancels on unsubscribe

### RemoteData in Checkout (`checkout.view.ts`)

```typescript
http.post('https://jsonplaceholder.typicode.com/posts', order).pipe(
  toRemoteData(),
  map(rd => {
    if (isSuccess(rd)) { form.submitEnd(true); cartStore.dispatch({ type: 'CLEAR_CART' }) }
    if (isError(rd))   { form.submitEnd(false) }
    return rd
  }),
)
```

`toRemoteData()` wraps the response into `loading → success | error` emissions. Type guards `isSuccess()` and `isError()` narrow the discriminated union.

---

## 5. Errors — `@rxjs-spa/errors`

### Handler Setup (`error-handler.ts`)

```typescript
export const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) => console.error(`[shop][${e.source}]${e.context ? ` ${e.context}:` : ''} ${e.message}`),
})
```

Captures `window.onerror`, `unhandledrejection`, and all manually reported errors.

### Error Toast (`main.ts`)

```typescript
errorHandler.errors$.subscribe((e) => {
  toastEl.textContent = e.message
  toastEl.classList.remove('hidden')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000)
})
```

Every error from any source (HTTP failure, reducer throw, promise rejection) surfaces as a 4-second toast notification.

### `catchAndReport` in Effects

```typescript
api.products.list().pipe(
  map(products => ({ type: 'FETCH_SUCCESS', products })),
  catchAndReport(errorHandler, {
    fallback: { type: 'FETCH_ERROR', error: 'Failed to load products' },
    context: 'productsView/FETCH',
  }),
)
```

On HTTP failure: reports to error bus (shows toast) AND dispatches a fallback action to the store (sets error state in the view).

---

## 6. Forms — `@rxjs-spa/forms`

### Checkout Schema (`checkout.view.ts`)

```typescript
const checkoutSchema = {
  firstName:  s.string('').required('First name is required'),
  lastName:   s.string('').required('Last name is required'),
  email:      s.string('').required('Email is required').email('Enter a valid email'),
  phone:      s.string(''),
  address:    s.string('').required('Address is required').minLength(5, 'Too short'),
  city:       s.string('').required('City is required'),
  state:      s.string('').required('State is required'),
  zip:        s.string('').required('ZIP code is required').pattern(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP'),
  cardNumber: s.string('').required('Card number is required').pattern(/^\d{16}$/, '16 digits required'),
  expiry:     s.string('').required('Expiry is required').pattern(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Format: MM/YY'),
  cvv:        s.string('').required('CVV is required').pattern(/^\d{3,4}$/, '3 or 4 digits'),
}
```

11 fields with validators: `required`, `email`, `minLength`, `pattern`.

### Form Binding

```typescript
const form = createForm(checkoutSchema)

// Two-way input binding
sub.add(bindInput(firstNameInput, form, 'firstName'))
sub.add(bindInput(emailInput, form, 'email'))

// Error display (touch-gated)
sub.add(bindError(errorFirstName, form.field('firstName').showError$))
sub.add(bindError(errorEmail, form.field('email').showError$))

// Submit button disabled during submission
sub.add(form.submitting$.subscribe(s => { submitBtn.disabled = s }))
```

### Submit Flow

```typescript
formEl.addEventListener('submit', (e) => {
  e.preventDefault()
  form.submit()  // TOUCH_ALL + SUBMIT_START
})

form.actions$.pipe(
  ofType('SUBMIT_START'),
  exhaustMap(() => {
    if (!form.isValid()) { form.submitEnd(false); return of(null) }
    return http.post(url, { ...form.getValues(), items, total }).pipe(
      toRemoteData(),
      map(rd => {
        if (isSuccess(rd)) { form.submitEnd(true); cartStore.dispatch({ type: 'CLEAR_CART' }) }
        if (isError(rd))   { form.submitEnd(false) }
        return rd
      }),
    )
  }),
).subscribe()
```

`form.submit()` marks all fields touched (shows all errors) then emits `SUBMIT_START`. The effect validates, POSTs the order, and clears the cart on success.

---

## 7. Persist — `@rxjs-spa/persist`

### Persisted Cart (`cart.store.ts`)

```typescript
export const cartStore = createPersistedStore<CartState, CartAction>(
  cartReducer,
  INITIAL_CART_STATE,
  'rxjs-shop:cart',
  {
    pick: ['items'],    // Only persist items, NOT drawerOpen
    version: 1,         // Wipe on version bump
  },
)
```

- `pick: ['items']` — drawer state resets on reload (transient UI), cart items survive
- `version: 1` — bump to 2 to wipe all stored carts (schema migration)
- Storage key: `localStorage['rxjs-shop:cart']`
- Transparent — the rest of the app interacts with it as a normal `Store<S, A>`

---

## 8. Core — `@rxjs-spa/core`

### `remember()` for Derived Data (`products.view.ts`)

```typescript
const filteredAndSorted$ = combineLatest([
  allProducts$, activeCategory$, activeSearch$, activeSort$,
]).pipe(
  map(([products, category, search, sort]) => {
    let result = products
    if (category) result = result.filter(p => p.category === category)
    if (search) result = result.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
    // ... sort logic
    return result
  }),
  remember(),  // Cache for multiple subscribers (pagination, count display, list)
)
```

`remember()` (`shareReplay(1, refCount: false)`) prevents recomputing the filtered list when multiple subscribers exist (the paginated list, the result count, etc.).

---

## 9. Testing — `@rxjs-spa/testing`

### Store Tests (`cart.store.test.ts`)

```typescript
const result = collectFrom(
  store.select(s => s.items.reduce((sum, i) => sum + i.quantity, 0))
)

store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 1 }), quantity: 2 })
store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 2 }), quantity: 3 })

expect(result.values).toEqual([0, 2, 5])
result.subscription.unsubscribe()
```

`collectFrom()` captures all Observable emissions into an array for assertion.

### App Component Tests (`App.test.ts`)

```typescript
const router = createMockRouter({
  name: 'products', path: '/', params: {}, query: {}, matched: [...]
})

// Simulate route change
router.emit({ name: 'cart', path: '/cart', params: {}, query: {}, matched: [...] })

// Assert drawer closes on navigation
const closeAction = mockCartStore.dispatchedActions.find(a => a.type === 'CLOSE_DRAWER')
expect(closeAction).toBeDefined()
```

Mock router simulates navigation; mock store captures dispatched actions for assertion.

---

## End-to-End Data Flows

### Navigation → View → HTTP → Store → DOM

```
User clicks /product/42
  → router.route$ emits { name: 'product-detail', params: { id: '42' } }
  → App.ts switchMap → lazy(() => import('./views/product-detail.view'))
  → productDetailView executes
  → local store dispatches { type: 'FETCH', productId: '42' }
  → effect: ofType('FETCH') → api.products.get(42) → FETCH_SUCCESS
  → store.state$ updates with product data
  → html template binds: title$, price$, image$, description$
  → DOM renders product page
```

### Add to Cart → Persist → Badge Update

```
User clicks "Add to Cart"
  → @click dispatches { type: 'ADD_TO_CART', product, quantity: 1 }
  → cartReducer merges/appends item
  → createPersistedStore writes { items: [...] } to localStorage
  → cartCount$ selector emits new count
  → html`<span class="cart-badge">${cartCount$}</span>` updates
  → drawerItems$ emits → list() re-renders drawer items
```

### Checkout → Form Validation → HTTP → Clear Cart

```
User fills form and clicks "Place Order"
  → form.submit() → TOUCH_ALL (shows errors) + SUBMIT_START
  → effect: form.isValid() check
  → if valid: http.post(url, order).pipe(toRemoteData())
  → isSuccess(rd) → form.submitEnd(true) + CLEAR_CART
  → CLEAR_CART → items emptied → localStorage cleared
  → success message shown, form hidden
```

### Error Flow

```
HTTP request fails (network error, 500, etc.)
  → catchAndReport(errorHandler, { fallback, context })
  → errorHandler.reportError(raw, 'observable', context)
  → onError callback → console.error(...)
  → errors$ emits AppError
  → main.ts subscriber → toast shows for 4 seconds
  → fallback action dispatched → store sets error state
  → view shows error banner
```

---

## Summary

The shop app integrates all 9 `@rxjs-spa` packages into a cohesive e-commerce SPA:

- **Router** provides history-mode navigation with lazy-loaded views and query-param-driven filters
- **Store** manages both a global persisted cart and per-view local state using the MVU pattern
- **DOM** renders everything via `html` tagged templates with `when()` conditionals, `list()` keyed rendering, and `defineComponent()` for reusable pieces
- **HTTP** communicates with the FakeStore API via a configured client with logging interceptor
- **Errors** provides a global error bus surfaced as a toast notification, with `catchAndReport` in every effect
- **Forms** handles the 11-field checkout with schema validation, two-way binding, and touch-gated error display
- **Persist** keeps cart items in localStorage across sessions while resetting transient UI state
- **Core** caches expensive derived computations with `remember()`
- **Testing** provides mock stores and routers for unit testing components and reducers
