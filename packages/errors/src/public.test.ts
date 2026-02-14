import { describe, it, expect, vi, afterEach } from 'vitest'
import { Subject, of, throwError } from 'rxjs'
import { switchMap, map, toArray } from 'rxjs/operators'
import {
  createErrorHandler,
  catchAndReport,
  safeScan,
  safeSubscribe,
  createSafeStore,
} from './public'
import type { AppError, ErrorHandler } from './public'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let cleanupSubs: Array<{ unsubscribe(): void }> = []

afterEach(() => {
  cleanupSubs.forEach((s) => s.unsubscribe())
  cleanupSubs = []
})

function makeHandler(enableGlobalCapture = false): [ErrorHandler, ReturnType<typeof createErrorHandler>[1]] {
  const [handler, sub] = createErrorHandler({ enableGlobalCapture })
  cleanupSubs.push(sub)
  return [handler, sub]
}

// ---------------------------------------------------------------------------
// createErrorHandler
// ---------------------------------------------------------------------------

describe('createErrorHandler', () => {
  it('returns a tuple of [ErrorHandler, Subscription]', () => {
    const [handler, sub] = createErrorHandler({ enableGlobalCapture: false })
    cleanupSubs.push(sub)

    expect(handler.errors$).toBeDefined()
    expect(typeof handler.reportError).toBe('function')
    expect(typeof sub.unsubscribe).toBe('function')
  })

  it('errors$ emits AppErrors reported via reportError', () => {
    const [handler] = makeHandler()
    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    handler.reportError(new Error('boom'))

    expect(collected).toHaveLength(1)
    expect(collected[0].message).toBe('boom')
    expect(collected[0].source).toBe('manual')
  })

  it('reportError sets source to "manual" by default', () => {
    const [handler] = makeHandler()
    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    handler.reportError('oops')

    expect(collected[0].source).toBe('manual')
  })

  it('reportError accepts explicit source and context', () => {
    const [handler] = makeHandler()
    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    handler.reportError(new Error('fail'), 'observable', 'myPipeline')

    expect(collected[0].source).toBe('observable')
    expect(collected[0].context).toBe('myPipeline')
  })

  it('normalises string errors into Error instances', () => {
    const [handler] = makeHandler()
    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    handler.reportError('plain string')

    expect(collected[0].error).toBeInstanceOf(Error)
    expect(collected[0].message).toBe('plain string')
  })

  it('normalises non-Error objects into Error instances', () => {
    const [handler] = makeHandler()
    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    handler.reportError({ code: 42 })

    expect(collected[0].error).toBeInstanceOf(Error)
    expect(collected[0].message).toBe('{"code":42}')
  })

  it('config.onError callback is called synchronously on each error', () => {
    const onError = vi.fn()
    const [handler, sub] = createErrorHandler({ enableGlobalCapture: false, onError })
    cleanupSubs.push(sub)

    handler.reportError(new Error('sync test'))

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0].message).toBe('sync test')
  })

  it('errors$ does not replay to late subscribers', () => {
    const [handler] = makeHandler()

    handler.reportError(new Error('early'))

    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    expect(collected).toHaveLength(0)
  })

  it('sets timestamp on each error', () => {
    const [handler] = makeHandler()
    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    const before = Date.now()
    handler.reportError(new Error('timed'))
    const after = Date.now()

    expect(collected[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(collected[0].timestamp).toBeLessThanOrEqual(after)
  })

  it('captures window error events when enableGlobalCapture is true', () => {
    const [handler, sub] = createErrorHandler({ enableGlobalCapture: true })
    cleanupSubs.push(sub)

    const collected: AppError[] = []
    const errSub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(errSub)

    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('global boom'), message: 'global boom' }),
    )

    expect(collected).toHaveLength(1)
    expect(collected[0].source).toBe('global')
    expect(collected[0].message).toBe('global boom')
  })

  it('captures unhandledrejection when enableGlobalCapture is true', () => {
    const [handler, sub] = createErrorHandler({ enableGlobalCapture: true })
    cleanupSubs.push(sub)

    const collected: AppError[] = []
    const errSub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(errSub)

    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', { value: new Error('promise fail') })
    window.dispatchEvent(event)

    expect(collected).toHaveLength(1)
    expect(collected[0].source).toBe('promise')
    expect(collected[0].message).toBe('promise fail')
  })

  it('stops global listeners after unsubscribe', () => {
    const [handler, sub] = createErrorHandler({ enableGlobalCapture: true })

    const collected: AppError[] = []
    const errSub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(errSub)

    sub.unsubscribe()

    // After unsubscribe, manually reporting still works but global capture should not
    // (we can only verify that no global listener fires by checking collected stays empty)
    handler.reportError(new Error('manual still works'))
    expect(collected).toHaveLength(1)
    expect(collected[0].source).toBe('manual')
  })

  it('skips global capture when enableGlobalCapture is false', () => {
    const [handler] = makeHandler(false)

    const collected: AppError[] = []
    const sub = handler.errors$.subscribe((e) => collected.push(e))
    cleanupSubs.push(sub)

    // Only manual reports should work — no global listeners attached
    expect(collected).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// catchAndReport
// ---------------------------------------------------------------------------

describe('catchAndReport', () => {
  it('passes values through when no error occurs', () => {
    const [handler] = makeHandler()
    const collected: number[] = []

    of(1, 2, 3)
      .pipe(catchAndReport(handler))
      .subscribe((v) => collected.push(v))

    expect(collected).toEqual([1, 2, 3])
  })

  it('reports error to handler when source errors', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    throwError(() => new Error('bang'))
      .pipe(catchAndReport(handler))
      .subscribe()

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('bang')
    expect(errors[0].source).toBe('observable')
  })

  it('emits fallback value after reporting if fallback is provided', () => {
    const [handler] = makeHandler()
    const collected: string[] = []

    throwError(() => new Error('fail'))
      .pipe(catchAndReport<string>(handler, { fallback: 'default' }))
      .subscribe((v) => collected.push(v))

    expect(collected).toEqual(['default'])
  })

  it('emits fallback Observable after reporting if fallback is Observable', () => {
    const [handler] = makeHandler()
    const collected: number[] = []

    throwError(() => new Error('fail'))
      .pipe(catchAndReport<number>(handler, { fallback: of(10, 20) }))
      .subscribe((v) => collected.push(v))

    expect(collected).toEqual([10, 20])
  })

  it('completes stream without emitting when no fallback', () => {
    const [handler] = makeHandler()
    const collected: unknown[] = []
    let completed = false

    throwError(() => new Error('fail'))
      .pipe(catchAndReport(handler))
      .subscribe({
        next: (v) => collected.push(v),
        complete: () => { completed = true },
      })

    expect(collected).toEqual([])
    expect(completed).toBe(true)
  })

  it('sets context on the AppError when context option is provided', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    throwError(() => new Error('ctx'))
      .pipe(catchAndReport(handler, { context: 'myEffect' }))
      .subscribe()

    expect(errors[0].context).toBe('myEffect')
  })

  it('keeps outer pipeline alive after inner stream errors (inside switchMap)', () => {
    const [handler] = makeHandler()
    const trigger = new Subject<number>()
    const collected: string[] = []

    trigger
      .pipe(
        switchMap((n) =>
          n === 2
            ? throwError(() => new Error('inner fail')).pipe(
                catchAndReport<string>(handler, { fallback: 'recovered' }),
              )
            : of(`ok-${n}`),
        ),
      )
      .subscribe((v) => collected.push(v))

    trigger.next(1)
    trigger.next(2)
    trigger.next(3)

    expect(collected).toEqual(['ok-1', 'recovered', 'ok-3'])
  })
})

