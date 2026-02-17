# RxJS Shop — Application Description

RxJS Shop is a single-page e-commerce application built entirely with RxJS and TypeScript. It uses no third-party UI framework — no React, Angular, or Vue. Every piece of state, every DOM update, every HTTP request, and every user interaction flows through RxJS Observables. The application depends on eight internal workspace packages from the rxjs-spa monorepo: core, dom, store, router, http, forms, persist, and errors.

The data source is the FakeStore API at fakestoreapi.com, which provides product listings, individual product details, and category names. The checkout form submits to JSONPlaceholder as a demo endpoint.

---

## Step 1 — Entry Point and Bootstrap

The application starts in index.html, which contains a single empty div with the id "app" and loads src/main.ts as an ES module.

main.ts does four things in order:

First, it creates an error toast element. This is a div appended to the document body with the class "error-toast hidden". It subscribes to the centralized error handler's errors$ stream. When any error is reported anywhere in the application, the toast becomes visible, displays the error message, and automatically hides itself after four seconds. If multiple errors arrive in quick succession, the timer resets so the latest message is always shown for the full four seconds.

Second, it creates the router. The router is configured in history mode, meaning it uses the browser's pushState API for clean URLs rather than hash fragments. Five route patterns are registered: "/" maps to the name "products", "/product/:id" maps to "product-detail", "/cart" maps to "cart", "/checkout" maps to "checkout", and the wildcard "*" maps to "not-found". The router emits a RouteMatch object on its route$ Observable whenever the URL changes. Each RouteMatch includes the route name, any extracted path parameters, query parameters, and the full path string.

Third, it calls the bootstrap function. This function finds the #app element, clears its content, and calls the App component, passing the router as a dependency. App returns a document fragment and a subscription. The fragment is appended to #app.

Fourth, it registers a Vite HMR disposal callback. When a module is hot-replaced during development, the callback unsubscribes the app subscription, destroys the router (removing its global popstate and click listeners), and removes the toast element from the DOM. This prevents subscription leaks and duplicate event handlers during development.

---

## Step 2 — Error Handler

The error handler is created in src/error-handler.ts using createErrorHandler from the errors package. It is configured with enableGlobalCapture set to true, which means it automatically intercepts window.onerror events and unhandled promise rejections. It also accepts a custom onError callback that logs each error to the console with a formatted prefix showing the source and optional context label.

The error handler exposes two things: an errors$ Observable that emits every reported error, and a reportError method that other parts of the application can call manually. The errors$ stream is what the toast in main.ts subscribes to. Throughout the rest of the application, the catchAndReport operator from the errors package is used in HTTP effects. It acts as a drop-in replacement for catchError, but additionally sends the error through the error handler so the toast is triggered automatically.

---

## Step 3 — API Layer

The HTTP client is created in src/api/api.ts using createHttpClient from the http package. It is configured with a base URL of "https://fakestoreapi.com" and a single logging interceptor that prints each outgoing request's method and URL to the console.

The api object exposes three methods under a products namespace: list, get, and categories. list calls GET /products and returns an Observable of Product arrays. get takes an id parameter and calls GET /products/{id}, returning an Observable of a single Product. categories calls GET /products/categories and returns an Observable of string arrays. All three methods return cold Observables, meaning the HTTP request is not made until something subscribes. Unsubscribing cancels the underlying XMLHttpRequest.

---

## Step 4 — Domain Types

The type definitions in src/types.ts describe the data model. A Product has an id (number), title, price, description, category, image URL, and a nested rating object containing a rate and count. A CartItem pairs a Product with a quantity number. The SortOption type is a union of four string literals: "price-asc", "price-desc", "rating", and "title". The CatalogQuery interface describes the shape of URL query parameters used for filtering and sorting the product catalog.

---

## Step 5 — Cart Store (Global State)

The cart store in src/store/cart.store.ts is the only piece of global state in the application. It is created with createPersistedStore from the persist package, which means cart contents survive page reloads by being serialized to localStorage.

