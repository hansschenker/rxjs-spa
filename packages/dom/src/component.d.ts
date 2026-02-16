import type { TemplateResult } from './template';
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
    onMount(fn: () => void | (() => void)): void;
    /**
     * Register a cleanup callback to run when the component is destroyed
     * (i.e. when its Subscription is unsubscribed).
     */
    onDestroy(fn: () => void): void;
}
/**
 * A component definition is a function that accepts props and returns
 * a TemplateResult (fragment + subscription).
 */
export type ComponentDef<P> = (props: P) => TemplateResult;
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
export declare function defineComponent<P>(setup: (props: P, lifecycle: Lifecycle) => TemplateResult): ComponentDef<P>;
