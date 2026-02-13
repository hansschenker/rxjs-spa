import { Subscription } from 'rxjs'
import { classToggle, events, mount, text } from '@rxjs-spa/dom'
import { map } from 'rxjs/operators'
import type { Router } from '@rxjs-spa/router'
import type { GlobalState, GlobalAction } from '../store/global.store'
import type { Store } from '@rxjs-spa/store'

type AppRoute = 'home' | 'users' | 'user-detail' | 'contact' | 'login'

/**
 * navComponent(el, router, globalStore)
 *
 * Renders:
 *   [rxjs-spa] | Home  Users  |  [Light/Dark]  theme: light
 */
export function navComponent(
  el: Element,
  router: Router<AppRoute>,
  globalStore: Store<GlobalState, GlobalAction>,
): Subscription {
  el.innerHTML = `
    <div class="nav-inner">
      <span class="nav-brand">rxjs-spa</span>
      <div class="nav-links">
        <a id="link-home"    href="${router.link('/')}">Home</a>
        <a id="link-users"   href="${router.link('/users')}">Users</a>
        <a id="link-contact" href="${router.link('/contact')}">Contact</a>
      </div>
      <div class="nav-right">
        <span id="nav-user" class="nav-user"></span>
        <button id="logout-btn" class="btn-danger">Logout</button>
        <a id="link-login" href="${router.link('/login')}">Login</a>
        <button id="theme-toggle">Toggle theme</button>
        <span id="theme-label"></span>
      </div>
    </div>
  `

  const themeBtn   = el.querySelector<HTMLButtonElement>('#theme-toggle')!
  const themeLabel = el.querySelector<HTMLSpanElement>('#theme-label')!
  const homeLink    = el.querySelector<HTMLAnchorElement>('#link-home')!
  const usersLink   = el.querySelector<HTMLAnchorElement>('#link-users')!
  const contactLink = el.querySelector<HTMLAnchorElement>('#link-contact')!
  const navUser     = el.querySelector<HTMLElement>('#nav-user')!
  const logoutBtn   = el.querySelector<HTMLButtonElement>('#logout-btn')!
  const loginLink   = el.querySelector<HTMLAnchorElement>('#link-login')!

  return mount(el, () => [
    // Reflect active route on nav links
    classToggle(homeLink, 'active')(
      router.route$.pipe(map((r) => r.name === 'home')),
    ),
    classToggle(usersLink, 'active')(
      router.route$.pipe(map((r) => r.name === 'users' || r.name === 'user-detail')),
    ),
    classToggle(contactLink, 'active')(
      router.route$.pipe(map((r) => r.name === 'contact')),
    ),
    // Auth: show user email when logged in
    text(navUser)(globalStore.select((s) => s.user?.email ?? '')),
    classToggle(navUser,   'hidden')(globalStore.select((s) => !s.isAuthenticated)),
    classToggle(logoutBtn, 'hidden')(globalStore.select((s) => !s.isAuthenticated)),
    classToggle(loginLink, 'hidden')(globalStore.select((s) => s.isAuthenticated)),
    // Logout
    events(logoutBtn, 'click').subscribe(() => {
      globalStore.dispatch({ type: 'LOGOUT' })
      router.navigate('/')
    }),
    // Theme label
    text(themeLabel)(globalStore.select((s) => s.theme)),
    // Apply theme class to <body>
    globalStore.select((s) => s.theme).subscribe((theme) => {
      document.body.dataset['theme'] = theme
    }),
    // Toggle theme on button click
    events(themeBtn, 'click').subscribe(() =>
      globalStore.dispatch({ type: 'TOGGLE_THEME' }),
    ),
  ])
}