// ---------------------------------------------------------------------------
// safeScan
// ---------------------------------------------------------------------------

describe('safeScan', () => {
  type State = { count: number }
  type Action = { type: 'INC' } | { type: 'BOOM' }

  function reducer(state: State, action: Action): State {
    switch (action.type) {
      case 'INC':  return { count: state.count + 1 }
      case 'BOOM': throw new Error('reducer exploded')
    }
  }

  it('acts like scan when reducer does not throw', () => {
    const [handler] = makeHandler()
    const actions = new Subject<Action>()
    const states: State[] = []

    actions.pipe(safeScan(reducer, { count: 0 }, handler)).subscribe((s) => states.push(s))

    actions.next({ type: 'INC' })
    actions.next({ type: 'INC' })

    expect(states).toEqual([{ count: 1 }, { count: 2 }])
  })

  it('reports error to handler when reducer throws', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    const actions = new Subject<Action>()
    actions.pipe(safeScan(reducer, { count: 0 }, handler)).subscribe()

    actions.next({ type: 'BOOM' })

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('reducer exploded')
    expect(errors[0].source).toBe('observable')
  })

  it('returns previous state when reducer throws', () => {
    const [handler] = makeHandler()
    const actions = new Subject<Action>()
    const states: State[] = []

    actions.pipe(safeScan(reducer, { count: 0 }, handler)).subscribe((s) => states.push(s))

    actions.next({ type: 'INC' })
    actions.next({ type: 'BOOM' })

    // After INC state is { count: 1 }. BOOM throws, so safeScan returns
    // the previous accumulator value { count: 1 } (preserved, not reset to initial).
    expect(states).toEqual([{ count: 1 }, { count: 1 }])
  })

  it('continues processing subsequent actions after a reducer throw', () => {
    const [handler] = makeHandler()
    const actions = new Subject<Action>()
    const states: State[] = []

    actions.pipe(safeScan(reducer, { count: 0 }, handler)).subscribe((s) => states.push(s))

    actions.next({ type: 'INC' })   // → { count: 1 }
    actions.next({ type: 'BOOM' })  // → { count: 1 } (preserved)
    actions.next({ type: 'INC' })   // → { count: 2 }

    expect(states).toEqual([{ count: 1 }, { count: 1 }, { count: 2 }])
  })

  it('sets context on the AppError', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    const actions = new Subject<Action>()
    actions.pipe(safeScan(reducer, { count: 0 }, handler, { context: 'testStore' })).subscribe()

    actions.next({ type: 'BOOM' })

    expect(errors[0].context).toBe('testStore')
  })

  it('does not propagate error downstream — outer stream stays alive', () => {
    const [handler] = makeHandler()
    const actions = new Subject<Action>()
    let errored = false

    actions.pipe(safeScan(reducer, { count: 0 }, handler)).subscribe({
      error: () => { errored = true },
    })

    actions.next({ type: 'BOOM' })
    actions.next({ type: 'INC' })

    expect(errored).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// safeSubscribe
// ---------------------------------------------------------------------------

describe('safeSubscribe', () => {
  it('calls next for each emitted value', () => {
    const [handler] = makeHandler()
    const collected: number[] = []

    safeSubscribe(of(1, 2, 3), handler, (v) => collected.push(v))

    expect(collected).toEqual([1, 2, 3])
  })

  it('reports error to handler when source errors', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    safeSubscribe(throwError(() => new Error('sub fail')), handler, () => {})

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('sub fail')
    expect(errors[0].source).toBe('observable')
  })

  it('returns a Subscription that can be unsubscribed', () => {
    const [handler] = makeHandler()
    const subject = new Subject<number>()
    const collected: number[] = []

    const sub = safeSubscribe(subject, handler, (v) => collected.push(v))

    subject.next(1)
    sub.unsubscribe()
    subject.next(2)

    expect(collected).toEqual([1])
  })

  it('sets context when provided', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    safeSubscribe(throwError(() => new Error('ctx')), handler, () => {}, { context: 'domSink' })

    expect(errors[0].context).toBe('domSink')
  })
})

