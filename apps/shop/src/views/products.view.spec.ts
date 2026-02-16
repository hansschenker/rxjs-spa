/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { createMockRouter, createMockStore } from '@rxjs-spa/testing'
import { of } from 'rxjs'
import { productsView } from './products.view'
import { api } from '../api/api'

// Mock the API
vi.mock('../api/api', () => ({
    api: {
        products: {
            list: vi.fn(),
            categories: vi.fn(),
        }
    }
}))

describe('productsView', () => {
    it('correctly filters and unfilters products', async () => {
        // Setup mocks
        const mockProducts = [
            { id: 1, title: 'P1', price: 10, category: 'c1', description: 'd1', image: 'i1', rating: { rate: 5, count: 1 } },
            { id: 2, title: 'P2', price: 20, category: 'c2', description: 'd2', image: 'i2', rating: { rate: 4, count: 1 } },
        ]
        const mockCategories = ['c1', 'c2']

        vi.mocked(api.products.list).mockReturnValue(of(mockProducts))
        vi.mocked(api.products.categories).mockReturnValue(of(mockCategories))

        const router = createMockRouter({ path: '/' })

        // Override navigate
        router.navigate = vi.fn((url: string) => {
            const [path, search] = url.split('?')
            window.history.pushState({}, '', url)

            const query: Record<string, string> = {}
            if (search) {
                new URLSearchParams(search).forEach((v, k) => query[k] = v)
            }

            router.emit({
                path: path || '/',
                query,
                params: {},
                name: 'products'
            })
        })

        const cartStore = createMockStore({ items: [], drawerOpen: false })
        const view = productsView({ router, cartStore })
        const { fragment } = view

        // 1. Initial State
        await new Promise(r => setTimeout(r, 0))
        expect(fragment.querySelectorAll('.product-card').length).toBe(2)

        // 2. Simulate Search that returns nothing
        router.navigate('/?search=missing')
        await new Promise(r => setTimeout(r, 0))
        expect(fragment.querySelectorAll('.product-card').length).toBe(0)

        // 3. Click "All Products"
        const buttons = Array.from(fragment.querySelectorAll('.filters-sidebar button')) as HTMLButtonElement[]
        const allBtn = buttons.find(b => b.textContent?.includes('All Products'))
        expect(allBtn).toBeDefined()
        allBtn?.click()

        // Wait for update
        await new Promise(r => setTimeout(r, 0))

        // IF THE BUG EXISTS (search persists), this will be 0.
        // We expect failure here if my hypothesis is correct.
        expect(fragment.querySelectorAll('.product-card').length).toBe(2)
    })

    it('handles categories with special characters', async () => {
        // Setup mocks
        const mockProducts = [
            { id: 1, title: 'Mens Shirt', price: 10, category: "men's clothing", description: 'd1', image: 'i1', rating: { rate: 5, count: 1 } },
            { id: 2, title: 'Ring', price: 20, category: 'jewelery', description: 'd2', image: 'i2', rating: { rate: 4, count: 1 } },
        ]
        const mockCategories = ["men's clothing", 'jewelery']

        vi.mocked(api.products.list).mockReturnValue(of(mockProducts))
        vi.mocked(api.products.categories).mockReturnValue(of(mockCategories))

        const router = createMockRouter({ path: '/' })

        // Override navigate
        router.navigate = vi.fn((url: string) => {
            const [path, search] = url.split('?')
            window.history.pushState({}, '', url)

            const query: Record<string, string> = {}
            if (search) {
                new URLSearchParams(search).forEach((v, k) => query[k] = v)
            }

            router.emit({
                path: path || '/',
                query,
                params: {},
                name: 'products'
            })
        })

        const cartStore = createMockStore({ items: [], drawerOpen: false })
        const view = productsView({ router, cartStore })
        const { fragment } = view

        // 1. Initial State
        await new Promise(r => setTimeout(r, 0))
        expect(fragment.querySelectorAll('.product-card').length).toBe(2)

        // 2. Select "men's clothing"
        const buttons = Array.from(fragment.querySelectorAll('.filters-sidebar button')) as HTMLButtonElement[]
        const menBtn = buttons.find(b => b.textContent?.includes("men's clothing"))
        expect(menBtn).toBeDefined()
        menBtn?.click()

        // Wait for update
        await new Promise(r => setTimeout(r, 0))

        // Expect 1 product
        expect(fragment.querySelectorAll('.product-card').length).toBe(1)
    })

    it('correctly paginates and displays products', async () => {
        // Generate 6 mock products
        const mockProducts = Array.from({ length: 6 }, (_, i) => ({
            id: i + 1,
            title: `P${i + 1}`,
            price: 10 + i,
            category: 'electronics',
            description: `desc ${i + 1}`,
            image: `img${i + 1}`,
            rating: { rate: 5, count: 1 }
        }))
        const mockCategories = ['electronics']

        vi.mocked(api.products.list).mockReturnValue(of(mockProducts))
        vi.mocked(api.products.categories).mockReturnValue(of(mockCategories))

        const router = createMockRouter({ path: '/' })
        router.navigate = vi.fn((url: string) => {
            const [path, search] = url.split('?')
            window.history.pushState({}, '', url)
            const query: Record<string, string> = {}
            if (search) new URLSearchParams(search).forEach((v, k) => query[k] = v)
            router.emit({ path: path || '/', query, params: {}, name: 'products' })
        })

        const cartStore = createMockStore({ items: [], drawerOpen: false })
        const view = productsView({ router, cartStore })
        const { fragment } = view

        // 1. Initial State (All Products, page 1)
        await new Promise(r => setTimeout(r, 0))
        expect(fragment.querySelectorAll('.product-card').length).toBe(6)

        const info = fragment.querySelector('.results-info')?.textContent
        expect(info).toBe('Showing 1-6 of 6 products')

        // 2. Filter by Electronics
        const elecBtn = (Array.from(fragment.querySelectorAll('.filters-sidebar button')) as HTMLButtonElement[])
            .find(b => b.textContent?.includes('electronics'))
        elecBtn?.click()
        await new Promise(r => setTimeout(r, 0))

        expect(fragment.querySelectorAll('.product-card').length).toBe(6)
        const info2 = fragment.querySelector('.results-info')?.textContent
        expect(info2).toBe('Showing 1-6 of 6 products')
    })
})
