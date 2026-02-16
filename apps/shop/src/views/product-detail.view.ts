import { combineLatest } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { defineComponent, html, when } from '@rxjs-spa/dom'
import { createStore, ofType } from '@rxjs-spa/store'
import { catchAndReport } from '@rxjs-spa/errors'
import type { Router, RouteParams } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { Product } from '../types'
import type { CartState, CartAction } from '../store/cart.store'
import { api } from '../api/api'
import { errorHandler } from '../error-handler'

// ---------------------------------------------------------------------------
// Local store
// ---------------------------------------------------------------------------

interface ProductDetailState {
  product: Product | null
  loading: boolean
  error: string | null
  selectedQuantity: number
}

type ProductDetailAction =
  | { type: 'FETCH'; productId: string }
  | { type: 'FETCH_SUCCESS'; product: Product }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_QUANTITY'; quantity: number }

function reducer(state: ProductDetailState, action: ProductDetailAction): ProductDetailState {
  switch (action.type) {
    case 'FETCH':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, product: action.product }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error }
    case 'SET_QUANTITY':
      return { ...state, selectedQuantity: Math.max(1, action.quantity) }
  }
}

const INITIAL: ProductDetailState = {
  product: null,
  loading: false,
  error: null,
  selectedQuantity: 1,
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const productDetailView = defineComponent<{
  router: Router<any>
  cartStore: Store<CartState, CartAction>
  params: RouteParams
}>(({ router, cartStore, params }) => {
  const store = createStore<ProductDetailState, ProductDetailAction>(reducer, INITIAL)

  // ── Effect ──────────────────────────────────────────────────────────────
  store.actions$.pipe(
    ofType('FETCH'),
    switchMap(({ productId }) =>
      api.products.get(productId).pipe(
        map(product => ({ type: 'FETCH_SUCCESS' as const, product })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load product' },
          context: 'productDetailView/FETCH',
        }),
      ),
    ),
  ).subscribe(action => store.dispatch(action))

  if (params.id) {
    store.dispatch({ type: 'FETCH', productId: params.id })
  }

  // ── Selectors ───────────────────────────────────────────────────────────
  const loading$ = store.select(s => s.loading)
  const hasProduct$ = store.select(s => s.product !== null)
  const product$ = store.select(s => s.product)
  const quantity$ = store.select(s => s.selectedQuantity)
  const error$ = store.select(s => s.error)
  const hasError$ = error$.pipe(map(e => e !== null))

  const title$ = product$.pipe(map(p => p?.title ?? ''))
  const price$ = product$.pipe(map(p => p ? `$${p.price.toFixed(2)}` : ''))
  const image$ = product$.pipe(map(p => p?.image ?? ''))
  const category$ = product$.pipe(map(p => p?.category ?? ''))
  const description$ = product$.pipe(map(p => p?.description ?? ''))
  const rate$ = product$.pipe(map(p => p?.rating.rate ?? 0))
  const rateCount$ = product$.pipe(map(p => p?.rating.count ?? 0))

  const stars$ = rate$.pipe(
    map(rate => {
      const full = Math.floor(rate)
      const half = rate - full >= 0.5 ? 1 : 0
      const empty = 5 - full - half
      return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(empty)
    }),
  )

  const totalPrice$ = combineLatest([product$, quantity$]).pipe(
    map(([p, q]) => p ? `$${(p.price * q).toFixed(2)}` : ''),
  )

  let currentQuantity = 1
  quantity$.subscribe(q => { currentQuantity = q })

  function handleAddToCart() {
    const product = store.getState().product
    if (product) {
      cartStore.dispatch({ type: 'ADD_TO_CART', product, quantity: currentQuantity })
      cartStore.dispatch({ type: 'OPEN_DRAWER' })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return html`
    <section class="view product-detail-view">
      <a href="${router.link('/')}" class="back-link">← Back to catalog</a>

      ${when(loading$, () => html`<div class="loading-msg">Loading product...</div>`)}
      ${when(hasError$, () => html`
        <div class="error-banner">
          <p>${error$.pipe(map(e => e ?? ''))}</p>
          <a href="${router.link('/')}" class="btn btn-primary">Back to catalog</a>
        </div>
      `)}
      ${when(hasProduct$, () => html`
        <div class="product-detail-layout">
          <div class="product-image-wrap">
            <img class="product-detail-image" src="${image$}" alt="${title$}" />
          </div>
          <div class="product-info">
            <span class="product-category-badge">${category$}</span>
            <h1 class="product-detail-title">${title$}</h1>
            <div class="product-detail-price">${price$}</div>
            <div class="star-rating">
              <span class="stars">${stars$}</span>
              <span class="rating-text">${rate$} (${rateCount$} reviews)</span>
            </div>
            <p class="product-description">${description$}</p>

            <div class="quantity-control">
              <button class="btn btn-outline btn-sm" @click=${() => store.dispatch({ type: 'SET_QUANTITY', quantity: currentQuantity - 1 })}>-</button>
              <span class="quantity-value">${quantity$}</span>
              <button class="btn btn-outline btn-sm" @click=${() => store.dispatch({ type: 'SET_QUANTITY', quantity: currentQuantity + 1 })}>+</button>
              <span class="quantity-total">${totalPrice$}</span>
            </div>

            <button class="btn btn-primary btn-lg btn-add-to-cart" @click=${handleAddToCart}>
              Add to Cart
            </button>
          </div>
        </div>
      `)}
    </section>
  `
})
