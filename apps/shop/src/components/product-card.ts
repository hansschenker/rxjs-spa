import { map } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import type { LiveValue } from '@rxjs-spa/dom'
import type { Product } from '../types'

export const ProductCard = defineComponent<{
  product$: LiveValue<Product>
  onAddToCart: (product: Product) => void
}>(({ product$, onAddToCart }) => {
  const title$ = product$.pipe(map(p => p.title))
  const price$ = product$.pipe(map(p => `$${p.price.toFixed(2)}`))
  const image$ = product$.pipe(map(p => p.image))
  const category$ = product$.pipe(map(p => p.category))
  const href$ = product$.pipe(map(p => `/product/${p.id}`))

  // Minify HTML to avoid whitespace text nodes messing up slot resolution
  // Rating section removed for testing
  return html`<article class="product-card"><a href="${href$}" class="product-card-image-link"><img class="product-card-image" src="${image$}" alt="${title$}"></a><div class="product-card-body"><span class="product-card-category">${category$}</span><h3 class="product-card-title"><a href="${href$}">${title$}</a></h3><div class="product-card-footer"><span class="product-card-price">${price$}</span></div><button class="btn btn-primary btn-sm" @click=${() => onAddToCart(product$.snapshot())}>Add to Cart</button></div></article>`
})
