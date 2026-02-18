import { productView } from './product.view'
import './style.css'

// ---------------------------------------------------------------------------
// Mount — single-page product configurator (no router needed)
// ---------------------------------------------------------------------------

const { fragment, sub } = productView({})

const root = document.getElementById('app')!
root.appendChild(fragment)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sub.unsubscribe()
    root.innerHTML = ''
  })
}
