/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { BehaviorSubject } from 'rxjs'
import { createLiveValue } from '@rxjs-spa/dom'
import { ProductCard } from './product-card'
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

describe('ProductCard', () => {
  it('renders product title, price, image, and category', async () => {
    const product$ = createLiveValue(new BehaviorSubject(makeProduct()))
    const onAddToCart = vi.fn()

    const { fragment, sub } = ProductCard({ product$, onAddToCart })
    await new Promise(r => setTimeout(r, 0))

    const el = fragment.querySelector('.product-card') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.querySelector('.product-card-title')?.textContent).toContain('Test Product')
    expect(el.querySelector('.product-card-price')?.textContent).toContain('$29.99')
    expect(el.querySelector('.product-card-category')?.textContent).toContain('electronics')
    expect(el.querySelector<HTMLImageElement>('.product-card-image')?.src).toContain('example.com/img.jpg')

    sub.unsubscribe()
  })

  it('calls onAddToCart callback with the product when button is clicked', async () => {
    const product = makeProduct()
    const product$ = createLiveValue(new BehaviorSubject(product))
    const onAddToCart = vi.fn()

    const { fragment, sub } = ProductCard({ product$, onAddToCart })
    await new Promise(r => setTimeout(r, 0))

    const btn = fragment.querySelector('button') as HTMLButtonElement
    btn.click()

    expect(onAddToCart).toHaveBeenCalledOnce()
    expect(onAddToCart).toHaveBeenCalledWith(product)

    sub.unsubscribe()
  })

  it('updates rendered content when product$ emits a new value', async () => {
    const subject = new BehaviorSubject(makeProduct({ title: 'First', price: 10 }))
    const product$ = createLiveValue(subject)
    const onAddToCart = vi.fn()

    const { fragment, sub } = ProductCard({ product$, onAddToCart })
    await new Promise(r => setTimeout(r, 0))

    expect(fragment.querySelector('.product-card-title')?.textContent).toContain('First')
    expect(fragment.querySelector('.product-card-price')?.textContent).toContain('$10.00')

    subject.next(makeProduct({ title: 'Second', price: 25.5 }))
    await new Promise(r => setTimeout(r, 0))

    expect(fragment.querySelector('.product-card-title')?.textContent).toContain('Second')
    expect(fragment.querySelector('.product-card-price')?.textContent).toContain('$25.50')

    sub.unsubscribe()
  })
})
