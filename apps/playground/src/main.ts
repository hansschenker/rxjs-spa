import './style.css'
import { Subscription, distinctUntilChanged, merge, map, scan, startWith, Subject } from 'rxjs'
import { remember } from '@rxjs-spa/core'
import { classToggle, dispatch, events, mount, renderKeyedComponents, text } from '@rxjs-spa/dom'

// -----------------------------
// App skeleton
// -----------------------------
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <h1>rxjs-spa playground</h1>

  <div class="card" id="counter-card">
    <p><strong>Counter</strong></p>
    <button id="inc">Increment</button>
    <p>Value: <span id="value">0</span></p>
  </div>

  <div class="card" id="todos-card">
    <p><strong>Todos</strong> (each item is a mini component)</p>
    <button id="add">Add todo</button>
    <ul id="todos"></ul>
  </div>

  <div class="card">
    <p><strong>How it works</strong></p>
    <p>
      Each todo item gets an <code>item$</code> stream that updates over time (no re-create).<br/>
      Internal event streams (toggle / rename / remove) are created once and dispatch actions upstream.
    </p>
  </div>
`

// -----------------------------
// Counter
// -----------------------------
const valueEl = document.querySelector<HTMLSpanElement>('#value')!
const incBtn = document.querySelector<HTMLButtonElement>('#inc')!

const inc$ = events<MouseEvent>(incBtn, 'click').pipe(map(() => 1))

const count$ = inc$.pipe(
  startWith(0),
  scan((acc, n) => acc + n, 0),
  remember(),
)

// -----------------------------
// Todos (mini components)
// -----------------------------
type Todo = { id: string; label: string; done: boolean }
type Action =
  | { type: 'add' }
  | { type: 'toggle'; id: string }
  | { type: 'rename'; id: string; label: string }
  | { type: 'remove'; id: string }

const todosEl = document.querySelector<HTMLUListElement>('#todos')!
const addBtn = document.querySelector<HTMLButtonElement>('#add')!

// A shared action bus. Components dispatch into this.
const actions$ = new Subject<Action>()

// top-level "add" source -> action package
const add$ = events<MouseEvent>(addBtn, 'click').pipe(map(() => ({ type: 'add' as const })))

// reducer decides how state changes over time
const reduceTodos = (todos: Todo[], a: Action): Todo[] => {
  switch (a.type) {
    case 'add': {
      const n = todos.length + 1
      return [...todos, { id: String(n), label: `Todo ${n}`, done: false }]
    }
    case 'toggle':
      return todos.map((t) => (t.id === a.id ? { ...t, done: !t.done } : t))
    case 'rename':
      return todos.map((t) => (t.id === a.id ? { ...t, label: a.label } : t))
    case 'remove':
      return todos.filter((t) => t.id !== a.id)
  }
}

const todos$ = actions$.pipe(
  startWith({ type: 'add' as const }),
  scan(reduceTodos, [] as Todo[]),
  remember(),
)

// Component factory: item$ updates for the same key across time
const todoComponent = (item$: import('rxjs').Observable<Todo>, { dispatch }: { dispatch: (a: Action) => void }, id: string) => {
  const li = document.createElement('li')
  li.className = 'todo'

  const label = document.createElement('span')
  label.className = 'label'

  const toggleBtn = document.createElement('button')
  toggleBtn.textContent = 'Toggle'

  const removeBtn = document.createElement('button')
  removeBtn.textContent = 'Remove'

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Rename...'

  li.append(label, toggleBtn, input, removeBtn)

  // render from item$ (no re-create on updates)
  const sub = new Subscription()
  sub.add(text(label)(item$.pipe(map((t) => t.label), distinctUntilChanged())))
  sub.add(classToggle(li, 'done')(item$.pipe(map((t) => t.done), distinctUntilChanged())))

  // internal events -> actions (created once)
  const toggle$ = events<MouseEvent>(toggleBtn, 'click').pipe(map(() => ({ type: 'toggle' as const, id })))
  const remove$ = events<MouseEvent>(removeBtn, 'click').pipe(map(() => ({ type: 'remove' as const, id })))

  // rename on input events (simple demo; could debounce later)
  const rename$ = events<InputEvent>(input, 'input').pipe(
    map(() => ({ type: 'rename' as const, id, label: input.value })),
  )

  sub.add(dispatch({ next: dispatch })(toggle$))
  sub.add(dispatch({ next: dispatch })(remove$))
  sub.add(dispatch({ next: dispatch })(rename$))

  return { node: li, sub }
}

// Mount everything
const view = mount(app, () => [
  text(valueEl)(count$),
  dispatch(actions$)(add$),
  renderKeyedComponents<Todo, Action>(todosEl, (t) => t.id, todoComponent, actions$)(todos$),
])

if (import.meta.hot) {
  import.meta.hot.dispose(() => view.unsubscribe())
}
