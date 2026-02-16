import { BehaviorSubject, EMPTY, Observable, Subject, Subscription, fromEvent, of, } from 'rxjs';
import { catchError, distinctUntilChanged, map, scan, shareReplay, startWith } from 'rxjs/operators';
// ---------------------------------------------------------------------------
// Internal: normalise any thrown value to an Error
// ---------------------------------------------------------------------------
function toError(raw) {
    if (raw instanceof Error)
        return raw;
    if (typeof raw === 'string')
        return new Error(raw);
    try {
        return new Error(JSON.stringify(raw));
    }
    catch {
        return new Error(String(raw));
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
export function createErrorHandler(config) {
    const enableGlobal = config?.enableGlobalCapture ?? true;
    const onError = config?.onError;
    const bus = new Subject();
    const cleanupSub = new Subscription();
    function reportError(raw, source = 'manual', context) {
        const error = toError(raw);
        const appError = {
            source,
            error,
            message: error.message,
            timestamp: Date.now(),
            context,
        };
        onError?.(appError);
        bus.next(appError);
    }
    if (enableGlobal && typeof window !== 'undefined') {
        const errorSub = fromEvent(window, 'error').subscribe((e) => {
            reportError(e.error ?? new Error(e.message), 'global');
        });
        const rejectionSub = fromEvent(window, 'unhandledrejection').subscribe((e) => {
            reportError(e.reason, 'promise');
        });
        cleanupSub.add(errorSub);
        cleanupSub.add(rejectionSub);
    }
    const handler = {
        errors$: bus.asObservable(),
        reportError,
    };
    return [handler, cleanupSub];
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
export function catchAndReport(handler, options) {
    return (source) => source.pipe(catchError((raw) => {
        handler.reportError(raw, 'observable', options?.context);
        if (options?.fallback !== undefined) {
            const fb = options.fallback;
            return fb instanceof Observable ? fb : of(fb);
        }
        return EMPTY;
    }));
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
export function safeScan(reducer, initial, handler, options) {
    return (source) => source.pipe(scan((state, action) => {
        try {
            return reducer(state, action);
        }
        catch (raw) {
            handler.reportError(raw, 'observable', options?.context);
            return state;
        }
    }, initial));
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
export function safeSubscribe(source$, handler, next, options) {
    return source$.subscribe({
        next,
        error: (raw) => handler.reportError(raw, 'observable', options?.context),
    });
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
export function createSafeStore(reducer, initialState, handler, options) {
    const actionsSubject = new Subject();
    const stateBs = new BehaviorSubject(initialState);
    const actions$ = actionsSubject.asObservable();
    const state$ = actionsSubject.pipe(safeScan(reducer, initialState, handler, { context: options?.context }), startWith(initialState), shareReplay({ bufferSize: 1, refCount: false }));
    state$.subscribe((s) => stateBs.next(s));
    return {
        state$,
        actions$,
        dispatch(action) {
            actionsSubject.next(action);
        },
        select(selector) {
            return state$.pipe(map(selector), distinctUntilChanged());
        },
        getState() {
            return stateBs.value;
        },
    };
}
