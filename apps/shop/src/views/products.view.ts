import { Subject, combineLatest } from 'rxjs'
import { map, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators'
import { defineComponent, html, when, list } from '@rxjs-spa/dom'
import { createStore, ofType } from '@rxjs-spa/store'
import { catchAndReport } from '@rxjs-spa/errors'
import { remember } from '@rxjs-spa/core'
import type { Router } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { Product, SortOption } from '../types'
import type { CartState, CartAction } from '../store/cart.store'
import { api } from '../api/api'
import { errorHandler } from '../error-handler'
import { ProductCard } from '../components/product-card'

// ---------------------------------------------------------------------------
// Local store — raw data only
// ---------------------------------------------------------------------------

interface ProductsState {
  allProducts: Product[]
  categories: string[]
  loading: boolean
  error: string | null
}

type ProductsAction =
  | { type: 'FETCH' }
  | { type: 'FETCH_SUCCESS'; products: Product[]; categories: string[] }
  | { type: 'FETCH_ERROR'; error: string }

function productsReducer(state: ProductsState, action: ProductsAction): ProductsState {
  switch (action.type) {
    case 'FETCH':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, allProducts: action.products, categories: action.categories }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error }
  }
}

const INITIAL: ProductsState = { allProducts: [], categories: [], loading: false, error: null }
const PAGE_SIZE = 8

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const productsView = defineComponent<{
  router: Router<any>
  cartStore: Store<CartState, CartAction>
}>(({ router, cartStore }) => {
  const store = createStore<ProductsState, ProductsAction>(productsReducer, INITIAL)

  // ── Effect: FETCH → parallel API calls ──────────────────────────────────
  store.actions$.pipe(
    ofType('FETCH'),
    switchMap(() =>
      combineLatest([
        api.products.list(),
        api.products.categories(),
      ]).pipe(
        map(([products, categories]) => ({
          type: 'FETCH_SUCCESS' as const,
          products,
          categories,
        })),
        catchAndReport<ProductsAction>(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load products' },
          context: 'productsView/FETCH',
        }),
      ),
    ),
  ).subscribe(action => store.dispatch(action))

  store.dispatch({ type: 'FETCH' })

  // ── Query params from router ────────────────────────────────────────────
  const activeCategory$ = router.route$.pipe(
    map((r: any) => (r.query?.category || '') as string),
    distinctUntilChanged(),
  )
  const activeSearch$ = router.route$.pipe(
    map((r: any) => (r.query?.search || '') as string),
    distinctUntilChanged(),
  )
  const activeSort$ = router.route$.pipe(
    map((r: any) => (r.query?.sort || '') as SortOption | ''),
    distinctUntilChanged(),
  )
  const activePage$ = router.route$.pipe(
    map((r: any) => Math.max(1, parseInt(r.query?.page || '1', 10))),
    distinctUntilChanged(),
  )

  // ── Derived: filter + sort + paginate ───────────────────────────────────
  const allProducts$ = store.select(s => s.allProducts)
  const categories$ = store.select(s => s.categories)
  const loading$ = store.select(s => s.loading)
  const error$ = store.select(s => s.error)

  const filteredAndSorted$ = combineLatest([
    allProducts$,
    activeCategory$,
    activeSearch$,
    activeSort$,
  ]).pipe(
    map(([products, category, search, sort]) => {
      let result = products

      if (category) {
        result = result.filter(p => p.category === category)
      }
      if (search) {
        const term = search.toLowerCase()
        result = result.filter(p =>
          p.title.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term)
        )
      }
      switch (sort as SortOption) {
        case 'price-asc': result = [...result].sort((a, b) => a.price - b.price); break
        case 'price-desc': result = [...result].sort((a, b) => b.price - a.price); break
        case 'rating': result = [...result].sort((a, b) => b.rating.rate - a.rating.rate); break
        case 'title': result = [...result].sort((a, b) => a.title.localeCompare(b.title)); break
      }
      return result
    }),
    remember(),
  )

  const totalCount$ = filteredAndSorted$.pipe(map(p => p.length), distinctUntilChanged())
  const totalPages$ = totalCount$.pipe(map(c => Math.max(1, Math.ceil(c / PAGE_SIZE))), distinctUntilChanged())

  const paginatedProducts$ = combineLatest([filteredAndSorted$, activePage$]).pipe(
    map(([products, page]) => {
      const start = (page - 1) * PAGE_SIZE
      return products.slice(start, start + PAGE_SIZE)
    }),
  )

  const showingText$ = combineLatest([activePage$, totalCount$]).pipe(
    map(([page, total]) => {
      const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
      const to = Math.min(page * PAGE_SIZE, total)
      return `Showing ${from}-${to} of ${total} products`
    }),
  )

  const hasError$ = error$.pipe(map(e => e !== null))
  const noResults$ = combineLatest([loading$, totalCount$]).pipe(
    map(([loading, count]) => !loading && count === 0),
  )

  // ── Query helpers ───────────────────────────────────────────────────────
  function buildQueryString(updates: Record<string, string | undefined>): string {
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(updates)) {
      if (value && value.length > 0) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return qs ? `/?${qs}` : '/'
  }

  function setCategory(category: string) {
    router.navigate(buildQueryString({ category: category || undefined, page: undefined }))
  }
  function setSort(sort: string) {
    router.navigate(buildQueryString({ sort: sort || undefined, page: undefined }))
  }
  function setPage(page: number) {
    router.navigate(buildQueryString({ page: page > 1 ? String(page) : undefined }))
  }

  function resetFilters() {
    router.navigate(router.link('/'))
  }

  // Debounced search
  const searchInput$ = new Subject<string>()
  searchInput$.pipe(debounceTime(300)).subscribe(term => {
    router.navigate(buildQueryString({ search: term || undefined, page: undefined }))
  })

  // ── Pagination ──────────────────────────────────────────────────────────
  const pageNumbers$ = totalPages$.pipe(
    map(total => {
      const pages: { num: number; id: string }[] = []
      for (let i = 1; i <= total; i++) pages.push({ num: i, id: `p${i}` })
      return pages
    }),
  )

  let currentPage = 1
  activePage$.subscribe(p => { currentPage = p })

  const hasPrev$ = activePage$.pipe(map(p => p > 1))
  const hasNext$ = combineLatest([activePage$, totalPages$]).pipe(
    map(([c, t]) => c < t),
  )

  // ── Sub-templates (split to keep each html call small) ─────────────────

  const toolbar = html`<div class="catalog-toolbar"><input type="search" class="search-input" placeholder="Search products..." @input=${(e: Event) => searchInput$.next((e.target as HTMLInputElement).value)} /><select class="sort-select" @change=${(e: Event) => setSort((e.target as HTMLSelectElement).value)}><option value="">Sort by</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option><option value="rating">Best Rating</option><option value="title">Name A-Z</option></select></div>`

  const sidebar = html`<aside class="filters-sidebar"><h3>Categories</h3><button class="filter-btn" @click=${() => resetFilters()}>All Products</button>${list(categories$, (c) => c, (cat$) => {
    let currentCat = ''
    cat$.subscribe(c => { currentCat = c })
    return html`<button class="${activeCategory$.pipe(map(active => 'filter-btn' + (active === currentCat ? ' active' : '')))}" @click=${() => setCategory(currentCat)}>${cat$}</button>`
  })}</aside>`

  const resultsInfo = html`<div class="results-info">${showingText$}</div>`

  const pagination = html`<nav class="pagination"><button class="btn btn-outline btn-sm" ?disabled=${hasPrev$.pipe(map(h => !h))} @click=${() => setPage(currentPage - 1)}>Prev</button>${list(pageNumbers$, p => p.id, (page$) => {
    let pageNum = 1
    page$.subscribe(p => { pageNum = p.num })
    const isActive$ = page$.pipe(
      switchMap(p => activePage$.pipe(map(c => c === p.num))),
    )
    return html`<button class="${isActive$.pipe(map(a => 'btn btn-sm' + (a ? ' btn-primary' : ' btn-outline')))}" @click=${() => setPage(pageNum)}>${page$.pipe(map(p => String(p.num)))}</button>`
  })}<button class="btn btn-outline btn-sm" ?disabled=${hasNext$.pipe(map(h => !h))} @click=${() => setPage(currentPage + 1)}>Next</button></nav>`

  const catalogMain = html`<div class="catalog-main">${when(loading$, () => html`<div class="loading-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>`)}\n${when(hasError$, () => html`<div class="error-banner"><p>${error$.pipe(map(e => e ?? ''))}</p><button class="btn btn-primary" @click=${() => store.dispatch({ type: 'FETCH' })}>Retry</button></div>`)}\n${when(noResults$, () => html`<div class="no-results"><p>No products found matching your criteria.</p><button class="btn btn-outline" @click=${() => router.navigate('/')}>Clear filters</button></div>`)}<div class="product-grid">${list(paginatedProducts$, p => String(p.id), (product$) =>
    ProductCard({
      product$,
      onAddToCart: (product: Product) => {
        cartStore.dispatch({ type: 'ADD_TO_CART', product })
        cartStore.dispatch({ type: 'OPEN_DRAWER' })
      },
    })
  )}</div>${resultsInfo}${pagination}</div>`

  // ── Root render ─────────────────────────────────────────────────────────
  return html`<section class="view products-view"><div class="catalog-header"><h1>Product Catalog</h1>${toolbar}</div><div class="catalog-layout">${sidebar}${catalogMain}</div></section>`
})