The state shape has two fields: items, which is an array of CartItem objects, and drawerOpen, a boolean controlling the visibility of the slide-in cart drawer.

The store accepts seven action types:

ADD_TO_CART carries a product and an optional quantity defaulting to one. The reducer checks whether an item with the same product id already exists in the array. If it does, the existing item's quantity is increased by the new amount. If it does not, a new CartItem is appended to the end of the array.

REMOVE_FROM_CART carries a productId. The reducer filters the items array, removing the item whose product id matches.

UPDATE_QUANTITY carries a productId and a quantity. If the new quantity is zero or negative, the reducer removes the item entirely — the same behavior as REMOVE_FROM_CART. Otherwise, it maps over the items array and replaces the quantity for the matching item.

CLEAR_CART resets items to an empty array and sets drawerOpen to false. This is dispatched after a successful checkout.

TOGGLE_DRAWER, CLOSE_DRAWER, and OPEN_DRAWER control the drawerOpen boolean. TOGGLE flips it, CLOSE sets it to false, and OPEN sets it to true.

The store is created with the localStorage key "rxjs-shop:cart". The pick option is set to ["items"], which means only the items array is persisted. The drawerOpen boolean is not saved — it always starts as false on a fresh page load. The version option is set to 1, which means if the version number changes in the future, the persisted data will be wiped and replaced with the initial state.

Because this store is created at module scope and exported as a singleton, every view in the application shares the same cart state.

---

## Step 6 — App Shell Component

The App component in src/App.ts is the root of the application UI. It is defined using defineComponent from the dom package.

It receives the router as a dependency and immediately pipes the router's route$ Observable through withScrollReset, which scrolls the window to the top on every route change. The result is stored as routed$.

There is a side effect subscription on routed$ that dispatches CLOSE_DRAWER to the cart store on every route change. This ensures the cart drawer closes whenever the user navigates to a different page.

Several derived Observables are created from the cart store using select:

cartCount$ calculates the total number of items by summing the quantity of every cart item. drawerOpen$ extracts the drawerOpen boolean. drawerItems$ extracts the items array. drawerSubtotal$ calculates the total price by summing price times quantity for every item. drawerEmpty$ maps the items array to a boolean indicating whether it is empty. cartBadgeVisible$ maps the cart count to a boolean indicating whether it is greater than zero.

The view$ Observable is the heart of the routing system. It takes routed$ and uses switchMap to load the appropriate view based on the route name. Each view is loaded lazily through the lazy operator, which wraps a dynamic import() call. This means view code is split into separate chunks and only fetched from the server when the route is first visited. The switchMap ensures that when the route changes, the previous view's Observable is unsubscribed — which cancels any pending HTTP requests and tears down all DOM subscriptions from the old view.

The template rendered by App has three main sections:

The navigation bar contains the brand link "RxJS Shop" pointing to "/", a "Products" link pointing to "/", and a "Cart" link pointing to "/cart". The cart link conditionally renders a badge span showing the cart count — the badge only appears when cartBadgeVisible$ emits true. There is also a cart toggle button labeled "Cart (N)" that dispatches TOGGLE_DRAWER when clicked.

The main content area renders the view$ Observable. As route changes cause view$ to emit new document fragments, the dom package swaps the content of this area.

The cart drawer is conditionally rendered using the when operator, which only creates the DOM subtree when drawerOpen$ is true. The drawer consists of an overlay backdrop that closes the drawer on click, a header with a title and close button, a body section, and a footer.

The drawer body shows either an "empty" message or a list of cart items. The list is rendered using the list operator with each item keyed by its product id. For each item, the template shows a thumbnail image, the product title, the line price (unit price times quantity), the quantity, and a remove button. Clicking the remove button dispatches REMOVE_FROM_CART with the product's id.

The drawer footer shows the subtotal formatted as a dollar amount, a "View Cart" link to /cart, and a "Checkout" link to /checkout. Both links dispatch CLOSE_DRAWER so the drawer slides shut when the user navigates.

---

