import { of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { defineComponent, html, when, list } from '@rxjs-spa/dom'
import { lazy, withScrollReset } from '@rxjs-spa/router'
import type { Router } from '@rxjs-spa/router'
import { cartStore } from './store/cart.store'

type ShopRoute = 'products' | 'product-detail' | 'cart' | 'checkout' | 'not-found'

export const App = defineComponent<{ router: Router<ShopRoute> }>(({ router }) => {
  const routed$ = router.route$.pipe(withScrollReset())

  // Close drawer on route change
  routed$.subscribe(() => cartStore.dispatch({ type: 'CLOSE_DRAWER' }))

  const cartCount$ = cartStore.select(s =>
    s.items.reduce((sum, i) => sum + i.quantity, 0),
  )
  const drawerOpen$ = cartStore.select(s => s.drawerOpen)
  const drawerItems$ = cartStore.select(s => s.items)
  const drawerSubtotal$ = cartStore.select(s =>
    s.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
  )
  const drawerEmpty$ = drawerItems$.pipe(map(items => items.length === 0))
  const cartBadgeVisible$ = cartCount$.pipe(map(c => c > 0))

  const view$ = routed$.pipe(
    switchMap(({ name, params }) => {
      switch (name) {
        case 'products':
          return lazy(() => import('./views/products.view')).pipe(
            map(m => m.productsView({ router, cartStore })),
          )
        case 'product-detail':
          return lazy(() => import('./views/product-detail.view')).pipe(
            map(m => m.productDetailView({ router, cartStore, params })),
          )
        case 'cart':
          return lazy(() => import('./views/cart.view')).pipe(
            map(m => m.cartView({ router, cartStore })),
          )
        case 'checkout':
          return lazy(() => import('./views/checkout.view')).pipe(
            map(m => m.checkoutView({ router, cartStore })),
          )
        case 'not-found':
          return lazy(() => import('./views/not-found.view')).pipe(
            map(m => m.notFoundView({ router })),
          )
        default:
          return of(html`<div>Not Found</div>`)
      }
    }),
  )

  return html`
    <nav class="shop-nav">
      <div class="nav-inner">
        <a class="nav-brand" href="${router.link('/')}">RxJS Shop</a>
        <div class="nav-links">
          <a href="${router.link('/')}">Products</a>
          <a href="${router.link('/cart')}">
            Cart
            ${when(cartBadgeVisible$, () => html`<span class="cart-badge">${cartCount$}</span>`)}
          </a>
        </div>
        <button class="btn btn-outline cart-toggle" @click=${() => cartStore.dispatch({ type: 'TOGGLE_DRAWER' })}>
          Cart (${cartCount$})
        </button>
      </div>
    </nav>

    <main class="main-content">
      ${view$}
    </main>

    ${when(drawerOpen$, () => html`
      <div class="drawer-overlay" @click=${() => cartStore.dispatch({ type: 'CLOSE_DRAWER' })}></div>
      <aside class="cart-drawer">
        <div class="drawer-header">
          <h2>Your Cart</h2>
          <button class="drawer-close" @click=${() => cartStore.dispatch({ type: 'CLOSE_DRAWER' })}>X</button>
        </div>
        <div class="drawer-body">
          ${when(drawerEmpty$,
            () => html`<p class="empty-msg">Your cart is empty</p>`,
            () => html`
              <ul class="drawer-items">
                ${list(drawerItems$, i => String(i.product.id), (item$) => {
                  const title$ = item$.pipe(map(i => i.product.title))
                  const image$ = item$.pipe(map(i => i.product.image))
                  const linePrice$ = item$.pipe(map(i => `$${(i.product.price * i.quantity).toFixed(2)}`))
                  const qty$ = item$.pipe(map(i => String(i.quantity)))
                  let currentItem: { product: { id: number } } | null = null
                  item$.subscribe(i => { currentItem = i })
                  return html`
                    <li class="drawer-item">
                      <img class="drawer-item-img" src="${image$}" alt="${title$}" />
                      <div class="drawer-item-info">
                        <p class="drawer-item-title">${title$}</p>
                        <p class="drawer-item-price">${linePrice$}</p>
                        <span class="drawer-item-qty">Qty: ${qty$}</span>
                      </div>
                      <button class="drawer-item-remove" @click=${() => { if (currentItem) cartStore.dispatch({ type: 'REMOVE_FROM_CART', productId: currentItem.product.id }) }}>x</button>
                    </li>
                  `
                })}
              </ul>
            `,
          )}
        </div>
        <div class="drawer-footer">
          <p class="drawer-subtotal">Subtotal: <strong>$${drawerSubtotal$.pipe(map(s => s.toFixed(2)))}</strong></p>
          <a class="btn btn-primary drawer-btn" href="${router.link('/cart')}" @click=${() => cartStore.dispatch({ type: 'CLOSE_DRAWER' })}>View Cart</a>
          <a class="btn btn-accent drawer-btn" href="${router.link('/checkout')}" @click=${() => cartStore.dispatch({ type: 'CLOSE_DRAWER' })}>Checkout</a>
        </div>
      </aside>
    `)}
  `
})
