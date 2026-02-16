import { Subject } from 'rxjs'
import { map } from 'rxjs/operators' // removed scan, startWith as they are likely inside createStore or not needed
import { defineComponent, html } from '@rxjs-spa/dom'
import { createStore } from '@rxjs-spa/store'
import type { Store } from '@rxjs-spa/store'
import type { GlobalState, GlobalAction } from '../store/global.store'

// ---------------------------------------------------------------------------
// Model / Action / Reducer — local MVU slice
// ---------------------------------------------------------------------------

interface HomeState {
  count: number
  message: string
}

type HomeAction =
  | { type: 'INC' }
  | { type: 'DEC' }
  | { type: 'RESET' }

function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case 'INC': return { ...state, count: state.count + 1, message: `Incremented to ${state.count + 1}` }
    case 'DEC': return { ...state, count: state.count - 1, message: `Decremented to ${state.count - 1}` }
    case 'RESET': return { count: 0, message: 'Counter reset.' }
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const homeView = defineComponent<{ globalStore: Store<GlobalState, GlobalAction> }>(
  ({ globalStore }) => {
    // ── Local store ───────────────────────────────────────────────────────────
    const store = createStore<HomeState, HomeAction>(homeReducer, { count: 0, message: '' })

    // ── Selectors ─────────────────────────────────────────────────────────────
    const count$ = store.select(s => s.count)
    const message$ = store.select(s => s.message)
    const theme$ = globalStore.select(s => s.theme)

    // Class toggling via standard class attribute binding or helper?
    // @rxjs-spa/dom html supports `class=${obs}` but for toggling specific classes based on condition?
    // Standard lit-html style: `class="static ${cond ? 'active' : ''}"` inside the stream is easiest.
    // Or we can assume `class` attribute binding supports generic observables.
    const countClass$ = count$.pipe(map(c => c < 0 ? 'negative' : ''))

    return html`
    <section class="view home-view">
      <h1>Welcome to rxjs-spa</h1>
      <p>A framework built entirely on <strong>RxJS + TypeScript</strong>.</p>

      <div class="card">
        <h2>Counter — local MVU store</h2>
        <p class="counter-display">
          Count: <strong id="count-value" class="${countClass$}">${count$}</strong>
        </p>
        <div class="btn-row">
          <button @click=${() => store.dispatch({ type: 'DEC' })}> − </button>
          <button @click=${() => store.dispatch({ type: 'RESET' })}> Reset </button>
          <button @click=${() => store.dispatch({ type: 'INC' })}> + </button>
        </div>
        <p class="count-msg">${message$}</p>
      </div>

      <div class="card">
        <h2>Global store</h2>
        <p>Current theme: <strong id="theme-display">${theme$}</strong></p>
        <p class="hint">Use the nav bar to toggle it.</p>
      </div>

      <div class="card">
        <h2>Architecture</h2>
        <ul>
          <li><code>@rxjs-spa/store</code> — createStore / ofType / actions$</li>
          <li><code>@rxjs-spa/http</code>  — http.get/post/put/patch/delete + RemoteData</li>
          <li><code>@rxjs-spa/router</code>— hash-based router with :param matching</li>
          <li><code>@rxjs-spa/dom</code>   — sources (events, valueChanges…) + sinks (text, attr…)</li>
          <li><code>@rxjs-spa/core</code>  — remember() / rememberWhileSubscribed()</li>
        </ul>
      </div>
    </section>
    `
  }
)
