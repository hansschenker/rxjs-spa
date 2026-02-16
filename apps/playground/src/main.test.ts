import { describe, it, expect } from 'vitest'
import { createStore, ofType } from '@rxjs-spa/store'

// ---------------------------------------------------------------------------
// Model (mirrors main.ts)
// ---------------------------------------------------------------------------

interface Todo {
  id: string
  label: string
  done: boolean
}

interface TodoState {
  todos: Todo[]
  nextId: number
  editingId: string | null
}

type Action =
  | { type: 'LOAD'; todos: Todo[] }
  | { type: 'CREATE'; label: string }
  | { type: 'UPDATE'; id: string; label: string }
  | { type: 'DELETE'; id: string }
  | { type: 'TOGGLE'; id: string }
  | { type: 'EDIT_START'; id: string }
  | { type: 'EDIT_CANCEL' }

const INITIAL: TodoState = {
  todos: [],
  nextId: 1,
  editingId: null,
}

function reducer(state: TodoState, action: Action): TodoState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        todos: action.todos,
        nextId: action.todos.length
          ? Math.max(...action.todos.map((t) => Number(t.id))) + 1
          : 1,
      }
    case 'CREATE':
      return {
        ...state,
        todos: [
          ...state.todos,
          { id: String(state.nextId), label: action.label, done: false },
        ],
        nextId: state.nextId + 1,
      }
    case 'UPDATE':
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, label: action.label } : t,
        ),
        editingId: null,
      }
    case 'DELETE':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.id),
        editingId: state.editingId === action.id ? null : state.editingId,
      }
    case 'TOGGLE':
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, done: !t.done } : t,
        ),
      }
    case 'EDIT_START':
      return { ...state, editingId: action.id }
    case 'EDIT_CANCEL':
      return { ...state, editingId: null }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Todo MVU store — CRUDL', () => {
  function makeStore() {
    return createStore<TodoState, Action>(reducer, INITIAL)
  }

  // --- LOAD ---
  it('LOAD replaces todos and recalculates nextId', () => {
    const store = makeStore()
    const todos: Todo[] = [
      { id: '5', label: 'A', done: false },
      { id: '10', label: 'B', done: true },
    ]
    store.dispatch({ type: 'LOAD', todos })

    const state = store.getState()
    expect(state.todos).toEqual(todos)
    expect(state.nextId).toBe(11)
  })

  it('LOAD with empty array resets nextId to 1', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'temp' })
    store.dispatch({ type: 'LOAD', todos: [] })

    expect(store.getState().todos).toEqual([])
    expect(store.getState().nextId).toBe(1)
  })

  // --- CREATE ---
  it('CREATE appends a new todo and increments nextId', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'Buy milk' })
    store.dispatch({ type: 'CREATE', label: 'Walk dog' })

    const state = store.getState()
    expect(state.todos).toHaveLength(2)
    expect(state.todos[0]).toEqual({ id: '1', label: 'Buy milk', done: false })
    expect(state.todos[1]).toEqual({ id: '2', label: 'Walk dog', done: false })
    expect(state.nextId).toBe(3)
  })

  // --- READ (select) ---
  it('select() derives slices from state', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'A' })
    store.dispatch({ type: 'CREATE', label: 'B' })

    const labels: string[][] = []
    const sub = store
      .select((s) => s.todos.map((t) => t.label))
      .subscribe((v) => labels.push(v))

    expect(labels[labels.length - 1]).toEqual(['A', 'B'])
    sub.unsubscribe()
  })

  // --- UPDATE ---
  it('UPDATE changes a todo label and clears editingId', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'Old' })
    store.dispatch({ type: 'EDIT_START', id: '1' })
    expect(store.getState().editingId).toBe('1')

    store.dispatch({ type: 'UPDATE', id: '1', label: 'New' })

    const state = store.getState()
    expect(state.todos[0].label).toBe('New')
    expect(state.editingId).toBeNull()
  })

  // --- DELETE ---
  it('DELETE removes a todo by id', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'A' })
    store.dispatch({ type: 'CREATE', label: 'B' })
    store.dispatch({ type: 'DELETE', id: '1' })

    expect(store.getState().todos).toHaveLength(1)
    expect(store.getState().todos[0].label).toBe('B')
  })

  it('DELETE clears editingId when deleting the edited item', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'A' })
    store.dispatch({ type: 'EDIT_START', id: '1' })
    store.dispatch({ type: 'DELETE', id: '1' })

    expect(store.getState().editingId).toBeNull()
  })

  it('DELETE preserves editingId when deleting a different item', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'A' })
    store.dispatch({ type: 'CREATE', label: 'B' })
    store.dispatch({ type: 'EDIT_START', id: '1' })
    store.dispatch({ type: 'DELETE', id: '2' })

    expect(store.getState().editingId).toBe('1')
  })

  // --- TOGGLE ---
  it('TOGGLE flips done state', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'Task' })
    expect(store.getState().todos[0].done).toBe(false)

    store.dispatch({ type: 'TOGGLE', id: '1' })
    expect(store.getState().todos[0].done).toBe(true)

    store.dispatch({ type: 'TOGGLE', id: '1' })
    expect(store.getState().todos[0].done).toBe(false)
  })

  // --- EDIT_START / EDIT_CANCEL ---
  it('EDIT_START sets editingId, EDIT_CANCEL clears it', () => {
    const store = makeStore()
    store.dispatch({ type: 'CREATE', label: 'A' })

    store.dispatch({ type: 'EDIT_START', id: '1' })
    expect(store.getState().editingId).toBe('1')

    store.dispatch({ type: 'EDIT_CANCEL' })
    expect(store.getState().editingId).toBeNull()
  })

  // --- ofType filtering ---
  it('ofType filters actions on the action stream', () => {
    const store = makeStore()
    const creates: string[] = []
    const sub = store.actions$.pipe(ofType('CREATE')).subscribe((a) => {
      creates.push(a.label)
    })

    store.dispatch({ type: 'CREATE', label: 'X' })
    store.dispatch({ type: 'TOGGLE', id: '1' })
    store.dispatch({ type: 'CREATE', label: 'Y' })

    expect(creates).toEqual(['X', 'Y'])
    sub.unsubscribe()
  })
})
