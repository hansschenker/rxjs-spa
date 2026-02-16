import { defineComponent, html } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'

export const notFoundView = defineComponent<{ router: Router<any> }>(
  ({ router }) => {
    // Determine path safely for SSR
    const path = typeof window !== 'undefined' ? (window.location.pathname || '/') : 'unknown'

    return html`
    <section class="view not-found-view">
      <h1>404</h1>
      <p>Page not found.</p>
      <p>The path <code id="current-path">${path}</code> does not exist.</p>
      <button id="home-btn" class="btn" @click=${() => router.navigate('/')}>Go home</button>
    </section>
    `
  }
)
