import {
  BehaviorSubject,
  EMPTY,
  Observable,
  OperatorFunction,
  Subject,
  Subscription,
  fromEvent,
  of,
} from 'rxjs'
import { catchError, distinctUntilChanged, map, scan, shareReplay, startWith } from 'rxjs/operators'
import type { Reducer, Store } from '@rxjs-spa/store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppError {
  /**
   * Where the error originated:
   *   'observable'  — caught inside an RxJS pipeline via catchAndReport / safeScan
   *   'global'      — window.onerror (uncaught JS error)
   *   'promise'     — unhandledrejection (uncaught Promise rejection)
   *   'manual'      — explicitly reported via handler.reportError(...)
   */
  source: 'observable' | 'global' | 'promise' | 'manual'
  /** The native Error object (always normalised). */
  error: Error
  /** Human-readable message (alias for error.message). */
  message: string
  /** Unix timestamp (Date.now()) when the error was captured. */
  timestamp: number
  /** Optional developer-supplied label identifying the pipeline or component. */
  context?: string
}

export interface ErrorHandlerConfig {
  /**
   * If true (default), attaches window.onerror and
   * window.addEventListener('unhandledrejection') listeners.
   * Set to false in Node / test environments where window is unavailable
   * or where you do not want global capture.
   */
  enableGlobalCapture?: boolean
  /**
   * Called synchronously whenever an error is reported.
   * Useful for console logging, Sentry integration, etc.
   */
  onError?: (error: AppError) => void
}

export interface ErrorHandler {
  /** Hot Observable stream of all captured AppErrors. Does NOT replay. */
  errors$: Observable<AppError>
  /**
   * Report an error manually.
   *
   * @example
   *   try { doSomething() } catch (e) { handler.reportError(e, 'manual', 'myContext') }
   */
  reportError(
    error: unknown,
    source?: AppError['source'],
    context?: string,
  ): void
}

// ---------------------------------------------------------------------------
// Internal: normalise any thrown value to an Error
// ---------------------------------------------------------------------------

function toError(raw: unknown): Error {
  if (raw instanceof Error) return raw
  if (typeof raw === 'string') return new Error(raw)
  try {
    return new Error(JSON.stringify(raw))
  } catch {
    return new Error(String(raw))
  }
}

// ---------------------------------------------------------------------------
// createErrorHandler
// ---------------------------------------------------------------------------

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
export function createErrorHandler(
  config?: ErrorHandlerConfig,
): [ErrorHandler, Subscription] {
  const enableGlobal = config?.enableGlobalCapture ?? true
  const onError = config?.onError

  const bus = new Subject<AppError>()
  const cleanupSub = new Subscription()

  function reportError(
    raw: unknown,
    source: AppError['source'] = 'manual',
    context?: string,
  ): void {
    const error = toError(raw)
    const appError: AppError = {
      source,
      error,
      message: error.message,
      timestamp: Date.now(),
      context,
    }
    onError?.(appError)
    bus.next(appError)
  }

  if (enableGlobal && typeof window !== 'undefined') {
    const errorSub = fromEvent<ErrorEvent>(window, 'error').subscribe((e) => {
      reportError(e.error ?? new Error(e.message), 'global')
    })

    const rejectionSub = fromEvent<PromiseRejectionEvent>(
      window,
      'unhandledrejection',
    ).subscribe((e) => {
      reportError(e.reason, 'promise')
    })

    cleanupSub.add(errorSub)
    cleanupSub.add(rejectionSub)
  }

  const handler: ErrorHandler = {
    errors$: bus.asObservable(),
    reportError,
  }

  return [handler, cleanupSub]
}

// ---------------------------------------------------------------------------
// catchAndReport
// ---------------------------------------------------------------------------

export interface CatchAndReportOptions<T> {
  /** Value or Observable to emit after reporting. Completes if omitted. */
  fallback?: T | Observable<T>
  /** Label passed to AppError.context. */
  context?: string
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
export function catchAndReport<T>(
  handler: ErrorHandler,
  options?: CatchAndReportOptions<T>,
): OperatorFunction<T, T> {
  return (source: Observable<T>): Observable<T> =>
    source.pipe(
      catchError((raw): Observable<T> => {
        handler.reportError(raw, 'observable', options?.context)

        if (options?.fallback !== undefined) {
          const fb = options.fallback
          return fb instanceof Observable ? fb : of(fb as T)
        }

        return EMPTY
      }),
    )
}

// ---------------------------------------------------------------------------
// safeScan
// ---------------------------------------------------------------------------

export interface SafeScanOptions {
  /** Label passed to AppError.context. */
  context?: string
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
export function safeScan<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
  handler: ErrorHandler,
  options?: SafeScanOptions,
): OperatorFunction<A, S> {
  return (source: Observable<A>): Observable<S> =>
    source.pipe(
      scan((state: S, action: A): S => {
        try {
          return reducer(state, action)
        } catch (raw) {
          handler.reportError(raw, 'observable', options?.context)
          return state
        }
      }, initial),
    )
}

// ---------------------------------------------------------------------------
// safeSubscribe
// ---------------------------------------------------------------------------

export interface SafeSubscribeOptions {
  /** Label passed to AppError.context. */
  context?: string
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
export function safeSubscribe<T>(
  source$: Observable<T>,
  handler: ErrorHandler,
  next: (value: T) => void,
  options?: SafeSubscribeOptions,
): Subscription {
  return source$.subscribe({
    next,
    error: (raw) => handler.reportError(raw, 'observable', options?.context),
  })
}

// ---------------------------------------------------------------------------
// createSafeStore
// ---------------------------------------------------------------------------

export interface SafeStoreOptions {
  /** Label passed to AppError.context. */
  context?: string
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
export function createSafeStore<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
  handler: ErrorHandler,
  options?: SafeStoreOptions,
): Store<S, A> {
  const actionsSubject = new Subject<A>()
  const stateBs = new BehaviorSubject<S>(initialState)

  const actions$ = actionsSubject.asObservable()

  const state$ = actionsSubject.pipe(
    safeScan(reducer, initialState, handler, { context: options?.context }),
    startWith(initialState),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  state$.subscribe((s) => stateBs.next(s))

  return {
    state$,
    actions$,
    dispatch(action: A) {
      actionsSubject.next(action)
    },
    select<T>(selector: (state: S) => T): Observable<T> {
      return state$.pipe(map(selector), distinctUntilChanged())
    },
    getState(): S {
      return stateBs.value
    },
  }
}
