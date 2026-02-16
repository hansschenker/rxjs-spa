import { createRouter } from '@rxjs-spa/router'
import { mount, hydrate } from '@rxjs-spa/dom'
import { App } from './App'
import { globalStore } from './store/global.store'
import { errorHandler } from './error-handler' // Keep side effects?
import { createLogger } from './devtools/logger'
import { DevTools } from './devtools/DevTools'

import './style.css'

// ---------------------------------------------------------------------------
// DevTools & Logging
// ---------------------------------------------------------------------------

// Enable logger in development (or always for this demo)
if (import.meta.env.DEV) {
  createLogger(globalStore, 'Global')
}

// ---------------------------------------------------------------------------
// Error Toast (Side Effect - could be moved to App or Layout)
// ---------------------------------------------------------------------------
const toastEl = document.createElement('div')
toastEl.id = 'error-toast'
toastEl.className = 'error-toast hidden'
document.body.appendChild(toastEl)

let toastTimer: ReturnType<typeof setTimeout> | null = null

errorHandler.errors$.subscribe((e) => {
  toastEl.textContent = e.message
  toastEl.classList.remove('hidden')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000)
})

// ---------------------------------------------------------------------------
// Shell / App Mount
// ---------------------------------------------------------------------------

// 1. Create Router (Browser Mode)
const router = createRouter({
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '/contact': 'contact',
  '/login': 'login',
  '*': 'not-found',
} as const, { mode: 'history' })

// 2. Cleanup function for HMR
let appSub: { unsubscribe: () => void } | null = null
let devToolsSub: { unsubscribe: () => void } | null = null

function bootstrap() {
  const appEl = document.getElementById('app')
  if (!appEl) throw new Error('Root element #app not found')

  // Check if we have SSR content (simple check for now, can be more robust)
  // We look for the first comment node that looks like a marker, or just assumed if children exist.
  const hasSSR = appEl.innerHTML.trim().length > 0

  if (hasSSR) {
    console.log('Hydrating...')
    // hydrate returns { fragment, sub } but fragment is just the root node passed in 
    // (or meaningful parts of it). 
    // We don't append it again.
    const AppTemplate = App({ router })
    const { sub } = hydrate(appEl, AppTemplate)
    appSub = sub
  } else {
    console.log('Mounting...')
    appEl.innerHTML = ''
    const { fragment, sub } = App({ router })
    appEl.appendChild(fragment)
    appSub = sub
  }

  // Mount DevTools (independent of App)
  const devToolsContainer = document.createElement('div')
  devToolsContainer.id = 'devtools-root'
  document.body.appendChild(devToolsContainer)

  const dt = DevTools(globalStore, 'Global')
  devToolsContainer.appendChild(dt.fragment)
  devToolsSub = dt.sub
}

bootstrap()

// 3. HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    appSub?.unsubscribe()
    devToolsSub?.unsubscribe()
    router.destroy()
    toastEl.remove()
    document.getElementById('devtools-root')?.remove()
  })
}
