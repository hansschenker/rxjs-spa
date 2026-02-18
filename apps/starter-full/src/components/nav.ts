import { map } from 'rxjs/operators'
import { html } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'
import { appStore } from '../store/app.store'

export function createNav(router: Router<any>) {
  const isActive = (name: string | string[]) => {
    const names = Array.isArray(name) ? name : [name]
    return router.route$.pipe(
      map(r => names.includes(r.name) ? 'nav-link active' : 'nav-link'),
    )
  }

  const authClass$ = appStore.select(s => s.isAuthenticated ? 'auth-section' : 'auth-section hidden')
  const guestClass$ = appStore.select(s => s.isAuthenticated ? 'hidden' : '')
  const username$ = appStore.select(s => s.user?.username ?? '')
  const themeLabel$ = appStore.select(s => s.theme === 'light' ? '☀️' : '🌙')

  // Apply theme to body
  appStore.select(s => s.theme).subscribe(theme => {
    document.body.dataset['theme'] = theme
  })

  return html`
    <nav class="navbar">
      <span class="brand">rxjs-spa</span>
      <div class="nav-links">
        <a class="${isActive('home')}" href="${router.link('/')}">Home</a>
        <a class="${isActive(['users', 'user-detail'])}" href="${router.link('/users')}">Users</a>
        <a class="${isActive('contact')}" href="${router.link('/contact')}">Contact</a>
      </div>
      <div class="nav-right">
        <span class="${authClass$}">
          <span class="nav-user">${username$}</span>
          <button class="btn-sm btn-danger" @click=${() => {
            appStore.dispatch({ type: 'LOGOUT' })
            router.navigate('/')
          }}>Logout</button>
        </span>
        <a class="${guestClass$}" href="${router.link('/login')}">Login</a>
        <button class="btn-sm" @click=${() => appStore.dispatch({ type: 'TOGGLE_THEME' })}>
          ${themeLabel$}
        </button>
      </div>
    </nav>
  `
}
