import { describe, it, expect, beforeEach } from 'vitest'
import { Subject } from 'rxjs'
import { loadState, persistState, clearState, createPersistedStore } from './public'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  }
}

interface State { count: number; label: string; extra?: string }
const INITIAL: State = { count: 0, label: 'hello' }

// ---------------------------------------------------------------------------
// loadState
// ---------------------------------------------------------------------------

describe('loadState', () => {
  it('returns defaultState when nothing is saved', () => {
    const storage = makeStorage()
    expect(loadState('k', INITIAL, { storage })).toEqual(INITIAL)
  })

  it('merges saved keys over defaults', () => {
    const storage = makeStorage()
    storage.setItem('k', JSON.stringify({ count: 42 }))
    const result = loadState('k', INITIAL, { storage })
    expect(result.count).toBe(42)
    expect(result.label).toBe('hello') // fell back to default
  })

  it('handles corrupt JSON by returning defaultState', () => {
    const storage = makeStorage()
    storage.setItem('k', 'not-valid-json{{{')
    expect(loadState('k', INITIAL, { storage })).toEqual(INITIAL)
  })

  it('handles null storage value', () => {
    const storage = makeStorage()
    // nothing saved — getItem returns null
    expect(loadState('k', INITIAL, { storage })).toEqual(INITIAL)
  })
})

// ---------------------------------------------------------------------------
// persistState
// ---------------------------------------------------------------------------

describe('persistState', () => {
  it('writes full state to storage on each emission', () => {
    const storage = makeStorage()
    const subject = new Subject<State>()
    const sub = persistState({ state$: subject.asObservable() }, 'k', { storage })

    subject.next({ count: 1, label: 'a' })
    expect(JSON.parse(storage.getItem('k')!)).toEqual({ count: 1, label: 'a' })

    subject.next({ count: 2, label: 'b' })
    expect(JSON.parse(storage.getItem('k')!)).toEqual({ count: 2, label: 'b' })

    sub.unsubscribe()
  })

  it('only saves picked keys when pick is provided', () => {
    const storage = makeStorage()
    const subject = new Subject<State>()
    const sub = persistState({ state$: subject.asObservable() }, 'k', {
      storage,
      pick: ['count'],
    })

    subject.next({ count: 5, label: 'secret' })
    const saved = JSON.parse(storage.getItem('k')!)
    expect(saved.count).toBe(5)
    expect(saved.label).toBeUndefined()

    sub.unsubscribe()
  })

  it('stops writing after unsubscribe', () => {
    const storage = makeStorage()
    const subject = new Subject<State>()
    const sub = persistState({ state$: subject.asObservable() }, 'k', { storage })

    subject.next({ count: 1, label: 'a' })
    sub.unsubscribe()
    subject.next({ count: 99, label: 'b' })

    expect(JSON.parse(storage.getItem('k')!).count).toBe(1) // still the first value
  })
})

// ---------------------------------------------------------------------------
// clearState
// ---------------------------------------------------------------------------

describe('clearState', () => {
  it('removes the state key and its version key', () => {
    const storage = makeStorage()
    storage.setItem('k', '{}')
    storage.setItem('k.__version__', '1')

    clearState('k', storage)

    expect(storage.getItem('k')).toBeNull()
    expect(storage.getItem('k.__version__')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// createPersistedStore
// ---------------------------------------------------------------------------

describe('createPersistedStore', () => {
  type Action = { type: 'INC' } | { type: 'SET_LABEL'; label: string }

  function reducer(state: State, action: Action): State {
    switch (action.type) {
      case 'INC':       return { ...state, count: state.count + 1 }
      case 'SET_LABEL': return { ...state, label: action.label }
    }
  }

  it('starts from initialState when storage is empty', () => {
    const storage = makeStorage()
    const store = createPersistedStore(reducer, INITIAL, 'k', { storage })
    expect(store.getState()).toEqual(INITIAL)
  })

  it('hydrates from storage on creation (warm start)', () => {
    const storage = makeStorage()
    storage.setItem('k', JSON.stringify({ count: 7, label: 'saved' }))
    storage.setItem('k.__version__', '1')

    const store = createPersistedStore(reducer, INITIAL, 'k', { storage, version: 1 })
    expect(store.getState().count).toBe(7)
    expect(store.getState().label).toBe('saved')
  })

  it('merges partial saved state with defaults', () => {
    const storage = makeStorage()
    storage.setItem('k', JSON.stringify({ count: 3 })) // label missing
    storage.setItem('k.__version__', '1')

    const store = createPersistedStore(reducer, INITIAL, 'k', { storage, version: 1 })
    expect(store.getState().count).toBe(3)
    expect(store.getState().label).toBe('hello') // default
  })

  it('persists state changes to storage', () => {
    const storage = makeStorage()
    const store = createPersistedStore(reducer, INITIAL, 'k', { storage })

    store.dispatch({ type: 'INC' })
    const saved = JSON.parse(storage.getItem('k')!)
    expect(saved.count).toBe(1)
  })

  it('respects pick — only saves specified keys', () => {
    const storage = makeStorage()
    const store = createPersistedStore(reducer, INITIAL, 'k', {
      storage,
      pick: ['count'],
    })

    store.dispatch({ type: 'SET_LABEL', label: 'private' })
    const saved = JSON.parse(storage.getItem('k')!)
    expect(saved.count).toBeDefined()
    expect(saved.label).toBeUndefined()
  })

  it('wipes storage and starts fresh on version mismatch', () => {
    const storage = makeStorage()
    // Simulate old data saved under version 1
    storage.setItem('k', JSON.stringify({ count: 99, label: 'old' }))
    storage.setItem('k.__version__', '1')

    // Create store with version 2 → should wipe and start from initialState
    const store = createPersistedStore(reducer, INITIAL, 'k', { storage, version: 2 })
    expect(store.getState()).toEqual(INITIAL)
    expect(storage.getItem('k.__version__')).toBe('2')
  })

  it('does NOT wipe storage when version matches', () => {
    const storage = makeStorage()
    storage.setItem('k', JSON.stringify({ count: 5, label: 'kept' }))
    storage.setItem('k.__version__', '2')

    const store = createPersistedStore(reducer, INITIAL, 'k', { storage, version: 2 })
    expect(store.getState().count).toBe(5)
  })

  it('returned store has full Store<S,A> interface', () => {
    const storage = makeStorage()
    const store = createPersistedStore(reducer, INITIAL, 'k', { storage })

    expect(typeof store.dispatch).toBe('function')
    expect(typeof store.getState).toBe('function')
    expect(typeof store.select).toBe('function')
    expect(store.state$).toBeDefined()
    expect(store.actions$).toBeDefined()
  })
})
