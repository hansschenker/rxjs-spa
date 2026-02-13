import { describe, it, expect } from 'vitest'
import { map, switchMap, of, catchError } from 'rxjs'
import { createStore, ofType, combineStores } from './public'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CountState = { count: number }
type CountAction =
  | { type: 'INC' }
  | { type: 'DEC' }
  | { type: 'ADD'; amount: number }
  | { type: 'RESET' }

function countReducer(state: CountState, action: CountAction): CountState {
  switch (action.type) {
    case 'INC':   return { count: state.count + 1 }
    case 'DEC':   return { count: state.count - 1 }
    case 'ADD':   return { count: state.count + action.amount }
    case 'RESET': return { count: 0 }
  }
}

// ---------------------------------------------------------------------------
// createStore
// ---------------------------------------------------------------------------

describe('createStore', () => {
  it('starts with initialState', () => {
    const store = createStore(countReducer, { count: 0 })
    expect(store.getState()).toEqual({ count: 0 })
  })

  it('state$ replays the initial value immediately to a late subscriber', () => {
    const store = createStore(countReducer, { count: 5 })
    const got: number[] = []
    store.select(s => s.count).subscribe(n => got.push(n))
    expect(got).toEqual([5])
  })

  it('dispatch updates state synchronously (via BehaviorSubject snapshot)', () => {
    const store = createStore(countReducer, { count: 0 })
    store.dispatch({ type: 'INC' })
    expect(store.getState().count).toBe(1)
    store.dispatch({ type: 'INC' })
    expect(store.getState().count).toBe(2)
  })

  it('state$ emits each new state value', () => {
    const store = createStore(countReducer, { count: 0 })
    const emitted: number[] = []
    const sub = store.select(s => s.count).subscribe(n => emitted.push(n))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'DEC' })

    expect(emitted).toEqual([0, 1, 2, 1])
    sub.unsubscribe()
  })

  it('select() does not re-emit when selected slice is unchanged', () => {
    const store = createStore(countReducer, { count: 0 })
    const emitted: number[] = []
    const sub = store.select(s => s.count).subscribe(n => emitted.push(n))

    store.dispatch({ type: 'ADD', amount: 0 }) // count stays 0
    store.dispatch({ type: 'INC' })

    // Should only emit 0 and 1, not 0 twice
    expect(emitted).toEqual([0, 1])
    sub.unsubscribe()
  })

  it('late subscriber to state$ gets the latest value', () => {
    const store = createStore(countReducer, { count: 0 })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })

    const got: number[] = []
    store.select(s => s.count).subscribe(n => got.push(n))

    expect(got).toEqual([2])
  })
})

// ---------------------------------------------------------------------------
// actions$ stream — effects pattern
// ---------------------------------------------------------------------------

describe('store.actions$ (effects)', () => {
  it('actions$ emits every dispatched action', () => {
    const store = createStore(countReducer, { count: 0 })
    const seen: string[] = []
    const sub = store.actions$.subscribe(a => seen.push(a.type))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'RESET' })

    expect(seen).toEqual(['INC', 'RESET'])
    sub.unsubscribe()
  })

  it('effects can dispatch back (async action chaining)', () => {
    const store = createStore(countReducer, { count: 0 })

    // Effect: whenever INC is dispatched, also dispatch ADD 10
    const effectSub = store.actions$.pipe(
      ofType('INC'),
      switchMap(() => of({ type: 'ADD' as const, amount: 10 })),
    ).subscribe(action => store.dispatch(action))

    store.dispatch({ type: 'INC' }) // triggers effect: INC → ADD 10
    // After INC: count = 1; after ADD 10 effect: count = 11
    expect(store.getState().count).toBe(11)

    effectSub.unsubscribe()
  })
})

// ---------------------------------------------------------------------------
// ofType
// ---------------------------------------------------------------------------

describe('ofType()', () => {
  it('passes through matching action types', () => {
    const store = createStore(countReducer, { count: 0 })
    const seen: string[] = []

    const sub = store.actions$.pipe(
      ofType('INC', 'DEC'),
    ).subscribe(a => seen.push(a.type))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'RESET' })  // filtered out
    store.dispatch({ type: 'DEC' })

    expect(seen).toEqual(['INC', 'DEC'])
    sub.unsubscribe()
  })

  it('narrows the action type', () => {
    // TypeScript type test — narrowed to Extract<CountAction, { type: 'ADD' }>
    const store = createStore(countReducer, { count: 0 })
    const sub = store.actions$.pipe(
      ofType('ADD'),
    ).subscribe(a => {
      // `a.amount` would be a type error if ofType didn't narrow correctly
      expect(typeof a.amount).toBe('number')
    })

    store.dispatch({ type: 'ADD', amount: 5 })
    sub.unsubscribe()
  })
})

// ---------------------------------------------------------------------------
// combineStores
// ---------------------------------------------------------------------------

describe('combineStores()', () => {
  it('emits combined state from two stores', () => {
    const storeA = createStore(countReducer, { count: 0 })
    const storeB = createStore(
      (s: { label: string }, a: { type: 'SET'; label: string }) =>
        a.type === 'SET' ? { label: a.label } : s,
      { label: 'hello' },
    )

    const combined: string[] = []
    const sub = combineStores(storeA, storeB, (a, b) => `${a.count}:${b.label}`).subscribe(
      v => combined.push(v),
    )

    storeA.dispatch({ type: 'INC' })
    storeB.dispatch({ type: 'SET', label: 'world' })

    expect(combined).toEqual(['0:hello', '1:hello', '1:world'])
    sub.unsubscribe()
  })
})
