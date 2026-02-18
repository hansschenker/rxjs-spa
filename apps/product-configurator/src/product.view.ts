import { combineLatest, of, timer } from 'rxjs'
import { map, switchMap, take } from 'rxjs/operators'
import { defineComponent, html, when, list } from '@rxjs-spa/dom'
import { ofType } from '@rxjs-spa/store'
import { createPersistedStore } from '@rxjs-spa/persist'
import {
  PRODUCT, COLORS, SIZES, ADDONS, REVIEWS, SPECS, GALLERY_VIEWS,
} from './data'
import type { TemplateResult } from '@rxjs-spa/dom'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Tab = 'gallery' | 'specs' | 'reviews'

interface CartItem {
  id:         string   // stable key for keyed list + removal
  configKey:  string   // duplicate-detection: colorId|sizeId|sortedAddonIds
  colorName:  string
  sizeName:   string
  addonNames: string[]
  qty:        number
  unitPrice:  number
}

let _cartItemSeq = 0
const nextCartId = () => `ci-${++_cartItemSeq}`

interface ProductState {
  selectedColorId:  string
  selectedSizeId:   string
  selectedAddonIds: string[]
  activeTab:        Tab
  quantity:         number
  addedToCart:      boolean
  activeImageIndex: number
  cartItems:        CartItem[]
}

type ProductAction =
  | { type: 'SELECT_COLOR';  colorId: string }
  | { type: 'SELECT_SIZE';   sizeId:  string }
  | { type: 'TOGGLE_ADDON';  addonId: string }
  | { type: 'SET_TAB';       tab: Tab }
  | { type: 'INC_QTY' }
  | { type: 'DEC_QTY' }
  | { type: 'ADD_TO_CART' }
  | { type: 'RESET_CART' }
  | { type: 'REMOVE_FROM_CART';  itemId: string }
  | { type: 'UPDATE_CART_QTY';   itemId: string; delta: number }
  | { type: 'SET_IMAGE';         index: number }

const INITIAL: ProductState = {
  selectedColorId:  'black',
  selectedSizeId:   'standard',
  selectedAddonIds: [],
  activeTab:        'gallery',
  quantity:         1,
  addedToCart:      false,
  activeImageIndex: 0,
  cartItems:        [],
}

