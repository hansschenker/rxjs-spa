import { Subject, Subscription } from 'rxjs'
import { map, scan, startWith } from 'rxjs/operators'
import { remember } from '@rxjs-spa/core'
import { createStore } from '@rxjs-spa/store'
import { classToggle, events, mount, text } from '@rxjs-spa/dom'
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
    case 'INC':   return { ...state, count: state.count + 1, message: `Incremented to ${state.count + 1}` }
    case 'DEC':   return { ...state, count: state.count - 1, message: `Decremented to ${state.count - 1}` }
    case 'RESET': return { count: 0, message: 'Counter reset.' }
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

/**
 * homeView(container, globalStore)
 *
 * Demonstrates:
 * - Local MVU store (count) via createStore + scan
 * - Reading from the global store (theme)
 * - Reactive DOM updates via @rxjs-spa/dom sinks
 */
export function homeView(
  container: Element,
  globalStore: Store<GlobalState, GlobalAction>,
): Subscription {
  // ── DOM skeleton ──────────────────────────────────────────────────────────
  container.innerHTML = `
    <section class="view home-view">
      <h1>Welcome to rxjs-spa</h1>
      <p>A framework built entirely on <strong>RxJS + TypeScript</strong>.</p>

      <div class="card">
        <h2>Counter — local MVU store</h2>
        <p class="counter-display">
          Count: <strong id="count-value">0</strong>
        </p>
        <div class="btn-row">
          <button id="dec-btn">−</button>
          <button id="reset-btn">Reset</button>
          <button id="inc-btn">+</button>
        </div>
        <p id="count-msg" class="count-msg"></p>
      </div>

      <div class="card">
        <h2>Global store</h2>
        <p>Current theme: <strong id="theme-display"></strong></p>
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

  // ── Elements ──────────────────────────────────────────────────────────────
  const countValue = container.querySelector<HTMLElement>('#count-value')!
  const countMsg   = container.querySelector<HTMLElement>('#count-msg')!
  const incBtn     = container.querySelector<HTMLButtonElement>('#inc-btn')!
  const decBtn     = container.querySelector<HTMLButtonElement>('#dec-btn')!
  const resetBtn   = container.querySelector<HTMLButtonElement>('#reset-btn')!
  const themeDisplay = container.querySelector<HTMLElement>('#theme-display')!

  // ── Local store ───────────────────────────────────────────────────────────
  const store = createStore<HomeState, HomeAction>(homeReducer, { count: 0, message: '' })

  // ── Wire events → dispatch ────────────────────────────────────────────────
  return mount(container, () => [
    events(incBtn,   'click').subscribe(() => store.dispatch({ type: 'INC' })),
    events(decBtn,   'click').subscribe(() => store.dispatch({ type: 'DEC' })),
    events(resetBtn, 'click').subscribe(() => store.dispatch({ type: 'RESET' })),

    // Render count
    text(countValue)(store.select(s => String(s.count))),
    text(countMsg)(store.select(s => s.message)),

    // Highlight negative counts
    classToggle(countValue, 'negative')(store.select(s => s.count < 0)),

    // Read from global store
    text(themeDisplay)(globalStore.select(s => s.theme)),
  ])
}
