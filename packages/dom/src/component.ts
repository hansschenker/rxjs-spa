import { handleDomError } from "./error-handler";
import type { TemplateResult } from "./template";

const MOUNT_HOOKS = Symbol("MOUNT_HOOKS");

/**
 * A mount hook is a function that can return a cleanup function.
 */
export type MountHook = () => void | (() => void);

/**
 * Lifecycle hooks available inside a component's setup function.
 */
export interface Lifecycle {
  /**
   * Register a callback to run after the component is inserted into the DOM.
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
 * `html` tagged template — embed them as `${MyComponent({ ... })}`.
 */
export function defineComponent<P>(
  setup: (props: P, lifecycle: Lifecycle) => TemplateResult,
): ComponentDef<P> {
  return (props: P) => {
    const mountHooks: MountHook[] = [];
    const destroyHooks: Array<() => void> = [];

    const lifecycle: Lifecycle = {
      onMount(fn) {
        mountHooks.push(fn);
      },
      onDestroy(fn) {
        destroyHooks.push(fn);
      },
    };

    const result = setup(props, lifecycle);

    // Attach mount hooks (executed by the template binder after insertion).
    (result as any)[MOUNT_HOOKS] = mountHooks;

    // Ensure destroy hooks always run when the component subscription is torn down.
    if (destroyHooks.length > 0) {
      result.sub.add(() => {
        for (const fn of destroyHooks) {
          try {
            fn();
          } catch (e) {
            handleDomError(e, "defineComponent/onDestroy");
          }
        }
      });
    }

    return result;
  };
}