## Step 7 — Products View (Catalog)

The products view in src/views/products.view.ts is the main landing page. It creates its own local store for managing the product data fetched from the API. This store is entirely separate from the global cart store — it exists only while the products view is active and is discarded when the user navigates away.

The local state has four fields: allProducts (an array of all products from the API), categories (an array of category strings), loading (a boolean), and error (a nullable string).

The local store accepts three action types: FETCH, FETCH_SUCCESS carrying products and categories, and FETCH_ERROR carrying an error message.

An effect is wired on the store's actions$ stream. It listens for FETCH actions and uses switchMap to make two API calls in parallel via combineLatest: api.products.list and api.products.categories. When both complete, it dispatches FETCH_SUCCESS with the results. If either call fails, catchAndReport sends the error to the error handler (triggering the toast) and provides a fallback FETCH_ERROR action. The view dispatches FETCH immediately upon creation, triggering the initial data load.

Filtering and sorting are driven entirely by URL query parameters. Four Observables extract query params from the router's route$ stream: activeCategory$ reads the "category" param, activeSearch$ reads the "search" param, activeSort$ reads the "sort" param, and activePage$ reads the "page" param (defaulting to 1 and parsing it as an integer). Each uses distinctUntilChanged to avoid re-processing when the value has not actually changed.

The derived pipeline starts with filteredAndSorted$, which uses combineLatest to combine allProducts$, activeCategory$, activeSearch$, and activeSort$. The map operator inside filters the products by category if one is active, then filters by search text (matching against title, description, and category in a case-insensitive way), then sorts based on the active sort option — ascending price, descending price, best rating, or alphabetical title. The result is piped through remember() (shareReplay with buffer size 1) so that multiple downstream subscribers share the same filtered list without re-running the filter logic.

From filteredAndSorted$, two more Observables are derived: totalCount$ gives the total number of matching products, and totalPages$ divides that by the page size of 8 and rounds up.

paginatedProducts$ combines filteredAndSorted$ with activePage$ and slices the appropriate 8-item window from the filtered list.

showingText$ produces a string like "Showing 1-8 of 20 products" based on the current page and total count.

The view provides several helper functions for updating query parameters. buildQueryString reads the current URL search params, applies the requested changes, and returns a new path string. setCategory, setSort, and setPage each call router.navigate with an updated query string. When changing category or sort, the page is reset to 1 to avoid being stranded on a non-existent page. resetFilters navigates to "/" with no query params at all.

Search uses a Subject called searchInput$. Every keystroke in the search input pushes the current value into this Subject. A debounceTime(300) operator waits 300 milliseconds of inactivity before calling router.navigate with the search term. This prevents a flood of URL changes while the user is still typing.

The rendered template has a header area with the title "Product Catalog", a search input, and a sort dropdown.

Below the header is a two-column layout. The left sidebar shows category filter buttons. An "All Products" button resets all filters. Below it, the list operator renders one button per category. Each button dispatches setCategory when clicked and receives an "active" CSS class when it matches the current activeCategory$.

The right main area has four conditional sections. A loading skeleton grid appears while loading$ is true. An error banner appears when there is an error, with a retry button that re-dispatches FETCH. A "no results" message appears when the filtered list is empty and loading is finished. The product grid renders each paginated product using the list operator keyed by product id. Each product card shows an image linked to its detail page, the category, the title linked to its detail page, the price, and an "Add to Cart" button that dispatches ADD_TO_CART to the global cart store.

Below the grid, the results info text shows the "Showing X-Y of Z" message. The pagination nav renders previous and next buttons (disabled at the boundaries) and numbered page buttons, with the current page highlighted using the "btn-primary" class.

---

## Step 8 — Product Detail View

The product detail view in src/views/product-detail.view.ts shows a single product. Like the products view, it creates its own local store.

The state has four fields: product (nullable Product), loading, error, and selectedQuantity (defaulting to 1).

