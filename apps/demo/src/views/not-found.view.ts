import { Subscription } from 'rxjs'
import { mount, events } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'

export function notFoundView(
  container: Element,
  router: Router<string>,
): Subscription {
  container.innerHTML = `
    <section class="view not-found-view">
      <h1>404</h1>
      <p>Page not found.</p>
      <p>The path <code id="current-path"></code> does not exist.</p>
      <button id="home-btn" class="btn">Go home</button>
    </section>
  `

  const pathEl = container.querySelector<HTMLElement>('#current-path')!
  const homeBtn = container.querySelector<HTMLButtonElement>('#home-btn')!

  pathEl.textContent = window.location.hash.replace(/^#/, '') || '/'

  return mount(container, () => [
    events(homeBtn, 'click').subscribe(() => router.navigate('/')),
  ])
}
