import { defineComponent, html } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'

export const notFoundView = defineComponent<{ router: Router<any> }>(
  ({ router }) => {
    const path = typeof window !== 'undefined' ? (window.location.hash.slice(1) || '/') : 'unknown'

    return html`
      <section class="view">
        <h1>404</h1>
        <p>Page not found.</p>
        <p>The path <code>${path}</code> does not exist.</p>
        <button class="btn" @click=${() => router.navigate('/')}>Go home</button>
      </section>
    `
  },
)
