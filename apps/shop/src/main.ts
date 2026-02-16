import { createRouter } from '@rxjs-spa/router'
import { App } from './App'
import { errorHandler } from './error-handler'
import './style.css'

// ---------------------------------------------------------------------------
// Error toast
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
// Router
// ---------------------------------------------------------------------------

const router = createRouter({
  '/': 'products',
  '/product/:id': 'product-detail',
  '/cart': 'cart',
  '/checkout': 'checkout',
  '*': 'not-found',
} as const, { mode: 'history' })

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

let appSub: { unsubscribe: () => void } | null = null

function bootstrap() {
  const appEl = document.getElementById('app')
  if (!appEl) throw new Error('Root #app element not found')
  appEl.innerHTML = ''
  const { fragment, sub } = App({ router })
  appEl.appendChild(fragment)
  appSub = sub
}

bootstrap()

// ---------------------------------------------------------------------------
// HMR
// ---------------------------------------------------------------------------

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    appSub?.unsubscribe()
    router.destroy()
    toastEl.remove()
  })
}