The local store accepts four action types: FETCH carrying a productId string, FETCH_SUCCESS carrying a Product, FETCH_ERROR carrying an error string, and SET_QUANTITY carrying a quantity number. The SET_QUANTITY reducer clamps the value to a minimum of 1.

An effect listens for FETCH actions on the store's actions$ stream and uses switchMap to call api.products.get with the product id. On success it dispatches FETCH_SUCCESS; on failure, catchAndReport provides a FETCH_ERROR fallback. The view reads the id parameter from the route params and immediately dispatches FETCH if it exists.

Several selectors derive display values from the state: title$, price$ (formatted with a dollar sign), image$, category$, description$, rate$, and rateCount$. The stars$ Observable converts the numeric rating into a visual string of full stars, half markers, and empty stars using Unicode characters.

totalPrice$ combines the product's price with the selected quantity to show the total cost.

The handleAddToCart function reads the current product from the store's state. If a product exists, it dispatches ADD_TO_CART to the global cart store with the selected quantity, then dispatches OPEN_DRAWER so the user immediately sees the item in the cart drawer.

The template shows a "Back to catalog" link at the top. Below that, conditional sections render: a loading message while the product is being fetched, an error banner if the fetch failed, and the full product detail layout when the product is available.

The product layout is a two-column design. The left column shows the product image. The right column shows the category as a badge, the title, the price, the star rating with review count, and the description. Below the description is a quantity control with minus and plus buttons that dispatch SET_QUANTITY, the current quantity number, and the total price for that quantity. At the bottom is a large "Add to Cart" button.

---

## Step 9 — Cart View

The cart view in src/views/cart.view.ts displays the full cart contents. It does not create a local store. Instead, it reads all of its data directly from the global cart store using select.

Four derived Observables are created: items$ is the full items array, isEmpty$ and hasItems$ are boolean Observables derived from the array length, subtotal$ sums price times quantity across all items, and itemCount$ sums the quantity field across all items.

The template shows one of two states. When the cart is empty, it displays a message and a "Continue Shopping" link to the products page.

When the cart has items, it shows a two-column layout. The left column lists each cart item using the list operator keyed by product id. Each item row shows a thumbnail image, the product title (linked to its detail page), the category, the unit price, a quantity control with plus and minus buttons, the line total, and a remove button. The plus and minus buttons dispatch UPDATE_QUANTITY to the cart store. Because the reducer removes items when quantity reaches zero, pressing minus on a quantity of 1 effectively removes the item. The remove button dispatches REMOVE_FROM_CART directly.

The right column is the order summary sidebar. It shows the item count and subtotal, a total line, a "Proceed to Checkout" button linking to /checkout, and a "Continue Shopping" link back to the products page.

---

## Step 10 — Checkout View

The checkout view in src/views/checkout.view.ts handles the order submission flow. Unlike the other views which use defineComponent, this view uses an imperative DOM pattern. It creates the HTML as a string, injects it into a container element, then queries for individual elements to wire up reactive behavior.

The view starts by reading the current cart state synchronously using cartStore.getState(). It extracts the items array, calculates the subtotal and item count. If the cart is empty, a message is displayed with a link back to the products page, and the function returns early with an empty subscription.

When items exist, the full checkout layout is rendered. It has two columns.

The left column contains the checkout form. The form is created using createForm from the forms package with a schema that defines every field and its validation rules. The schema has eleven fields:

firstName and lastName are required strings. email is required and must match an email format. phone is an optional string. address is required and must be at least 5 characters long. city and state are required strings. zip is required and must match a 5-digit or 5+4-digit ZIP code pattern. cardNumber is required and must be exactly 16 digits. expiry is required and must match the MM/YY format. cvv is required and must be 3 or 4 digits.

Each input element is connected to the form using bindInput, which sets up two-way data binding — typing in the input updates the form state, and programmatic form changes update the input value. Each error span is connected using bindError, which shows or hides the validation message based on the field's showError$ Observable. Errors only appear after the field has been touched (blurred or submitted).

The submit effect listens to the form's actions$ stream for SUBMIT_START actions. It uses exhaustMap so that clicking the submit button multiple times does not create multiple concurrent requests — only the first submission is processed until it completes.

