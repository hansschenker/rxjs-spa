import { map } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import type { Observable } from 'rxjs'
import type { Product } from '../types'
import { StarRating } from './star-rating'

export const ProductCard = defineComponent<{
  product$: Observable<Product>
  onAddToCart: (product: Product) => void
}>(({ product$, onAddToCart }) => {
  let current: Product | null = null
  product$.subscribe(p => {
    current = p
  })

  const title$ = product$.pipe(map(p => p.title))
  const price$ = product$.pipe(map(p => `$${p.price.toFixed(2)}`))
  const image$ = product$.pipe(map(p => p.image))
  const category$ = product$.pipe(map(p => p.category))
  const rate$ = product$.pipe(map(p => p.rating.rate))
  const count$ = product$.pipe(map(p => p.rating.count))
  const href$ = product$.pipe(map(p => `/product/${p.id}`))

  return html`
    <article class="product-card">
      <a href="${href$}" class="product-card-image-link">
        <img class="product-card-image" src="${image$}" alt="${title$}" loading="lazy">
      </a>
      <div class="product-card-body">
        <span class="product-card-category">${category$}</span>
        <h3 class="product-card-title">
          <a href="${href$}">${title$}</a>
        </h3>
        <div class="product-card-footer">
          <span class="product-card-price">${price$}</span>
          ${StarRating({ rate$, count$ })}
        </div>
        <button class="btn btn-primary btn-sm" @click=${() => { if (current) onAddToCart(current) }}>
          Add to Cart
        </button>
      </div>
    </article>
  `
})
