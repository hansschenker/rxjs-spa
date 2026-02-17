/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRouter, createMockStore } from '@rxjs-spa/testing'
import { of, throwError } from 'rxjs'
import { productDetailView } from './product-detail.view'
import { api } from '../api/api'
import type { Product } from '../types'

vi.mock('../api/api', () => ({
  api: {
    products: {
      get: vi.fn(),
    },
  },
}))

vi.mock('../error-handler', () => ({
  errorHandler: {
    errors$: of(),
    reportError: vi.fn(),
  },
}))

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 42,
    title: 'Wireless Headphones',
    price: 59.99,
    description: 'Great sound quality headphones',
    category: 'electronics',
    image: 'https://example.com/headphones.jpg',
    rating: { rate: 4.5, count: 200 },
    ...overrides,
  }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('productDetailView', () => {
  let router: ReturnType<typeof createMockRouter>
  let cartStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    vi.clearAllMocks()
    router = createMockRouter({ path: '/product/42', params: { id: '42' }, query: {}, name: 'product-detail' as any })
    cartStore = createMockStore({ items: [], drawerOpen: false })
  })

  it('renders product details after fetch success', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    expect(fragment.querySelector('.product-detail-title')?.textContent).toContain('Wireless Headphones')
    expect(fragment.querySelector('.product-detail-price')?.textContent).toContain('$59.99')
    expect(fragment.querySelector('.product-category-badge')?.textContent).toContain('electronics')
    expect(fragment.querySelector('.product-description')?.textContent).toContain('Great sound quality')

    sub.unsubscribe()
  })

  it('renders product image with correct src', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const img = fragment.querySelector<HTMLImageElement>('.product-detail-image')
    expect(img?.src).toContain('headphones.jpg')

    sub.unsubscribe()
  })

  it('renders star rating', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct({ rating: { rate: 4.5, count: 50 } })))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const stars = fragment.querySelector('.stars')?.textContent ?? ''
    expect(stars).toContain('\u2605') // full star
    expect(fragment.querySelector('.rating-text')?.textContent).toContain('4.5')
    expect(fragment.querySelector('.rating-text')?.textContent).toContain('50')

    sub.unsubscribe()
  })

  it('renders error banner when fetch fails', async () => {
    vi.mocked(api.products.get).mockReturnValue(throwError(() => new Error('Network error')))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const errorBanner = fragment.querySelector('.error-banner')
    expect(errorBanner).not.toBeNull()

    sub.unsubscribe()
  })

  it('quantity defaults to 1', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const qtyValue = fragment.querySelector('.quantity-value')?.textContent
    expect(qtyValue).toBe('1')

    sub.unsubscribe()
  })

  it('increment button increases quantity', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const buttons = fragment.querySelectorAll('.quantity-control button')
    const plusBtn = buttons[1] as HTMLButtonElement // second button is +
    plusBtn.click()
    await flush()

    expect(fragment.querySelector('.quantity-value')?.textContent).toBe('2')

    sub.unsubscribe()
  })

  it('decrement button decreases quantity but clamps to 1', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    // First increment to 2
    const buttons = fragment.querySelectorAll('.quantity-control button')
    const plusBtn = buttons[1] as HTMLButtonElement
    const minusBtn = buttons[0] as HTMLButtonElement
    plusBtn.click()
    await flush()
    expect(fragment.querySelector('.quantity-value')?.textContent).toBe('2')

    // Decrement to 1
    minusBtn.click()
    await flush()
    expect(fragment.querySelector('.quantity-value')?.textContent).toBe('1')

    // Try to go below 1 — should stay at 1
    minusBtn.click()
    await flush()
    expect(fragment.querySelector('.quantity-value')?.textContent).toBe('1')

    sub.unsubscribe()
  })

  it('total price updates when quantity changes', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct({ price: 25 })))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    expect(fragment.querySelector('.quantity-total')?.textContent).toBe('$25.00')

    const plusBtn = fragment.querySelectorAll('.quantity-control button')[1] as HTMLButtonElement
    plusBtn.click()
    await flush()

    expect(fragment.querySelector('.quantity-total')?.textContent).toBe('$50.00')

    sub.unsubscribe()
  })

  it('Add to Cart dispatches ADD_TO_CART with correct product and quantity', async () => {
    const product = makeProduct()
    vi.mocked(api.products.get).mockReturnValue(of(product))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    // Increment quantity to 2
    const plusBtn = fragment.querySelectorAll('.quantity-control button')[1] as HTMLButtonElement
    plusBtn.click()
    await flush()

    // Click Add to Cart
    const addBtn = fragment.querySelector('.btn-add-to-cart') as HTMLButtonElement
    addBtn.click()

    const addAction = cartStore.dispatchedActions.find((a: any) => a.type === 'ADD_TO_CART') as any
    expect(addAction).toBeDefined()
    expect(addAction.product.id).toBe(42)
    expect(addAction.quantity).toBe(2)

    sub.unsubscribe()
  })

  it('Add to Cart also dispatches OPEN_DRAWER', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const addBtn = fragment.querySelector('.btn-add-to-cart') as HTMLButtonElement
    addBtn.click()

    const openAction = cartStore.dispatchedActions.find((a: any) => a.type === 'OPEN_DRAWER')
    expect(openAction).toBeDefined()

    sub.unsubscribe()
  })

  it('back to catalog link points to /', async () => {
    vi.mocked(api.products.get).mockReturnValue(of(makeProduct()))

    const { fragment, sub } = productDetailView({ router, cartStore, params: { id: '42' } })
    await flush()

    const backLink = fragment.querySelector('.back-link') as HTMLAnchorElement
    expect(backLink.getAttribute('href')).toBe('/')

    sub.unsubscribe()
  })
})
