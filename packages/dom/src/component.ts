import { Subscription } from 'rxjs'
import type { TemplateResult } from './template'
import { handleDomError } from './error-handler'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle hooks available inside a component's setup function.
 */
export interface Lifecycle {
  /**
   * Register a callback to run after the component's fragment is inserted
   * into the DOM (scheduled via `queueMicrotask`).
   *
   * Return a cleanup function that will be called on destroy.
   */
  onMount(fn: () => void | (() => void)): void
  /**
   * Register a cleanup callback to run when the component is destroyed
   * (i.e. when its Subscription is unsubscribed).
   */
  onDestroy(fn: () => void): void
}

/**
 * A component definition is a function that accepts props and returns
 * a TemplateResult (fragment + subscription).
 */
export type ComponentDef<P> = (props: P) => TemplateResult

// ---------------------------------------------------------------------------
// defineComponent
// ---------------------------------------------------------------------------

/**
 * defineComponent(setup)
 *
 * Creates a reusable, composable component definition. The setup function
 * runs once per component instance and receives props + lifecycle hooks.
 *
 * Components return a `TemplateResult` and integrate directly with the
 * `html` tagged template — embed them as `${MyComponent({ prop$: obs$ })}`.
 *
 * @example
 *   const UserCard = defineComponent<{ user$: Observable<User> }>(
 *     (props, { onMount, onDestroy }) => {
 *       onMount(() => console.log('mounted'))
 *       onDestroy(() => console.log('destroyed'))
 *
 *       return html`
 *         <div class="user-card">
 *           <h3>${props.user$.pipe(map(u => u.name))}</h3>
 *           <p>${props.user$.pipe(map(u => u.email))}</p>
 *         </div>
 *       `
 *     },
 *   )
 *
 *   // Use in a template:
 *   html`<div>${UserCard({ user$: selectedUser$ })}</div>`
 *
 *   // Use in a list:
 *   list(users$, u => u.id, (user$, key) => UserCard({ user$ }))
 */
export function defineComponent<P>(
  setup: (props: P, lifecycle: Lifecycle) => TemplateResult,
): ComponentDef<P> {
  return (props: P): TemplateResult => {
    const mountCallbacks: Array<() => void | (() => void)> = []
    const destroyCallbacks: Array<() => void> = []

    const lifecycle: Lifecycle = {
      onMount(fn) {
        mountCallbacks.push(fn)
      },
      onDestroy(fn) {
        destroyCallbacks.push(fn)
      },
    }

    // Run setup once — creates the template with all bindings
    const result = setup(props, lifecycle)

    // Composite subscription: template bindings + lifecycle teardown
    const compositeSub = new Subscription()
    compositeSub.add(result.sub)

    // Schedule onMount callbacks via microtask (so the fragment has been
    // inserted into the DOM by the time they run)
    queueMicrotask(() => {
      if (compositeSub.closed) return
      for (const fn of mountCallbacks) {
        try {
          const cleanup = fn()
          if (typeof cleanup === 'function') {
            destroyCallbacks.push(cleanup)
          }
        } catch (e) {
          handleDomError(e, 'defineComponent/onMount')
        }
      }
    })

    // Wire onDestroy callbacks to run on unsubscribe
    compositeSub.add(() => {
      for (const fn of destroyCallbacks) {
        try {
          fn()
        } catch (e) {
          handleDomError(e, 'defineComponent/onDestroy')
        }
      }
    })

    return {
      fragment: result.fragment,
      sub: compositeSub,
      strings: result.strings,
      values: result.values
    }
  }
}