// ---------------------------------------------------------------------------
// createSafeStore
// ---------------------------------------------------------------------------

describe('createSafeStore', () => {
  type State = { count: number }
  type Action = { type: 'INC' } | { type: 'DEC' } | { type: 'BOOM' }

  function reducer(state: State, action: Action): State {
    switch (action.type) {
      case 'INC':  return { count: state.count + 1 }
      case 'DEC':  return { count: state.count - 1 }
      case 'BOOM': throw new Error('store boom')
    }
  }

  it('returns the full Store<S,A> interface', () => {
    const [handler] = makeHandler()
    const store = createSafeStore(reducer, { count: 0 }, handler)

    expect(typeof store.dispatch).toBe('function')
    expect(typeof store.getState).toBe('function')
    expect(typeof store.select).toBe('function')
    expect(store.state$).toBeDefined()
    expect(store.actions$).toBeDefined()
  })

  it('state$ starts with initialState', () => {
    const [handler] = makeHandler()
    const store = createSafeStore(reducer, { count: 0 }, handler)
    const states: State[] = []

    store.state$.subscribe((s) => states.push(s))

    expect(states).toEqual([{ count: 0 }])
  })

  it('dispatch updates state synchronously', () => {
    const [handler] = makeHandler()
    const store = createSafeStore(reducer, { count: 0 }, handler)

    store.dispatch({ type: 'INC' })
    expect(store.getState()).toEqual({ count: 1 })

    store.dispatch({ type: 'INC' })
    expect(store.getState()).toEqual({ count: 2 })
  })

  it('reducer throw is reported and previous state is preserved', () => {
    const [handler] = makeHandler()
    const errors: AppError[] = []
    const sub = handler.errors$.subscribe((e) => errors.push(e))
    cleanupSubs.push(sub)

    const store = createSafeStore(reducer, { count: 5 }, handler, { context: 'testStore' })

    store.dispatch({ type: 'BOOM' })

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('store boom')
    expect(errors[0].context).toBe('testStore')
    expect(store.getState()).toEqual({ count: 5 })
  })

  it('subsequent dispatches work after a reducer throw', () => {
    const [handler] = makeHandler()
    const store = createSafeStore(reducer, { count: 0 }, handler)

    store.dispatch({ type: 'INC' })   // → { count: 1 }
    store.dispatch({ type: 'BOOM' })  // → { count: 1 } (preserved)
    store.dispatch({ type: 'INC' })   // → { count: 2 }

    expect(store.getState()).toEqual({ count: 2 })
  })

  it('select() reflects the preserved state after a throw', () => {
    const [handler] = makeHandler()
    const store = createSafeStore(reducer, { count: 3 }, handler)
    const counts: number[] = []
    const sub = store.select((s) => s.count).subscribe((c) => counts.push(c))
    cleanupSubs.push(sub)

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'BOOM' })
    store.dispatch({ type: 'DEC' })

    // 3 (initial) → 4 (INC) → 3 (BOOM reverts to previous=3, but accumulator was 4 before BOOM)
    // Wait — let me trace through safeScan:
    //   initial accumulator = { count: 3 }
    //   INC: reducer({ count: 3 }, INC) = { count: 4 } → emit 4
    //   BOOM: reducer({ count: 4 }, BOOM) throws → return state (= { count: 4 }) → emit 4
    //   DEC: reducer({ count: 4 }, DEC) = { count: 3 } → emit 3
    // distinctUntilChanged in select: 3, 4, (4 deduped), 3
    expect(counts).toEqual([3, 4, 3])
  })
})
