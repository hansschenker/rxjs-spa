import { defineComponent, html } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'

export const notFoundView = defineComponent<{ router: Router<any> }>(
  ({ router }) => html`
    <section class="view">
      <h1>404</h1>
      <p>Page not found.</p>
      <button class="btn" @click=${() => router.navigate('/')}>Go home</button>
    </section>
  `
)
