/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { createMockRouter, createMockStore } from '@rxjs-spa/testing'
import { cartView } from './cart.view'
import type { Product, CartItem } from '../types'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Test Product',
    price: 29.99,
    description: 'A test product',
    category: 'electronics',
    image: 'https://example.com/img.jpg',
    rating: { rate: 4.5, count: 100 },
    ...overrides,
  }
}

function makeCartItem(productOverrides: Partial<Product> = {}, quantity = 1): CartItem {
  return { product: makeProduct(productOverrides), quantity }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('cartView', () => {
  it('shows empty cart message when items array is empty', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({ items: [], drawerOpen: false })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const emptyDiv = fragment.querySelector('.empty-cart')
    expect(emptyDiv).not.toBeNull()
    expect(emptyDiv?.textContent).toContain('Your cart is empty')

    sub.unsubscribe()
  })

  it('shows Continue Shopping link in empty state', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({ items: [], drawerOpen: false })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const link = fragment.querySelector('.empty-cart a') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('/')

    sub.unsubscribe()
  })

  it('renders cart items when items exist', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [
        makeCartItem({ id: 1, title: 'Product A' }, 2),
        makeCartItem({ id: 2, title: 'Product B' }, 1),
      ],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const items = fragment.querySelectorAll('.cart-item')
    expect(items.length).toBe(2)

    sub.unsubscribe()
  })

  it('displays correct item count and subtotal', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [
        makeCartItem({ id: 1, price: 10 }, 2),
        makeCartItem({ id: 2, price: 15 }, 3),
      ],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const summary = fragment.querySelector('.cart-summary')
    expect(summary?.textContent).toContain('5') // 2 + 3 items
    expect(summary?.textContent).toContain('65.00') // 10*2 + 15*3

    sub.unsubscribe()
  })

  it('quantity + button dispatches UPDATE_QUANTITY with incremented value', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1, price: 10 }, 2)],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const buttons = fragment.querySelectorAll('.quantity-control button')
    const plusBtn = buttons[1] as HTMLButtonElement // second button is +
    plusBtn.click()

    const action = cartStore.dispatchedActions.find(
      (a: any) => a.type === 'UPDATE_QUANTITY',
    ) as any
    expect(action).toBeDefined()
    expect(action.productId).toBe(1)
    expect(action.quantity).toBe(3)

    sub.unsubscribe()
  })

  it('quantity - button dispatches UPDATE_QUANTITY with decremented value', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1, price: 10 }, 3)],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const buttons = fragment.querySelectorAll('.quantity-control button')
    const minusBtn = buttons[0] as HTMLButtonElement
    minusBtn.click()

    const action = cartStore.dispatchedActions.find(
      (a: any) => a.type === 'UPDATE_QUANTITY',
    ) as any
    expect(action).toBeDefined()
    expect(action.productId).toBe(1)
    expect(action.quantity).toBe(2)

    sub.unsubscribe()
  })

  it('Remove button dispatches REMOVE_FROM_CART', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 7, title: 'To Remove' }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const removeBtn = fragment.querySelector('.btn-danger') as HTMLButtonElement
    removeBtn.click()

    const action = cartStore.dispatchedActions.find(
      (a: any) => a.type === 'REMOVE_FROM_CART',
    ) as any
    expect(action).toBeDefined()
    expect(action.productId).toBe(7)

    sub.unsubscribe()
  })

  it('Proceed to Checkout link points to /checkout', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    const checkoutLink = fragment.querySelector('.cart-checkout-btn') as HTMLAnchorElement
    expect(checkoutLink.getAttribute('href')).toBe('/checkout')

    sub.unsubscribe()
  })

  it('updates rendering when cartStore state changes', async () => {
    const router = createMockRouter({ path: '/cart' })
    const cartStore = createMockStore({
      items: [],
      drawerOpen: false,
    })

    const { fragment, sub } = cartView({ router, cartStore })
    await flush()

    expect(fragment.querySelector('.empty-cart')).not.toBeNull()

    cartStore.setState({
      items: [makeCartItem({ id: 1, title: 'New Item' }, 1)],
      drawerOpen: false,
    })
    await flush()

    expect(fragment.querySelectorAll('.cart-item').length).toBe(1)

    sub.unsubscribe()
  })
})
