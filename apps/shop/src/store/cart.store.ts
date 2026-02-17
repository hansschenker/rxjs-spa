import { createPersistedStore } from '@rxjs-spa/persist'
import type { Product, CartItem } from '../types'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface CartState {
  items: CartItem[]
  drawerOpen: boolean
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type CartAction =
  | { type: 'ADD_TO_CART'; product: Product; quantity?: number }
  | { type: 'REMOVE_FROM_CART'; productId: number }
  | { type: 'UPDATE_QUANTITY'; productId: number; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'TOGGLE_DRAWER' }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'OPEN_DRAWER' }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const qty = action.quantity ?? 1
      const existing = state.items.find(i => i.product.id === action.product.id)
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.product.id === action.product.id
              ? { ...i, quantity: i.quantity + qty }
              : i
          ),
        }
      }
      return { ...state, items: [...state.items, { product: action.product, quantity: qty }] }
    }
    case 'REMOVE_FROM_CART':
      return { ...state, items: state.items.filter(i => i.product.id !== action.productId) }
    case 'UPDATE_QUANTITY': {
      if (action.quantity <= 0) {
        return { ...state, items: state.items.filter(i => i.product.id !== action.productId) }
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.product.id === action.productId ? { ...i, quantity: action.quantity } : i
        ),
      }
    }
    case 'CLEAR_CART':
      return { ...state, items: [], drawerOpen: false }
    case 'TOGGLE_DRAWER':
      return { ...state, drawerOpen: !state.drawerOpen }
    case 'CLOSE_DRAWER':
      return { ...state, drawerOpen: false }
    case 'OPEN_DRAWER':
      return { ...state, drawerOpen: true }
  }
}

// ---------------------------------------------------------------------------
// Store (persisted to localStorage)
// ---------------------------------------------------------------------------

export const INITIAL_CART_STATE: CartState = { items: [], drawerOpen: false }

export const cartStore = createPersistedStore<CartState, CartAction>(
  cartReducer,
  INITIAL_CART_STATE,
  'rxjs-shop:cart',
  {
    pick: ['items'],
    version: 1,
  },
)