function reducer(state: ProductState, action: ProductAction): ProductState {
  switch (action.type) {
    case 'SELECT_COLOR':
      return { ...state, selectedColorId: action.colorId, addedToCart: false }
    case 'SELECT_SIZE':
      return { ...state, selectedSizeId: action.sizeId, addedToCart: false }
    case 'TOGGLE_ADDON': {
      const ids = state.selectedAddonIds
      const idx = ids.indexOf(action.addonId)
      return {
        ...state,
        selectedAddonIds: idx === -1
          ? [...ids, action.addonId]
          : ids.filter(id => id !== action.addonId),
        addedToCart: false,
      }
    }
    case 'SET_TAB':
      return { ...state, activeTab: action.tab }
    case 'INC_QTY':
      return { ...state, quantity: Math.min(state.quantity + 1, 10) }
    case 'DEC_QTY':
      return { ...state, quantity: Math.max(state.quantity - 1, 1) }
    case 'ADD_TO_CART': {
      const color    = COLORS.find(c => c.id === state.selectedColorId)
      const size     = SIZES.find(s => s.id === state.selectedSizeId)
      const addonSum = state.selectedAddonIds.reduce((sum, id) => {
        const a = ADDONS.find(x => x.id === id)
        return sum + (a?.price ?? 0)
      }, 0)
      const configKey = [
        state.selectedColorId,
        state.selectedSizeId,
        [...state.selectedAddonIds].sort().join(','),
      ].join('|')

      // Duplicate detection — same config? just increment qty
      const existing = state.cartItems.find(i => i.configKey === configKey)
      if (existing) {
        return {
          ...state,
          addedToCart: true,
          cartItems: state.cartItems.map(i =>
            i.id === existing.id
              ? { ...i, qty: Math.min(i.qty + state.quantity, 10) }
              : i,
          ),
        }
      }

      const newItem: CartItem = {
        id:         nextCartId(),
        configKey,
        colorName:  color?.name ?? '',
        sizeName:   size?.name ?? '',
        addonNames: state.selectedAddonIds.map(id => ADDONS.find(a => a.id === id)?.name ?? id),
        qty:        state.quantity,
        unitPrice:  PRODUCT.basePrice + (size?.priceAdd ?? 0) + addonSum,
      }
      return { ...state, addedToCart: true, cartItems: [...state.cartItems, newItem] }
    }
    case 'RESET_CART':
      return { ...state, addedToCart: false }   // cartItems persist!
    case 'REMOVE_FROM_CART':
      return { ...state, cartItems: state.cartItems.filter(i => i.id !== action.itemId) }
    case 'UPDATE_CART_QTY':
      return {
        ...state,
        cartItems: state.cartItems.map(i =>
          i.id === action.itemId
            ? { ...i, qty: Math.max(1, Math.min(i.qty + action.delta, 10)) }
            : i,
        ),
      }
    case 'SET_IMAGE':
      return { ...state, activeImageIndex: action.index }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStars(rating: number): TemplateResult {
  const full  = Math.floor(rating)
  const half  = rating - full >= 0.5 ? 1 : 0
  const empty = 5 - full - half
  const s = '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
  return html`<span class="stars" title="${rating} out of 5">${s}</span>`
}

function headphoneSvg(): TemplateResult {
  return html`
    <svg class="product-svg" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 56 C14 16 106 16 106 56"
            fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
      <line x1="14" y1="56" x2="14" y2="68"
            stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
      <line x1="106" y1="56" x2="106" y2="68"
            stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
      <rect x="4"   y="62" width="22" height="30" rx="9" fill="currentColor"/>
      <rect x="94"  y="62" width="22" height="30" rx="9" fill="currentColor"/>
      <rect x="9"   y="67" width="12" height="20" rx="5" fill="currentColor" opacity="0.28"/>
      <rect x="99"  y="67" width="12" height="20" rx="5" fill="currentColor" opacity="0.28"/>
    </svg>
  `
}

function gradientFor(hex: string, angle: number): string {
  return `linear-gradient(${angle}deg, ${hex}ee 0%, ${hex}88 55%, ${hex}33 100%)`
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const productView = defineComponent<Record<string, never>>((_props) => {
  const store = createPersistedStore<ProductState, ProductAction>(
    reducer, INITIAL, 'sfp:cart',
    { pick: ['cartItems'], version: 1 },
  )

  // ── Effect: auto-reset "Added to Cart" after 2 s ────────────────────────
  store.actions$.pipe(
    ofType('ADD_TO_CART'),
    switchMap(() => timer(2000).pipe(
      take(1),
      map(() => ({ type: 'RESET_CART' as const })),
    )),
  ).subscribe(store.dispatch)

  // ── Derived state ────────────────────────────────────────────────────────

  const selectedColor$ = store.select(s =>
    COLORS.find(c => c.id === s.selectedColorId) ?? COLORS[0]
  )

  const selectedSize$ = store.select(s =>
    SIZES.find(sz => sz.id === s.selectedSizeId) ?? SIZES[0]
  )

  const activeImageIndex$ = store.select(s => s.activeImageIndex)
  const activeTab$        = store.select(s => s.activeTab)
  const quantity$         = store.select(s => s.quantity)
  const addedToCart$      = store.select(s => s.addedToCart)

  const cartItems$  = store.select(s => s.cartItems)
  const cartCount$  = cartItems$.pipe(map(items => items.reduce((n, i) => n + i.qty, 0)))
  const cartTotal$  = cartItems$.pipe(map(items => items.reduce((s, i) => s + i.qty * i.unitPrice, 0)))
  const hasCart$    = cartCount$.pipe(map(n => n > 0))

  const totalPrice$ = combineLatest([selectedSize$, store.select(s => s.selectedAddonIds)]).pipe(
    map(([size, addonIds]) => {
      const sizeAdd    = size?.priceAdd ?? 0
      const addonTotal = addonIds.reduce((sum, id) => {
        const a = ADDONS.find(x => x.id === id)
        return sum + (a?.price ?? 0)
      }, 0)
      return PRODUCT.basePrice + sizeAdd + addonTotal
    }),
  )

  const priceString$ = totalPrice$.pipe(map(p => `$${p}`))

  const availability$ = selectedColor$.pipe(
    map(color => {
      if (!color)                           return { text: 'Select a color',   cls: 'avail-unknown' }
      if (color.stock === 'out-of-stock')   return { text: 'Out of Stock',     cls: 'avail-out' }
      if (color.stock === 'limited')        return { text: `Only ${color.stockCount} left!`, cls: 'avail-limited' }
      return                                       { text: 'In Stock',         cls: 'avail-in' }
    }),
  )

  const availabilityText$  = availability$.pipe(map(a => a.text))
  const availabilityClass$ = availability$.pipe(map(a => `availability ${a.cls}`))

  const canAddToCart$ = selectedColor$.pipe(
    map(color => !!color && color.stock !== 'out-of-stock'),
  )

  const addToCartLabel$ = combineLatest([addedToCart$, cartCount$]).pipe(
    map(([added, count]) => {
      if (added)    return '✓ Added to Cart!'
      if (count > 0) return `Add to Cart · ${count} in cart`
      return 'Add to Cart'
    }),
  )

  const addToCartClass$ = combineLatest([canAddToCart$, addedToCart$]).pipe(
    map(([can, added]) => {
      if (added) return 'btn-cart btn-cart--added'
      if (!can)  return 'btn-cart btn-cart--disabled'
      return 'btn-cart'
    }),
  )

  // Main image gradient reacts to both color and active thumbnail index
  const imageGradient$ = combineLatest([selectedColor$, activeImageIndex$]).pipe(
    map(([color, idx]) => {
      const hex    = color?.hex ?? '#6366f1'
      const angles = [135, 45, 90, 160, 120]
      return gradientFor(hex, angles[idx % angles.length])
    }),
  )

  // ── Tab helpers ──────────────────────────────────────────────────────────

  const tabClass = (tab: Tab) =>
    activeTab$.pipe(map(t => t === tab ? 'tab-btn tab-btn--active' : 'tab-btn'))

  const galleryVisible$  = activeTab$.pipe(map(t => t === 'gallery'))
  const specsVisible$    = activeTab$.pipe(map(t => t === 'specs'))
  const reviewsVisible$  = activeTab$.pipe(map(t => t === 'reviews'))

  // ── Gallery tab items — react to color selection ─────────────────────────

  const galleryItems$ = selectedColor$.pipe(
    map(color => GALLERY_VIEWS.map((view, idx) => ({
      ...view, idx,
      hex: color?.hex ?? '#6366f1',
    }))),
  )

  const galleryTabFn = () => html`
    <div class="gallery-grid">
      ${list(
        galleryItems$,
        item => String(item.idx),
        (item$) => {
          const angles  = [135, 45, 90, 160, 120]
          const grad$   = item$.pipe(map(i => gradientFor(i.hex, angles[i.idx])))
          const angle$  = item$.pipe(map(i => i.angle))
          return html`
            <div class="gallery-grid__item">
              <div class="gallery-mock" style="background: ${grad$}">
                ${headphoneSvg()}
              </div>
              <span class="gallery-grid__label">${angle$}</span>
            </div>
          `
        },
      )}
    </div>
  `

  // ── Specs tab — nested list ──────────────────────────────────────────────

  const specsTabFn = () => html`
    <div class="specs-panel">
      ${list(
        of(SPECS),
        group => group.category,
        (group$) => html`
          <div class="spec-group">
            <h3 class="spec-group__title">${group$.pipe(map(g => g.category))}</h3>
            <table class="spec-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Standard</th>
                  <th>Pro</th>
                </tr>
              </thead>
              <tbody>
                ${list(
                  group$.pipe(map(g => g.rows)),
                  (row, i) => String(i),
                  (row$) => html`
                    <tr>
                      <td class="spec-label">${row$.pipe(map(r => r.label))}</td>
                      <td>${row$.pipe(map(r => r.standard))}</td>
                      <td>${row$.pipe(map(r => r.pro))}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `,
      )}
    </div>
  `

  // ── Reviews tab ──────────────────────────────────────────────────────────

  const reviewsTabFn = () => html`
    <div class="reviews-panel">
      <div class="reviews-summary">
        <div class="reviews-summary__score">${PRODUCT.rating.toFixed(1)}</div>
        <div>
          <div class="reviews-summary__stars">${renderStars(PRODUCT.rating)}</div>
          <div class="reviews-summary__count">Based on ${PRODUCT.reviewCount} reviews</div>
        </div>
      </div>
      <div class="review-list">
        ${list(
          of(REVIEWS),
          r => r.id,
          (review$) => {
            const author$   = review$.pipe(map(r => r.author))
            const avatar$   = review$.pipe(map(r => r.avatar))
            const title$    = review$.pipe(map(r => r.title))
            const body$     = review$.pipe(map(r => r.body))
            const date$     = review$.pipe(map(r => r.date))
            const verified$ = review$.pipe(map(r => r.verified))
            const stars$    = review$.pipe(map(r => renderStars(r.rating)))
            return html`
              <div class="review-card">
                <div class="review-card__header">
                  <div class="review-avatar">${avatar$}</div>
                  <span class="review-card__author">${author$}</span>
                  ${when(verified$, () => html`
                    <span class="verified-badge">✓ Verified</span>
                  `)}
                  <span class="review-card__date">${date$}</span>
                </div>
                <div class="review-card__rating">${stars$}</div>
                <strong class="review-card__title">${title$}</strong>
                <p class="review-card__body">${body$}</p>
              </div>
            `
          },
        )}
      </div>
    </div>
  `

  // ── Thumbnail strip items ─────────────────────────────────────────────────

  const thumbItems$ = selectedColor$.pipe(
    map(color => GALLERY_VIEWS.map((view, idx) => ({
      ...view, idx,
      hex: color?.hex ?? '#6366f1',
    }))),
  )

  // ── Template ─────────────────────────────────────────────────────────────

  return html`
    <div class="product-page">

      <!-- ── Header ─────────────────────────────────────────────────── -->
      <header class="product-header">
        <div class="product-header__brand">
          <span class="brand-mark">◉</span>
          <span class="brand-name">SoundFlow</span>
        </div>
        <nav class="product-header__nav">
          <a href="#">Headphones</a>
          <a href="#">Earbuds</a>
          <a href="#">Accessories</a>
        </nav>
        <button class="header-cart">
          <span class="header-cart__icon">🛒</span>
          Cart
          ${when(hasCart$, () => html`
            <span class="cart-badge">${cartCount$}</span>
          `)}
        </button>
      </header>

      <!-- ── Breadcrumb ──────────────────────────────────────────────── -->
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="#">Home</a>
        <span class="sep">›</span>
        <a href="#">Headphones</a>
        <span class="sep">›</span>
        <span class="breadcrumb__current">${PRODUCT.name}</span>
      </nav>

      <!-- ── Main product section ────────────────────────────────────── -->
      <section class="product-section">

        <!-- Gallery column -->
        <div class="product-gallery">
          <!-- Main image — gradient changes with color + thumbnail selection -->
          <div class="gallery-main" style="background: ${imageGradient$}">
            ${headphoneSvg()}
          </div>

          <!-- Thumbnail strip -->
          <div class="gallery-thumbs">
            ${list(
              thumbItems$,
              item => String(item.idx),
              (item$) => {
                const angles = [135, 45, 90, 160, 120]
                const isActive$ = combineLatest([item$, activeImageIndex$]).pipe(
                  map(([item, ai]) => item.idx === ai),
                )
                const cls$  = isActive$.pipe(map(a => a ? 'thumb thumb--active' : 'thumb'))
                const grad$ = item$.pipe(map(i => `linear-gradient(${angles[i.idx]}deg, ${i.hex}bb 0%, ${i.hex}44 100%)`))
                const title$ = item$.pipe(map(i => i.angle))
                return html`
                  <button
                    class="${cls$}"
                    style="background: ${grad$}"
                    title="${title$}"
                    @click=${() => store.dispatch({ type: 'SET_IMAGE', index: item$.snapshot().idx })}
                  >
                    <span class="thumb-label">${item$.pipe(map(i => i.label))}</span>
                  </button>
                `
              },
            )}
          </div>
        </div>

        <!-- Config column -->
        <div class="product-config">

          <!-- Title / rating -->
          <div class="product-config__top">
            <h1 class="product-title">${PRODUCT.name}</h1>
            <p class="product-tagline">${PRODUCT.tagline}</p>
            <div class="product-rating">
              ${renderStars(PRODUCT.rating)}
              <span class="product-rating__count"
                    @click=${() => store.dispatch({ type: 'SET_TAB', tab: 'reviews' })}>
                ${PRODUCT.reviewCount} reviews
              </span>
            </div>
          </div>

          <!-- Live price + availability -->
          <div class="price-block">
            <span class="price-current">${priceString$}</span>
            <span class="${availabilityClass$}">${availabilityText$}</span>
          </div>

          <div class="config-divider"></div>

          <!-- Color picker -->
          <div class="config-section">
            <div class="config-label">
              Color: <strong>${selectedColor$.pipe(map(c => c?.name ?? '—'))}</strong>
            </div>
            <div class="swatch-row">
              ${list(
                of(COLORS),
                c => c.id,
                (color$) => {
                  const cls$ = combineLatest([
                    color$,
                    store.select(s => s.selectedColorId),
                  ]).pipe(
                    map(([color, selId]) => {
                      let cls = 'swatch'
                      if (color.id === selId)             cls += ' swatch--selected'
                      if (color.stock === 'out-of-stock') cls += ' swatch--oos'
                      return cls
                    }),
                  )
                  const title$ = color$.pipe(map(c => {
                    if (c.stock === 'out-of-stock') return `${c.name} (Out of stock)`
                    if (c.stock === 'limited')      return `${c.name} — only ${c.stockCount} left`
                    return c.name
                  }))
                  return html`
                    <button
                      class="${cls$}"
                      style="--swatch-color: ${color$.pipe(map(c => c.hex))}"
                      title="${title$}"
                      @click=${() => {
                        const c = color$.snapshot()
                        if (c.stock !== 'out-of-stock') {
                          store.dispatch({ type: 'SELECT_COLOR', colorId: c.id })
                        }
                      }}
                    ></button>
                  `
                },
              )}
            </div>
          </div>

          <!-- Edition (size) -->
          <div class="config-section">
            <div class="config-label">Edition</div>
            <div class="size-row">
              ${list(
                of(SIZES),
                sz => sz.id,
                (size$) => {
                  const cls$ = combineLatest([
                    size$,
                    store.select(s => s.selectedSizeId),
                  ]).pipe(
                    map(([sz, selId]) => sz.id === selId ? 'size-btn size-btn--selected' : 'size-btn'),
                  )
                  const priceAdd$ = size$.pipe(map(sz => sz.priceAdd))
                  return html`
                    <button
                      class="${cls$}"
                      @click=${() => store.dispatch({ type: 'SELECT_SIZE', sizeId: size$.snapshot().id })}
                    >
                      <span class="size-btn__name">${size$.pipe(map(sz => sz.name))}</span>
                      <span class="size-btn__desc">${size$.pipe(map(sz => sz.description))}</span>
                      ${when(
                        priceAdd$.pipe(map(p => p > 0)),
                        () => html`<span class="size-btn__price">+$${priceAdd$}</span>`,
                      )}
                    </button>
                  `
                },
              )}
            </div>
          </div>

          <!-- Add-ons -->
          <div class="config-section">
            <div class="config-label">Add-ons</div>
            <div class="addon-grid">
              ${list(
                of(ADDONS),
                a => a.id,
                (addon$) => {
                  const checked$ = combineLatest([
                    addon$,
                    store.select(s => s.selectedAddonIds),
                  ]).pipe(
                    map(([addon, ids]) => ids.includes(addon.id)),
                  )
                  const cls$ = checked$.pipe(
                    map(c => c ? 'addon-card addon-card--checked' : 'addon-card'),
                  )
                  return html`
                    <label class="${cls$}">
                      <input
                        type="checkbox"
                        .checked=${checked$}
                        @change=${() => store.dispatch({ type: 'TOGGLE_ADDON', addonId: addon$.snapshot().id })}
                      />
                      <div class="addon-card__info">
                        <span class="addon-card__name">${addon$.pipe(map(a => a.name))}</span>
                        <span class="addon-card__desc">${addon$.pipe(map(a => a.description))}</span>
                      </div>
                      <span class="addon-card__price">+$${addon$.pipe(map(a => a.price))}</span>
                    </label>
                  `
                },
              )}
            </div>
          </div>

          <div class="config-divider"></div>

          <!-- Quantity -->
          <div class="config-section">
            <div class="config-label">Quantity</div>
            <div class="qty-stepper">
              <button class="qty-btn" @click=${() => store.dispatch({ type: 'DEC_QTY' })}>−</button>
              <span class="qty-value">${quantity$}</span>
              <button class="qty-btn" @click=${() => store.dispatch({ type: 'INC_QTY' })}>+</button>
            </div>
          </div>

          <!-- CTA -->
          <div class="cta-row">
            <button
              class="${addToCartClass$}"
              @click=${() => {
                const color = COLORS.find(c => c.id === store.getState().selectedColorId)
                if (color && color.stock !== 'out-of-stock') {
                  store.dispatch({ type: 'ADD_TO_CART' })
                }
              }}
            >${addToCartLabel$}</button>
            <button class="btn-wishlist">♡ Wishlist</button>
          </div>

          <!-- Mini cart summary -->
          ${when(hasCart$, () => html`
            <div class="mini-cart">
              <div class="mini-cart__header">
                <span class="mini-cart__title">🛒 Your Cart</span>
                <span class="mini-cart__total">Total: $${cartTotal$}</span>
              </div>
              <ul class="mini-cart__list">
                ${list(
                  cartItems$,
                  item => item.id,
                  (item$) => {
                    const hasAddons$ = item$.pipe(map(i => i.addonNames.length > 0))
                    const atMin$     = item$.pipe(map(i => i.qty <= 1))
                    const atMax$     = item$.pipe(map(i => i.qty >= 10))
                    return html`
                      <li class="mini-cart__item">
                        <div class="mini-cart__item-info">
                          <span class="mini-cart__item-name">
                            ${item$.pipe(map(i => `${i.sizeName} · ${i.colorName}`))}
                          </span>
                          ${when(hasAddons$, () => html`
                            <span class="mini-cart__item-addons">
                              ${item$.pipe(map(i => i.addonNames.join(', ')))}
                            </span>
                          `)}
                        </div>
                        <div class="mini-cart__qty-ctrl">
                          <button
                            class="mini-cart__qty-btn"
                            ?disabled=${atMin$}
                            @click=${() => store.dispatch({ type: 'UPDATE_CART_QTY', itemId: item$.snapshot().id, delta: -1 })}
                          >−</button>
                          <span class="mini-cart__qty-val">${item$.pipe(map(i => i.qty))}</span>
                          <button
                            class="mini-cart__qty-btn"
                            ?disabled=${atMax$}
                            @click=${() => store.dispatch({ type: 'UPDATE_CART_QTY', itemId: item$.snapshot().id, delta: 1 })}
                          >+</button>
                        </div>
                        <span class="mini-cart__item-price">
                          $${item$.pipe(map(i => i.qty * i.unitPrice))}
                        </span>
                        <button
                          class="mini-cart__remove"
                          title="Remove item"
                          @click=${() => store.dispatch({ type: 'REMOVE_FROM_CART', itemId: item$.snapshot().id })}
                        >✕</button>
                      </li>
                    `
                  },
                )}
              </ul>
            </div>
          `)}

          <!-- Trust badges -->
          <div class="product-badges">
            <span class="badge">🚚 Free shipping over $150</span>
            <span class="badge">↩ 30-day returns</span>
            <span class="badge">🔒 Secure checkout</span>
          </div>

        </div>
      </section>

      <!-- ── Tabs ────────────────────────────────────────────────────── -->
      <section class="tabs-section">
        <div class="tabs-nav">
          <button class="${tabClass('gallery')}"
                  @click=${() => store.dispatch({ type: 'SET_TAB', tab: 'gallery' })}>
            Gallery
          </button>
          <button class="${tabClass('specs')}"
                  @click=${() => store.dispatch({ type: 'SET_TAB', tab: 'specs' })}>
            Specifications
          </button>
          <button class="${tabClass('reviews')}"
                  @click=${() => store.dispatch({ type: 'SET_TAB', tab: 'reviews' })}>
            Reviews (${PRODUCT.reviewCount})
          </button>
        </div>

        <div class="tab-content">
          ${when(galleryVisible$,  galleryTabFn)}
          ${when(specsVisible$,    specsTabFn)}
          ${when(reviewsVisible$,  reviewsTabFn)}
        </div>
      </section>

    </div>
  `
})
