// ---------------------------------------------------------------------------
// Configurable error handler for DOM bindings
// ---------------------------------------------------------------------------

/**
 * Signature for custom error handlers set via `setDomErrorHandler`.
 * @param error  The error thrown or emitted by an Observable
 * @param context  A string identifying the binding that produced the error
 *                 (e.g. `'text'`, `'bindAttributeSlot'`, `'defineComponent/onMount'`)
 */
export type DomErrorHandler = (error: unknown, context: string) => void

let handler: DomErrorHandler = (error, context) => {
  console.warn(`[@rxjs-spa/dom] Error in ${context}:`, error)
}

/**
 * Replace the default error handler for all DOM sinks, template bindings,
 * and component lifecycle hooks.
 *
 * The default handler logs to `console.warn`. Set a custom handler to
 * integrate with `@rxjs-spa/errors` or any other error reporting system.
 *
 * @example
 * ```ts
 * setDomErrorHandler((error, context) => {
 *   errorHandler.reportError(error, 'dom', context)
 * })
 * ```
 */
export function setDomErrorHandler(fn: DomErrorHandler): void {
  handler = fn
}

/**
 * Internal: call the configured error handler, swallowing any exception
 * thrown by the handler itself so it never crashes a DOM pipeline.
 */
export function handleDomError(error: unknown, context: string): void {
  try {
    handler(error, context)
  } catch {
    // Never let a broken handler crash the pipeline
  }
}
