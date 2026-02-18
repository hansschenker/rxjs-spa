import { map } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import { createStore } from '@rxjs-spa/store'
import type { Store } from '@rxjs-spa/store'
import type { AppState, AppAction } from '../store/app.store'

// ---------------------------------------------------------------------------
// Local counter store
// ---------------------------------------------------------------------------

interface CounterState { count: number }

type CounterAction =
  | { type: 'INC' }
  | { type: 'DEC' }
  | { type: 'RESET' }

function counterReducer(s: CounterState, a: CounterAction): CounterState {
  switch (a.type) {
    case 'INC':   return { count: s.count + 1 }
    case 'DEC':   return { count: s.count - 1 }
    case 'RESET': return { count: 0 }
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const homeView = defineComponent<{
  appStore: Store<AppState, AppAction>
}>(({ appStore }) => {
  const store = createStore<CounterState, CounterAction>(counterReducer, { count: 0 })

  const count$ = store.select(s => s.count)
  const countClass$ = count$.pipe(map(c => c < 0 ? 'count negative' : 'count'))
  const theme$ = appStore.select(s => s.theme)

  return html`
    <section class="view">
      <h1>Welcome to rxjs-spa</h1>
      <p>A full-featured SPA framework built on <strong>RxJS + TypeScript</strong>.</p>

      <div class="card">
        <h2>Counter — local MVU store</h2>
        <p class="${countClass$}">${count$}</p>
        <div class="btn-row">
          <button @click=${() => store.dispatch({ type: 'DEC' })}>−</button>
          <button @click=${() => store.dispatch({ type: 'RESET' })}>Reset</button>
          <button @click=${() => store.dispatch({ type: 'INC' })}>+</button>
        </div>
      </div>

      <div class="card">
        <h2>Global State</h2>
        <p>Current theme: <strong>${theme$}</strong></p>
        <p class="hint">Use the nav bar toggle to switch themes.</p>
      </div>

      <div class="card">
        <h2>What's included</h2>
        <ul>
          <li><code>@rxjs-spa/store</code> — MVU state management</li>
          <li><code>@rxjs-spa/router</code> — Routing with lazy loading &amp; guards</li>
          <li><code>@rxjs-spa/http</code> — HTTP client with RemoteData</li>
          <li><code>@rxjs-spa/dom</code> — Reactive DOM bindings &amp; templates</li>
          <li><code>@rxjs-spa/forms</code> — Schema-validated reactive forms</li>
          <li><code>@rxjs-spa/persist</code> — localStorage persistence</li>
          <li><code>@rxjs-spa/errors</code> — Global error handling</li>
          <li><code>@rxjs-spa/core</code> — remember() / rememberWhileSubscribed()</li>
        </ul>
      </div>
    </section>
  `
})
