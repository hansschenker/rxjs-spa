import { defineComponent, html } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'

export const notFoundView = defineComponent<{ router: Router<any> }>(({ router }) => {
  const path = typeof window !== 'undefined' ? (window.location.pathname || '/') : 'unknown'

  return html`
    <section class="view not-found-view">
      <h1>404</h1>
      <p>Page not found.</p>
      <p>The path <code>${path}</code> does not exist.</p>
      <a href="${router.link('/')}" class="btn btn-primary">Back to Shop</a>
    </section>
  `
})
