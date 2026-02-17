import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from '@rxjs-spa/store'
import { collectFrom } from '@rxjs-spa/testing'
import { cartReducer, INITIAL_CART_STATE } from './cart.store'
import type { CartState, CartAction } from './cart.store'
import type { Product } from '../types'

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

function createTestStore(initial: CartState = INITIAL_CART_STATE) {
  return createStore<CartState, CartAction>(cartReducer, initial)
}

describe('cart store reducer', () => {
  describe('ADD_TO_CART', () => {
    it('adds a new item with default quantity 1', () => {
      const store = createTestStore()
      const product = makeProduct()

      store.dispatch({ type: 'ADD_TO_CART', product })

      const state = store.getState()
      expect(state.items).toHaveLength(1)
      expect(state.items[0].product.id).toBe(1)
      expect(state.items[0].quantity).toBe(1)
    })

    it('adds a new item with explicit quantity', () => {
      const store = createTestStore()
      const product = makeProduct()

      store.dispatch({ type: 'ADD_TO_CART', product, quantity: 3 })

      expect(store.getState().items[0].quantity).toBe(3)
    })

    it('merges quantity when same product is added twice', () => {
      const store = createTestStore()
      const product = makeProduct()

      store.dispatch({ type: 'ADD_TO_CART', product, quantity: 2 })
      store.dispatch({ type: 'ADD_TO_CART', product, quantity: 3 })

      const state = store.getState()
      expect(state.items).toHaveLength(1)
      expect(state.items[0].quantity).toBe(5)
    })

    it('adds different products as separate items', () => {
      const store = createTestStore()

      store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 1 }) })
      store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 2, title: 'Other' }) })

      expect(store.getState().items).toHaveLength(2)
    })
  })

  describe('REMOVE_FROM_CART', () => {
    it('removes an existing item by productId', () => {
      const store = createTestStore({
        items: [{ product: makeProduct({ id: 1 }), quantity: 2 }],
        drawerOpen: false,
      })

      store.dispatch({ type: 'REMOVE_FROM_CART', productId: 1 })

      expect(store.getState().items).toHaveLength(0)
    })

    it('does nothing when productId does not exist', () => {
      const store = createTestStore({
        items: [{ product: makeProduct({ id: 1 }), quantity: 1 }],
        drawerOpen: false,
      })

      store.dispatch({ type: 'REMOVE_FROM_CART', productId: 999 })

      expect(store.getState().items).toHaveLength(1)
    })
  })

  describe('UPDATE_QUANTITY', () => {
    it('updates quantity for an existing item', () => {
      const store = createTestStore({
        items: [{ product: makeProduct({ id: 1 }), quantity: 1 }],
        drawerOpen: false,
      })

      store.dispatch({ type: 'UPDATE_QUANTITY', productId: 1, quantity: 5 })

      expect(store.getState().items[0].quantity).toBe(5)
    })

    it('removes item when quantity is set to 0', () => {
      const store = createTestStore({
        items: [{ product: makeProduct({ id: 1 }), quantity: 3 }],
        drawerOpen: false,
      })

      store.dispatch({ type: 'UPDATE_QUANTITY', productId: 1, quantity: 0 })

      expect(store.getState().items).toHaveLength(0)
    })

    it('removes item when quantity is set to a negative value', () => {
      const store = createTestStore({
        items: [{ product: makeProduct({ id: 1 }), quantity: 2 }],
        drawerOpen: false,
      })

      store.dispatch({ type: 'UPDATE_QUANTITY', productId: 1, quantity: -1 })

      expect(store.getState().items).toHaveLength(0)
    })
  })

  describe('CLEAR_CART', () => {
    it('empties items and closes drawer', () => {
      const store = createTestStore({
        items: [
          { product: makeProduct({ id: 1 }), quantity: 2 },
          { product: makeProduct({ id: 2 }), quantity: 1 },
        ],
        drawerOpen: true,
      })

      store.dispatch({ type: 'CLEAR_CART' })

      const state = store.getState()
      expect(state.items).toHaveLength(0)
      expect(state.drawerOpen).toBe(false)
    })
  })

  describe('drawer actions', () => {
    it('TOGGLE_DRAWER flips drawerOpen', () => {
      const store = createTestStore()

      expect(store.getState().drawerOpen).toBe(false)

      store.dispatch({ type: 'TOGGLE_DRAWER' })
      expect(store.getState().drawerOpen).toBe(true)

      store.dispatch({ type: 'TOGGLE_DRAWER' })
      expect(store.getState().drawerOpen).toBe(false)
    })

    it('CLOSE_DRAWER sets drawerOpen to false', () => {
      const store = createTestStore({ items: [], drawerOpen: true })

      store.dispatch({ type: 'CLOSE_DRAWER' })

      expect(store.getState().drawerOpen).toBe(false)
    })

    it('OPEN_DRAWER sets drawerOpen to true', () => {
      const store = createTestStore()

      store.dispatch({ type: 'OPEN_DRAWER' })

      expect(store.getState().drawerOpen).toBe(true)
    })
  })

  describe('derived selectors', () => {
    it('cartCount$ emits correct totals', () => {
      const store = createTestStore()
      const result = collectFrom(
        store.select(s => s.items.reduce((sum, i) => sum + i.quantity, 0)),
      )

      store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 1 }), quantity: 2 })
      store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 2 }), quantity: 3 })

      expect(result.values).toEqual([0, 2, 5])
      result.subscription.unsubscribe()
    })

    it('subtotal$ emits correct values', () => {
      const store = createTestStore()
      const result = collectFrom(
        store.select(s =>
          s.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
        ),
      )

      store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 1, price: 10 }), quantity: 2 })
      store.dispatch({ type: 'ADD_TO_CART', product: makeProduct({ id: 2, price: 5 }), quantity: 3 })

      expect(result.values).toEqual([0, 20, 35])
      result.subscription.unsubscribe()
    })
  })
})
