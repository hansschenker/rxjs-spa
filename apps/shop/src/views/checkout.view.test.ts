/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { of, Subject, NEVER } from 'rxjs'
import { createMockRouter, createMockStore } from '@rxjs-spa/testing'
import { checkoutView } from './checkout.view'
import type { Product, CartItem } from '../types'

// Mock @rxjs-spa/http — the checkout view imports http, toRemoteData, isSuccess, isError
vi.mock('@rxjs-spa/http', () => {
  const mockPost = vi.fn()
  return {
    http: {
      get: vi.fn(),
      post: mockPost,
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    toRemoteData: () => (source$: any) => source$.pipe(
      require('rxjs/operators').map((data: any) => ({ status: 'success' as const, data })),
      require('rxjs/operators').startWith({ status: 'loading' as const }),
    ),
    isSuccess: (rd: any) => rd.status === 'success',
    isError: (rd: any) => rd.status === 'error',
    RemoteData: {},
  }
})

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
const flushLong = () => new Promise(r => setTimeout(r, 50))

describe('checkoutView', () => {
  let router: ReturnType<typeof createMockRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    router = createMockRouter({ path: '/checkout' })
  })

  it('shows empty cart message when cart is empty', async () => {
    const cartStore = createMockStore({ items: [], drawerOpen: false })
    const { fragment, sub } = checkoutView({ router, cartStore })

    const emptyMsg = fragment.querySelector('#empty-cart-msg')
    expect(emptyMsg?.classList.contains('hidden')).toBe(false)
    expect(emptyMsg?.textContent).toContain('Your cart is empty')

    sub.unsubscribe()
  })

  it('renders form and order summary when cart has items', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1, title: 'Widget' }, 2)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })

    const form = fragment.querySelector('#checkout-form')
    expect(form).not.toBeNull()

    const summary = fragment.querySelector('.order-summary')
    expect(summary).not.toBeNull()

    sub.unsubscribe()
  })

  it('order summary shows correct item titles, quantities, and total', async () => {
    const cartStore = createMockStore({
      items: [
        makeCartItem({ id: 1, title: 'Widget A', price: 10 }, 2),
        makeCartItem({ id: 2, title: 'Widget B', price: 15 }, 3),
      ],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })

    const summary = fragment.querySelector('.order-summary')!
    expect(summary.textContent).toContain('Widget A')
    expect(summary.textContent).toContain('x2')
    expect(summary.textContent).toContain('$20.00')
    expect(summary.textContent).toContain('Widget B')
    expect(summary.textContent).toContain('x3')
    expect(summary.textContent).toContain('$45.00')
    expect(summary.textContent).toContain('$65.00') // total

    sub.unsubscribe()
  })

  it('submitting empty form shows validation errors for required fields', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    // Submit empty form
    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    // Check that error spans have content for required fields
    const requiredIds = ['firstName', 'lastName', 'email', 'address', 'city', 'state', 'zip', 'cardNumber', 'expiry', 'cvv']
    for (const id of requiredIds) {
      const errorEl = fragment.querySelector(`#error-${id}`)
      expect(errorEl?.textContent?.trim().length, `error for ${id} should be visible`).toBeGreaterThan(0)
    }

    sub.unsubscribe()
  })

  it('phone is optional — no error when empty', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const phoneError = fragment.querySelector('#error-phone')
    expect(phoneError?.textContent?.trim()).toBe('')

    sub.unsubscribe()
  })

  it('email validation shows error for invalid email', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    // Type invalid email
    const emailInput = fragment.querySelector('#field-email') as HTMLInputElement
    emailInput.value = 'not-an-email'
    emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    emailInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    // Submit to trigger validation display
    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const errorEl = fragment.querySelector('#error-email')
    expect(errorEl?.textContent?.trim().length).toBeGreaterThan(0)

    sub.unsubscribe()
  })

  it('ZIP code validation rejects invalid format', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    const zipInput = fragment.querySelector('#field-zip') as HTMLInputElement
    zipInput.value = 'abc'
    zipInput.dispatchEvent(new Event('input', { bubbles: true }))
    zipInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const errorEl = fragment.querySelector('#error-zip')
    expect(errorEl?.textContent?.trim().length).toBeGreaterThan(0)

    sub.unsubscribe()
  })

  it('card number validation rejects non-16-digit values', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    const cardInput = fragment.querySelector('#field-cardNumber') as HTMLInputElement
    cardInput.value = '1234'
    cardInput.dispatchEvent(new Event('input', { bubbles: true }))
    cardInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const errorEl = fragment.querySelector('#error-cardNumber')
    expect(errorEl?.textContent?.trim().length).toBeGreaterThan(0)

    sub.unsubscribe()
  })

  it('expiry validation rejects invalid format', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    const expiryInput = fragment.querySelector('#field-expiry') as HTMLInputElement
    expiryInput.value = '13/99'
    expiryInput.dispatchEvent(new Event('input', { bubbles: true }))
    expiryInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const errorEl = fragment.querySelector('#error-expiry')
    expect(errorEl?.textContent?.trim().length).toBeGreaterThan(0)

    sub.unsubscribe()
  })

  it('CVV validation rejects non-3-or-4-digit values', async () => {
    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    const cvvInput = fragment.querySelector('#field-cvv') as HTMLInputElement
    cvvInput.value = '12'
    cvvInput.dispatchEvent(new Event('input', { bubbles: true }))
    cvvInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const errorEl = fragment.querySelector('#error-cvv')
    expect(errorEl?.textContent?.trim().length).toBeGreaterThan(0)

    sub.unsubscribe()
  })

  it('successful submission dispatches CLEAR_CART', async () => {
    const { http } = await import('@rxjs-spa/http')
    vi.mocked(http.post).mockReturnValue(of({ id: 1 }))

    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1, price: 10 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    // Fill all required fields with valid values
    const fields: Record<string, string> = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      cardNumber: '4111111111111111',
      expiry: '12/25',
      cvv: '123',
    }

    for (const [id, value] of Object.entries(fields)) {
      const input = fragment.querySelector(`#field-${id}`) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    // Submit
    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const clearAction = cartStore.dispatchedActions.find((a: any) => a.type === 'CLEAR_CART')
    expect(clearAction).toBeDefined()

    sub.unsubscribe()
  })

  it('successful submission shows success message and hides form', async () => {
    const { http } = await import('@rxjs-spa/http')
    vi.mocked(http.post).mockReturnValue(of({ id: 1 }))

    const cartStore = createMockStore({
      items: [makeCartItem({ id: 1, price: 10 }, 1)],
      drawerOpen: false,
    })

    const { fragment, sub } = checkoutView({ router, cartStore })
    await flush()

    // Fill valid data
    const fields: Record<string, string> = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      address: '456 Oak Avenue',
      city: 'Boston',
      state: 'MA',
      zip: '02101',
      cardNumber: '4111111111111111',
      expiry: '06/26',
      cvv: '456',
    }

    for (const [id, value] of Object.entries(fields)) {
      const input = fragment.querySelector(`#field-${id}`) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    const form = fragment.querySelector('#checkout-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushLong()

    const successEl = fragment.querySelector('#submit-success')
    expect(successEl?.classList.contains('hidden')).toBe(false)
    expect(form.classList.contains('hidden')).toBe(true)

    sub.unsubscribe()
  })
})
