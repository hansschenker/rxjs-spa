/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Subscription } from 'rxjs'
import { createMockRouter } from '@rxjs-spa/testing'

// Use vi.hoisted so the mock store is available when vi.mock factories run
const { mockCartStore } = vi.hoisted(() => {
  // Inline a minimal mock store since we can't import @rxjs-spa/testing here
  const { BehaviorSubject, Subject } = require('rxjs')
  const { map, distinctUntilChanged, shareReplay } = require('rxjs/operators')

  const state$$ = new BehaviorSubject({ items: [], drawerOpen: false })
  const actions$$ = new Subject()
  const dispatchedActions: any[] = []

  return {
    mockCartStore: {
      state$: state$$.asObservable().pipe(shareReplay(1)),
      actions$: actions$$.asObservable(),
      dispatch: (action: any) => {
        dispatchedActions.push(action)
        actions$$.next(action)
      },
      select: (fn: any) => state$$.pipe(map(fn), distinctUntilChanged()),
      getState: () => state$$.getValue(),
      setState: (s: any) => state$$.next(s),
      dispatchedActions,
    },
  }
})

vi.mock('./store/cart.store', () => ({
  cartStore: mockCartStore,
}))

vi.mock('./views/products.view', () => ({
  productsView: () => {
    const el = document.createElement('div')
    el.textContent = 'products'
    const f = document.createDocumentFragment()
    f.appendChild(el)
    return { fragment: f, sub: new Subscription(), strings: [] as any, values: [] }
  },
}))
vi.mock('./views/product-detail.view', () => ({
  productDetailView: () => {
    const el = document.createElement('div')
    el.textContent = 'product-detail'
    const f = document.createDocumentFragment()
    f.appendChild(el)
    return { fragment: f, sub: new Subscription(), strings: [] as any, values: [] }
  },
}))
vi.mock('./views/cart.view', () => ({
  cartView: () => {
    const el = document.createElement('div')
    el.textContent = 'cart'
    const f = document.createDocumentFragment()
    f.appendChild(el)
    return { fragment: f, sub: new Subscription(), strings: [] as any, values: [] }
  },
}))
vi.mock('./views/checkout.view', () => ({
  checkoutView: () => {
    const el = document.createElement('div')
    el.textContent = 'checkout'
    const f = document.createDocumentFragment()
    f.appendChild(el)
    return { fragment: f, sub: new Subscription(), strings: [] as any, values: [] }
  },
}))
vi.mock('./views/not-found.view', () => ({
  notFoundView: () => {
    const el = document.createElement('div')
    el.textContent = 'not-found'
    const f = document.createDocumentFragment()
    f.appendChild(el)
    return { fragment: f, sub: new Subscription(), strings: [] as any, values: [] }
  },
}))

import { App } from './App'

const flush = () => new Promise(r => setTimeout(r, 0))

describe('App shell', () => {
  let router: ReturnType<typeof createMockRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    mockCartStore.setState({ items: [], drawerOpen: false })
    mockCartStore.dispatchedActions.length = 0
    router = createMockRouter({ name: 'products' as any, path: '/', params: {}, query: {} })
  })

  it('renders nav bar with brand, Products, and Cart links', async () => {
    const { fragment, sub } = App({ router })
    await flush()

    const nav = fragment.querySelector('.shop-nav')
    expect(nav).not.toBeNull()

    const brand = fragment.querySelector('.nav-brand') as HTMLAnchorElement
    expect(brand).not.toBeNull()
    expect(brand.textContent).toContain('RxJS Shop')

    const links = fragment.querySelectorAll('.nav-links a')
    expect(links.length).toBe(2)
    expect(links[0].textContent).toContain('Products')
    expect(links[1].textContent).toContain('Cart')

    sub.unsubscribe()
  })

  it('cart badge is hidden when cart is empty', async () => {
    const { fragment, sub } = App({ router })
    await flush()

    const badge = fragment.querySelector('.cart-badge')
    expect(badge).toBeNull()

    sub.unsubscribe()
  })

  it('cart badge shows count when cart has items', async () => {
    mockCartStore.setState({
      items: [
        {
          product: { id: 1, title: 'P', price: 10, description: '', category: '', image: '', rating: { rate: 0, count: 0 } },
          quantity: 3,
        },
      ],
      drawerOpen: false,
    })

    const { fragment, sub } = App({ router })
    await flush()

    const badge = fragment.querySelector('.cart-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('3')

    sub.unsubscribe()
  })

  it('cart toggle button text includes count', async () => {
    const { fragment, sub } = App({ router })
    await flush()

    const toggleBtn = fragment.querySelector('.cart-toggle') as HTMLButtonElement
    expect(toggleBtn).not.toBeNull()
    expect(toggleBtn.textContent).toContain('Cart')

    sub.unsubscribe()
  })

  it('dispatches CLOSE_DRAWER on route change', async () => {
    const { fragment, sub } = App({ router })
    await flush()

    mockCartStore.dispatchedActions.length = 0

    router.emit({ name: 'cart' as any, path: '/cart', params: {}, query: {} })
    await flush()

    const closeAction = mockCartStore.dispatchedActions.find(
      (a: any) => a.type === 'CLOSE_DRAWER',
    )
    expect(closeAction).toBeDefined()

    sub.unsubscribe()
  })
})
