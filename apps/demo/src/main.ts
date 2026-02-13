import './style.css'
import { Subscription } from 'rxjs'
import { createRouter } from '@rxjs-spa/router'
import { mount } from '@rxjs-spa/dom'
import { globalStore } from './store/global.store'
import { navComponent } from './components/nav'
import { homeView } from './views/home.view'
import { usersView } from './views/users.view'
import { userDetailView } from './views/user.view'
import { contactView } from './views/contact.view'

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createRouter({
  '/':          'home',
  '/users':     'users',
  '/users/:id': 'user-detail',
  '/contact':   'contact',
} as const)

// ---------------------------------------------------------------------------
// Shell elements
// ---------------------------------------------------------------------------

const navEl    = document.querySelector<HTMLElement>('#nav')!
const outletEl = document.querySelector<HTMLElement>('#outlet')!

// ---------------------------------------------------------------------------
// Nav — permanent; outlives route changes
// ---------------------------------------------------------------------------

const navSub = navComponent(navEl, router, globalStore)

// ---------------------------------------------------------------------------
// Outlet — swaps views on route change
// ---------------------------------------------------------------------------

let currentViewSub: Subscription | null = null

const outletSub = router.route$.subscribe(({ name, params }) => {
  // Teardown the outgoing view's subscriptions
  currentViewSub?.unsubscribe()
  outletEl.innerHTML = ''

  switch (name) {
    case 'home':
      currentViewSub = homeView(outletEl, globalStore)
      break
    case 'users':
      currentViewSub = usersView(outletEl, globalStore, router)
      break
    case 'user-detail':
      currentViewSub = userDetailView(outletEl, globalStore, router, params)
      break
    case 'contact':
      currentViewSub = contactView(outletEl)
      break
  }
})

// ---------------------------------------------------------------------------
// Default route — navigate to / if hash is empty
// ---------------------------------------------------------------------------

if (!window.location.hash || window.location.hash === '#') {
  router.navigate('/')
}

// ---------------------------------------------------------------------------
// HMR cleanup
// ---------------------------------------------------------------------------

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    navSub.unsubscribe()
    outletSub.unsubscribe()
    currentViewSub?.unsubscribe()
  })
}
