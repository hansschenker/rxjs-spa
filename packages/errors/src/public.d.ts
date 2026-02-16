import { Observable, OperatorFunction, Subscription } from 'rxjs';
import type { Reducer, Store } from '@rxjs-spa/store';
export interface AppError {
    /**
     * Where the error originated:
     *   'observable'  — caught inside an RxJS pipeline via catchAndReport / safeScan
     *   'global'      — window.onerror (uncaught JS error)
     *   'promise'     — unhandledrejection (uncaught Promise rejection)
     *   'manual'      — explicitly reported via handler.reportError(...)
     */
    source: 'observable' | 'global' | 'promise' | 'manual';
    /** The native Error object (always normalised). */
    error: Error;
    /** Human-readable message (alias for error.message). */
    message: string;
    /** Unix timestamp (Date.now()) when the error was captured. */
    timestamp: number;
    /** Optional developer-supplied label identifying the pipeline or component. */
    context?: string;
}
export interface ErrorHandlerConfig {
    /**
     * If true (default), attaches window.onerror and
     * window.addEventListener('unhandledrejection') listeners.
     * Set to false in Node / test environments where window is unavailable
     * or where you do not want global capture.
     */
    enableGlobalCapture?: boolean;
    /**
     * Called synchronously whenever an error is reported.
     * Useful for console logging, Sentry integration, etc.
     */
    onError?: (error: AppError) => void;
}
export interface ErrorHandler {
    /** Hot Observable stream of all captured AppErrors. Does NOT replay. */
    errors$: Observable<AppError>;
    /**
     * Report an error manually.
     *
     * @example
     *   try { doSomething() } catch (e) { handler.reportError(e, 'manual', 'myContext') }
     */
    reportError(error: unknown, source?: AppError['source'], context?: string): void;
}
/**
 * createErrorHandler(config?)
 *
 * Creates a centralized error handler. Returns an ErrorHandler object and
 * a Subscription that, when unsubscribed, removes any global event listeners.
 *
 * @example
 *   const [handler, sub] = createErrorHandler({ enableGlobalCapture: true })
 *   handler.errors$.subscribe(e => showToast(e.message))
 *   import.meta.hot?.dispose(() => sub.unsubscribe())
 */
export declare function createErrorHandler(config?: ErrorHandlerConfig): [ErrorHandler, Subscription];
export interface CatchAndReportOptions<T> {
    /** Value or Observable to emit after reporting. Completes if omitted. */
    fallback?: T | Observable<T>;
    /** Label passed to AppError.context. */
    context?: string;
}
/**
 * catchAndReport(handler, options?)
 *
 * RxJS operator. Drop-in for `catchError` that auto-reports to the handler.
 *
 * @example
 *   http.get('/api/users').pipe(
 *     map(users => ({ type: 'FETCH_SUCCESS' as const, users })),
 *     catchAndReport(handler, {
 *       fallback: { type: 'FETCH_ERROR' as const, error: 'Network error' },
 *       context: 'usersView/FETCH',
 *     }),
 *   )
 */
export declare function catchAndReport<T>(handler: ErrorHandler, options?: CatchAndReportOptions<T>): OperatorFunction<T, T>;
export interface SafeScanOptions {
    /** Label passed to AppError.context. */
    context?: string;
}
/**
 * safeScan(reducer, initial, handler, options?)
 *
 * Drop-in replacement for `scan(reducer, initial)`.
 * If the reducer throws, the error is reported and the previous state is
 * returned — the pipeline stays alive.
 *
 * @example
 *   const state$ = actionsSubject.pipe(
 *     safeScan(reducer, initialState, handler, { context: 'myStore' }),
 *     startWith(initialState),
 *     shareReplay({ bufferSize: 1, refCount: false }),
 *   )
 */
export declare function safeScan<S, A>(reducer: (state: S, action: A) => S, initial: S, handler: ErrorHandler, options?: SafeScanOptions): OperatorFunction<A, S>;
export interface SafeSubscribeOptions {
    /** Label passed to AppError.context. */
    context?: string;
}
/**
 * safeSubscribe(source$, handler, next, options?)
 *
 * Subscribes with an automatically-wired error callback that reports to handler.
 * Prevents silent subscription deaths.
 *
 * @example
 *   safeSubscribe(value$, handler, (v) => { el.textContent = String(v) })
 */
export declare function safeSubscribe<T>(source$: Observable<T>, handler: ErrorHandler, next: (value: T) => void, options?: SafeSubscribeOptions): Subscription;
export interface SafeStoreOptions {
    /** Label passed to AppError.context. */
    context?: string;
}
/**
 * createSafeStore(reducer, initialState, handler, options?)
 *
 * Drop-in replacement for `createStore` from @rxjs-spa/store that uses
 * `safeScan` internally so a reducer throw cannot kill state$.
 *
 * @example
 *   const store = createSafeStore(reducer, { count: 0 }, handler, {
 *     context: 'counterStore',
 *   })
 */
export declare function createSafeStore<S, A>(reducer: Reducer<S, A>, initialState: S, handler: ErrorHandler, options?: SafeStoreOptions): Store<S, A>;
