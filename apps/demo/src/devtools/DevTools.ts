import { html, list, when, TemplateResult } from '@rxjs-spa/dom'
import { Store } from '@rxjs-spa/store'
import { BehaviorSubject, combineLatest, Observable } from 'rxjs'
import { map, scan, startWith, withLatestFrom } from 'rxjs/operators'

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

interface DevToolsState {
    isOpen: boolean
    history: Array<{
        id: number
        action: { type: string;[key: string]: any }
        timestamp: number
    }>
}

type DevToolsAction =
    | { type: 'TOGGLE_OPEN' }
    | { type: 'ADD_ACTION'; action: any }
    | { type: 'CLEAR' }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevTools<S, A extends { type: string }>(
    targetStore: Store<S, A>,
    name = 'Store',
): TemplateResult {
    // Local State
    const isOpen$ = new BehaviorSubject(false)
    const history$ = targetStore.actions$.pipe(
        scan((acc, action) => {
            return [
                {
                    id: Date.now() + Math.random(),
                    action,
                    timestamp: Date.now(),
                },
                ...acc,
            ].slice(0, 50) // Keep last 50
        }, [] as DevToolsState['history']),
        startWith([]),
    )

    const currentState$ = targetStore.state$.pipe(
        map((s) => JSON.stringify(s, null, 2)),
    )

    // Actions
    const toggle = () => isOpen$.next(!isOpen$.value)

    // View
    return html`
    <div class="devtools-root">
      <!-- Toggle Button -->
      <button 
        class="devtools-toggle" 
        @click=${toggle}
        title="Toggle DevTools"
      >
        Rx
      </button>

      <!-- Panel -->
      ${when(
        isOpen$,
        () => html`
          <div class="devtools-panel">
            <div class="devtools-header">
              <h3>${name} DevTools</h3>
              <button class="devtools-close" @click=${toggle}>×</button>
            </div>
            
            <div class="devtools-body">
              <div class="devtools-section">
                <h4>Current State</h4>
                <pre class="devtools-code">${currentState$}</pre>
              </div>

              <div class="devtools-section">
                <h4>Action History</h4>
                <div class="devtools-history">
                  ${list(
            history$,
            (item) => String(item.id),
            (item$, key) => html`
                      <div class="devtools-action-item">
                        <span class="devtools-action-time">
                          ${item$.pipe(map(i => new Date(i.timestamp).toLocaleTimeString()))}
                        </span>
                        <span class="devtools-action-type">
                          ${item$.pipe(map(i => i.action.type))}
                        </span>
                        <details>
                          <summary>Payload</summary>
                          <pre>${item$.pipe(map(i => JSON.stringify(i.action, null, 2)))}</pre>
                        </details>
                      </div>
                    `
        )}
                </div>
              </div>
            </div>
          </div>
        `,
    )}
    </div>
  `
}
