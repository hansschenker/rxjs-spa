import { map } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import { createStore } from '@rxjs-spa/store'

// ---------------------------------------------------------------------------
// Local counter store (demonstrates MVU pattern)
// ---------------------------------------------------------------------------

interface CounterState { count: number }

type CounterAction =
  | { type: 'INC' }
  | { type: 'DEC' }
  | { type: 'RESET' }

function counterReducer(state: CounterState, action: CounterAction): CounterState {
  switch (action.type) {
    case 'INC':   return { count: state.count + 1 }
    case 'DEC':   return { count: state.count - 1 }
    case 'RESET': return { count: 0 }
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const homeView = defineComponent<Record<string, never>>((_props) => {
  const store = createStore<CounterState, CounterAction>(counterReducer, { count: 0 })

  const count$ = store.select(s => s.count)
  const countClass$ = count$.pipe(map(c => c < 0 ? 'count negative' : 'count'))

  return html`
    <section class="view">
      <h1>Home</h1>
      <p>Welcome to the <strong>rxjs-spa</strong> standard starter template.</p>

      <div class="card">
        <h2>Counter</h2>
        <p class="${countClass$}">${count$}</p>
        <div class="btn-row">
          <button @click=${() => store.dispatch({ type: 'DEC' })}>−</button>
          <button @click=${() => store.dispatch({ type: 'RESET' })}>Reset</button>
          <button @click=${() => store.dispatch({ type: 'INC' })}>+</button>
        </div>
      </div>

      <div class="card">
        <h2>What's included</h2>
        <ul>
          <li><code>@rxjs-spa/store</code> — MVU state management</li>
          <li><code>@rxjs-spa/router</code> — Hash-based routing with lazy loading</li>
          <li><code>@rxjs-spa/http</code> — HTTP client with RemoteData</li>
          <li><code>@rxjs-spa/dom</code> — Reactive DOM bindings &amp; templates</li>
          <li><code>@rxjs-spa/core</code> — remember() / rememberWhileSubscribed()</li>
        </ul>
      </div>
    </section>
  `
})
