import { Subscription } from 'rxjs';
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
export function defineComponent(setup) {
    return (props) => {
        const mountCallbacks = [];
        const destroyCallbacks = [];
        const lifecycle = {
            onMount(fn) {
                mountCallbacks.push(fn);
            },
            onDestroy(fn) {
                destroyCallbacks.push(fn);
            },
        };
        // Run setup once — creates the template with all bindings
        const result = setup(props, lifecycle);
        // Composite subscription: template bindings + lifecycle teardown
        const compositeSub = new Subscription();
        compositeSub.add(result.sub);
        // Schedule onMount callbacks via microtask (so the fragment has been
        // inserted into the DOM by the time they run)
        queueMicrotask(() => {
            if (compositeSub.closed)
                return;
            for (const fn of mountCallbacks) {
                const cleanup = fn();
                if (typeof cleanup === 'function') {
                    destroyCallbacks.push(cleanup);
                }
            }
        });
        // Wire onDestroy callbacks to run on unsubscribe
        compositeSub.add(() => {
            for (const fn of destroyCallbacks) {
                fn();
            }
        });
        return {
            fragment: result.fragment,
            sub: compositeSub,
            strings: result.strings,
            values: result.values
        };
    };
}
