import { map } from 'rxjs/operators'
import { defineComponent, html, when, list } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { CartState, CartAction } from '../store/cart.store'
import type { CartItem } from '../types'

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const cartView = defineComponent<{
  router: Router<any>
  cartStore: Store<CartState, CartAction>
}>(({ router, cartStore }) => {
  const items$ = cartStore.select(s => s.items)
  const isEmpty$ = items$.pipe(map(items => items.length === 0))
  const hasItems$ = items$.pipe(map(items => items.length > 0))
  const subtotal$ = cartStore.select(s =>
    s.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
  )
  const itemCount$ = cartStore.select(s =>
    s.items.reduce((sum, i) => sum + i.quantity, 0),
  )

  return html`
    <section class="view cart-view">
      <h1>Shopping Cart</h1>

      ${when(isEmpty$, () => html`
        <div class="empty-cart">
          <p>Your cart is empty.</p>
          <a href="${router.link('/')}" class="btn btn-primary">Continue Shopping</a>
        </div>
      `)}

      ${when(hasItems$, () => html`
        <div class="cart-layout">
          <div class="cart-items">
            ${list(items$, i => String(i.product.id), (item$) => {
              const title$ = item$.pipe(map(i => i.product.title))
              const image$ = item$.pipe(map(i => i.product.image))
              const category$ = item$.pipe(map(i => i.product.category))
              const unitPrice$ = item$.pipe(map(i => '$' + i.product.price.toFixed(2) + ' each'))
              const qty$ = item$.pipe(map(i => String(i.quantity)))
              const lineTotal$ = item$.pipe(map(i => '$' + (i.product.price * i.quantity).toFixed(2)))
              const productLink$ = item$.pipe(map(i => router.link('/product/' + i.product.id)))
              let currentItem: CartItem | null = null
              item$.subscribe(i => { currentItem = i })
              return html`
                <div class="cart-item">
                  <img class="cart-item-img" src="${image$}" alt="${title$}" />
                  <div class="cart-item-details">
                    <h3 class="cart-item-title">
                      <a href="${productLink$}">${title$}</a>
                    </h3>
                    <span class="cart-item-category">${category$}</span>
                    <span class="cart-item-unit-price">${unitPrice$}</span>
                  </div>
                  <div class="cart-item-actions">
                    <div class="quantity-control">
                      <button class="btn btn-outline btn-sm"
                        @click=${() => { if (currentItem) cartStore.dispatch({ type: 'UPDATE_QUANTITY', productId: currentItem.product.id, quantity: currentItem.quantity - 1 }) }}>
                        -
                      </button>
                      <span class="quantity-value">${qty$}</span>
                      <button class="btn btn-outline btn-sm"
                        @click=${() => { if (currentItem) cartStore.dispatch({ type: 'UPDATE_QUANTITY', productId: currentItem.product.id, quantity: currentItem.quantity + 1 }) }}>
                        +
                      </button>
                    </div>
                    <span class="cart-item-total">${lineTotal$}</span>
                    <button class="btn btn-danger btn-sm"
                      @click=${() => { if (currentItem) cartStore.dispatch({ type: 'REMOVE_FROM_CART', productId: currentItem.product.id }) }}>
                      Remove
                    </button>
                  </div>
                </div>
              `
            })}
          </div>

          <div class="cart-summary">
            <h2>Order Summary</h2>
            <div class="summary-row">
              <span>Items (${itemCount$})</span>
              <span>$${subtotal$.pipe(map(s => s.toFixed(2)))}</span>
            </div>
            <div class="summary-row summary-total">
              <strong>Total</strong>
              <strong>$${subtotal$.pipe(map(s => s.toFixed(2)))}</strong>
            </div>
            <a href="${router.link('/checkout')}" class="btn btn-primary btn-lg cart-checkout-btn">
              Proceed to Checkout
            </a>
            <a href="${router.link('/')}" class="btn btn-outline continue-shopping">
              Continue Shopping
            </a>
          </div>
        </div>
      `)}
    </section>
  `
})
