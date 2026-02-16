import './style.css'
import { Subscription } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { createStore, ofType } from '@rxjs-spa/store'
import { classToggle, events, mount, renderKeyedComponents, text } from '@rxjs-spa/dom'

// ---------------------------------------------------------------------------
// Model
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

const INITIAL: TodoState = {
  todos: [],
  nextId: 1,
  editingId: null,
}

// ---------------------------------------------------------------------------
// Actions — CRUDL
// ---------------------------------------------------------------------------

type Action =
  | { type: 'LOAD'; todos: Todo[] }
  | { type: 'CREATE'; label: string }
  | { type: 'UPDATE'; id: string; label: string }
  | { type: 'DELETE'; id: string }
  | { type: 'TOGGLE'; id: string }
  | { type: 'EDIT_START'; id: string }
  | { type: 'EDIT_CANCEL' }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

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
// Store
// ---------------------------------------------------------------------------

const store = createStore<TodoState, Action>(reducer, INITIAL)

// ---------------------------------------------------------------------------
// DOM skeleton
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <h1>Todo App <small>MVU + CRUDL</small></h1>

  <div class="card">
    <form id="create-form" class="create-form">
      <input id="new-todo" type="text" placeholder="What needs to be done?" autocomplete="off" />
      <button type="submit">Add</button>
    </form>
  </div>

  <div class="card">
    <div class="toolbar">
      <span id="count-display"></span>
      <button id="load-sample">Load sample todos</button>
    </div>
    <ul id="todo-list"></ul>
    <p id="empty-msg" class="empty-msg hidden">No todos yet — add one above.</p>
  </div>

  <div class="card">
    <p><strong>Architecture</strong></p>
    <p>
      <code>createStore</code> drives the MVU loop.<br/>
      Actions: <code>LOAD</code>, <code>CREATE</code>, <code>UPDATE</code>,
      <code>DELETE</code>, <code>TOGGLE</code>, <code>EDIT_START</code>, <code>EDIT_CANCEL</code>.<br/>
      Each todo item is a <code>renderKeyedComponents</code> mini-component with its own <code>item$</code> stream.
    </p>
  </div>
`

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const formEl = document.querySelector<HTMLFormElement>('#create-form')!
const inputEl = document.querySelector<HTMLInputElement>('#new-todo')!
const listEl = document.querySelector<HTMLUListElement>('#todo-list')!
const loadBtn = document.querySelector<HTMLButtonElement>('#load-sample')!
const countEl = document.querySelector<HTMLElement>('#count-display')!
const emptyEl = document.querySelector<HTMLElement>('#empty-msg')!

// ---------------------------------------------------------------------------
// Todo component factory
// ---------------------------------------------------------------------------

function todoComponent(
  item$: import('rxjs').Observable<Todo>,
  ctx: { dispatch: (a: Action) => void },
  id: string,
): { node: Node; sub: Subscription } {
  const li = document.createElement('li')
  li.className = 'todo'
  li.innerHTML = `
    <span class="label"></span>
    <div class="todo-actions">
      <button class="btn-toggle" title="Toggle">✓</button>
      <button class="btn-edit" title="Edit">✎</button>
      <button class="btn-delete" title="Delete">✕</button>
    </div>
    <form class="edit-form hidden">
      <input type="text" class="edit-input" />
      <button type="submit" class="btn-save">Save</button>
      <button type="button" class="btn-cancel">Cancel</button>
    </form>
  `

  const labelEl = li.querySelector<HTMLElement>('.label')!
  const toggleBtn = li.querySelector<HTMLButtonElement>('.btn-toggle')!
  const editBtn = li.querySelector<HTMLButtonElement>('.btn-edit')!
  const deleteBtn = li.querySelector<HTMLButtonElement>('.btn-delete')!
  const editForm = li.querySelector<HTMLFormElement>('.edit-form')!
  const editInput = li.querySelector<HTMLInputElement>('.edit-input')!
  const cancelBtn = li.querySelector<HTMLButtonElement>('.btn-cancel')!
  const actionsDiv = li.querySelector<HTMLElement>('.todo-actions')!

  // Derive editing state for this item from the store
  const isEditing$ = store.select((s) => s.editingId === id)

  const sub = new Subscription()

  // Render label and done state
  sub.add(text(labelEl)(item$.pipe(map((t) => t.label), distinctUntilChanged())))
  sub.add(classToggle(li, 'done')(item$.pipe(map((t) => t.done), distinctUntilChanged())))

  // Show/hide edit form vs actions
  sub.add(classToggle(editForm, 'hidden')(isEditing$.pipe(map((e) => !e))))
  sub.add(classToggle(actionsDiv, 'hidden')(isEditing$))

  // Pre-fill edit input when entering edit mode
  sub.add(
    isEditing$.subscribe((editing) => {
      if (editing) {
        const current = store.getState().todos.find((t) => t.id === id)
        if (current) editInput.value = current.label
        editInput.focus()
      }
    }),
  )

  // Events
  sub.add(events(toggleBtn, 'click').subscribe(() => ctx.dispatch({ type: 'TOGGLE', id })))
  sub.add(events(deleteBtn, 'click').subscribe(() => ctx.dispatch({ type: 'DELETE', id })))
  sub.add(events(editBtn, 'click').subscribe(() => ctx.dispatch({ type: 'EDIT_START', id })))
  sub.add(events(cancelBtn, 'click').subscribe(() => ctx.dispatch({ type: 'EDIT_CANCEL' })))

  // Edit form submit → UPDATE
  sub.add(
    events(editForm, 'submit').subscribe((e) => {
      e.preventDefault()
      const label = editInput.value.trim()
      if (label) ctx.dispatch({ type: 'UPDATE', id, label })
    }),
  )

  return { node: li, sub }
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_TODOS: Todo[] = [
  { id: '1', label: 'Learn RxJS operators', done: true },
  { id: '2', label: 'Build an MVU store', done: true },
  { id: '3', label: 'Implement CRUDL actions', done: false },
  { id: '4', label: 'Add edit-in-place', done: false },
  { id: '5', label: 'Ship it!', done: false },
]

// ---------------------------------------------------------------------------
// Derived streams
// ---------------------------------------------------------------------------

const todos$ = store.select((s) => s.todos)
const count$ = store.select((s) => {
  const total = s.todos.length
  const done = s.todos.filter((t) => t.done).length
  return `${done}/${total} done`
})
const isEmpty$ = store.select((s) => s.todos.length === 0)

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const view = mount(app, () => [
  // Create form
  events(formEl, 'submit').subscribe((e) => {
    e.preventDefault()
    const label = inputEl.value.trim()
    if (!label) return
    store.dispatch({ type: 'CREATE', label })
    inputEl.value = ''
    inputEl.focus()
  }),

  // Load sample button
  events(loadBtn, 'click').subscribe(() =>
    store.dispatch({ type: 'LOAD', todos: SAMPLE_TODOS }),
  ),

  // Count display
  text(countEl)(count$),

  // Empty message
  classToggle(emptyEl, 'hidden')(isEmpty$.pipe(map((e) => !e))),

  // Todo list
  renderKeyedComponents<Todo, Action>(
    listEl,
    (t) => t.id,
    (item$, ctx, id) => todoComponent(item$, ctx, id),
    store,
  )(todos$),
])

if (import.meta.hot) {
  import.meta.hot.dispose(() => view.unsubscribe())
}
