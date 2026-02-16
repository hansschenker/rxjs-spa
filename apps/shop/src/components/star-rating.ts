import { map } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import type { Observable } from 'rxjs'

export const StarRating = defineComponent<{
  rate$: Observable<number>
  count$: Observable<number>
}>(({ rate$, count$ }) => {
  const stars$ = rate$.pipe(
    map(rate => {
      const full = Math.floor(rate)
      const half = rate - full >= 0.5 ? 1 : 0
      const empty = 5 - full - half
      return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(empty)
    }),
  )

  return html`
    <span class="star-rating">
      <span class="stars">${stars$}</span>
      <span class="rating-text">${rate$} (${count$})</span>
    </span>
  `
})