When a submission starts, the effect first checks form validity using form.isValid(). If the form is invalid, it calls form.submitEnd(false), which marks all fields as touched so their validation errors become visible. If the form is valid, it constructs an order object containing all form values plus the cart items and subtotal, then sends a POST request to JSONPlaceholder.

The HTTP response is piped through toRemoteData(), which wraps it in a discriminated union that transitions through idle, loading, success, and error states. On success, form.submitEnd(true) is called, and CLEAR_CART is dispatched to the cart store, emptying the cart. On error, form.submitEnd(false) is called.

The UI reacts to form state changes. While submitting$ is true, the submit button is disabled and a "Processing..." text appears. When the submission ends, either a success banner or an error banner is shown. On success, the form itself is hidden and replaced by the success message with a "Continue Shopping" link.

The right column shows the order summary, which is rendered statically from the cart snapshot taken at the start. It lists each item with a truncated title, quantity, and line price, followed by the total.

The view returns its subscription, and when the user navigates away, the subscription is unsubscribed, cleaning up all form bindings, the submit handler event listener, and the effect subscription.

---

## Step 11 — Not Found View

The not found view in src/views/not-found.view.ts is the simplest view. It reads the current pathname from window.location and displays a "404 — Page not found" message showing the path that was requested. A button links back to the shop root.

---

## Step 12 — Product Card Component

The ProductCard component in src/components/product-card.ts is a reusable presentational component defined with defineComponent. It receives a product$ Observable and an onAddToCart callback function.

Internally it subscribes to product$ to keep a local reference to the current product value. It derives title$, price$, image$, category$, and href$ Observables from product$. The template renders an article element with an image link, category badge, title link, price, and an "Add to Cart" button. The button click calls onAddToCart with the current product.

This component is available for use in the products view, though the products view also inlines its own card rendering directly in the template for the product grid.

---

## Step 13 — Subscription Lifecycle and Cleanup

Every Observable subscription in the application is explicit and tracked. Each view function returns a subscription (or a mount result containing one). The App component's switchMap over view$ automatically unsubscribes from the previous view's subscriptions when a new route is matched. This means that navigating from the products page to a product detail page cancels all pending HTTP requests from the products view, removes all DOM event listeners it created, and tears down its local store.

At the top level, the HMR dispose callback unsubscribes the app-level subscription, which cascades down through all active views and their effects.

There is no hidden or automatic cleanup. Every subscription is explicitly created, explicitly tracked, and explicitly torn down.

---

## Step 14 — Data Flow Summary

A user visits the application. The router emits a RouteMatch for the "/" path. The App component's switchMap dynamically imports the products view module. The products view creates a local store, dispatches FETCH, and the effect calls the FakeStore API for products and categories. When the responses arrive, FETCH_SUCCESS updates the local state, which triggers the derived filter and pagination Observables to emit, which causes the product grid to render.

The user clicks a category button. The view calls router.navigate with an updated query string. The router emits a new RouteMatch with the same route name but different query params. activeCategory$ emits the new value. filteredAndSorted$ re-runs its filter logic. paginatedProducts$ re-slices the results. The grid updates in place.

The user clicks "Add to Cart" on a product card. The cart store receives an ADD_TO_CART action. The reducer adds the item or increments its quantity. cartCount$ in the App component emits the new count. The badge updates. The cart drawer (if open) shows the updated item list. localStorage is written with the new items array.

The user navigates to /cart. The App component's switchMap unsubscribes the products view and dynamically imports the cart view. The cart view subscribes to the global cart store's state and renders the items.

The user proceeds to /checkout. The checkout view reads the cart snapshot, renders the form, and waits for submission. On successful submission, CLEAR_CART empties the cart, localStorage is cleared, and a success message appears.

The user refreshes the page at any point. The router reads the current URL and emits the matching route. The cart store hydrates from localStorage, restoring any items that were added before the refresh. The application picks up exactly where it left off.
