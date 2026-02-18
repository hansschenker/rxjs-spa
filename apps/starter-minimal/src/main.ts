import { of } from 'rxjs'
import { map, distinctUntilChanged } from 'rxjs/operators'
import { html, list, when } from '@rxjs-spa/dom'
import { createStore } from '@rxjs-spa/store'
import type { LiveValue } from '@rxjs-spa/dom'

import './style.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Column {
  id: string
  title: string
}

interface Card {
  id: string
  columnId: string
  title: string
  description: string
  color: string
  order: number
}

interface DragState {
  cardId: string
  sourceColumnId: string
}

interface BoardState {
  columns: Column[]
  cards: Card[]
  dragState: DragState | null
  dragOverColumnId: string | null
  editingCardId: string | null
  addingToColumnId: string | null
  editingColumnId: string | null
  addingColumn: boolean
  nextId: number
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type BoardAction =
  | { type: 'ADD_COLUMN'; title: string }
  | { type: 'REMOVE_COLUMN'; columnId: string }
  | { type: 'RENAME_COLUMN'; columnId: string; title: string }
  | { type: 'SET_EDITING_COLUMN'; columnId: string | null }
  | { type: 'SET_ADDING_COLUMN'; adding: boolean }
  | { type: 'ADD_CARD'; columnId: string; title: string }
  | { type: 'REMOVE_CARD'; cardId: string }
  | { type: 'UPDATE_CARD'; cardId: string; title: string; description: string; color: string }
  | { type: 'SET_EDITING_CARD'; cardId: string | null }
  | { type: 'SET_ADDING_TO_COLUMN'; columnId: string | null }
  | { type: 'DRAG_START'; cardId: string; sourceColumnId: string }
  | { type: 'DRAG_OVER_COLUMN'; columnId: string }
  | { type: 'DROP'; targetColumnId: string }
  | { type: 'DRAG_END' }

// ---------------------------------------------------------------------------
// Label colors
// ---------------------------------------------------------------------------

const LABEL_COLORS = ['', '#61bd4f', '#f2d600', '#ff9f1a', '#eb5a46', '#c377e0', '#0079bf', '#00c2e0', '#51e898', '#ff78cb']

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: BoardState = {
  columns: [
    { id: 'col-1', title: 'To Do' },
    { id: 'col-2', title: 'In Progress' },
    { id: 'col-3', title: 'Done' },
  ],
  cards: [
    { id: 'card-1', columnId: 'col-1', title: 'Set up project structure', description: '', color: '#0079bf', order: 0 },
    { id: 'card-2', columnId: 'col-1', title: 'Design database schema', description: 'Define tables and relationships', color: '#f2d600', order: 1 },
    { id: 'card-3', columnId: 'col-1', title: 'Write user stories', description: '', color: '', order: 2 },
    { id: 'card-4', columnId: 'col-2', title: 'Implement authentication', description: 'OAuth2 + JWT tokens', color: '#eb5a46', order: 0 },
    { id: 'card-5', columnId: 'col-2', title: 'Build REST API endpoints', description: '', color: '#61bd4f', order: 1 },
    { id: 'card-6', columnId: 'col-3', title: 'Configure CI/CD pipeline', description: 'GitHub Actions', color: '#c377e0', order: 0 },
  ],
  dragState: null,
  dragOverColumnId: null,
  editingCardId: null,
  addingToColumnId: null,
  editingColumnId: null,
  addingColumn: false,
  nextId: 7,
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'ADD_COLUMN': {
      const id = `col-${state.nextId}`
      return {
        ...state,
        columns: [...state.columns, { id, title: action.title }],
        addingColumn: false,
        nextId: state.nextId + 1,
      }
    }
    case 'REMOVE_COLUMN':
      return {
        ...state,
        columns: state.columns.filter(c => c.id !== action.columnId),
        cards: state.cards.filter(c => c.columnId !== action.columnId),
      }
    case 'RENAME_COLUMN':
      return {
        ...state,
        columns: state.columns.map(c =>
          c.id === action.columnId ? { ...c, title: action.title } : c,
        ),
        editingColumnId: null,
      }
    case 'SET_EDITING_COLUMN':
      return { ...state, editingColumnId: action.columnId }
    case 'SET_ADDING_COLUMN':
      return { ...state, addingColumn: action.adding }
    case 'ADD_CARD': {
      const colCards = state.cards.filter(c => c.columnId === action.columnId)
      const id = `card-${state.nextId}`
      const card: Card = {
        id,
        columnId: action.columnId,
        title: action.title,
        description: '',
        color: '',
        order: colCards.length,
      }
      return {
        ...state,
        cards: [...state.cards, card],
        nextId: state.nextId + 1,
      }
    }
    case 'REMOVE_CARD':
      return {
        ...state,
        cards: state.cards.filter(c => c.id !== action.cardId),
        editingCardId: state.editingCardId === action.cardId ? null : state.editingCardId,
      }
    case 'UPDATE_CARD':
      return {
        ...state,
        cards: state.cards.map(c =>
          c.id === action.cardId
            ? { ...c, title: action.title, description: action.description, color: action.color }
            : c,
        ),
        editingCardId: null,
      }
    case 'SET_EDITING_CARD':
      return { ...state, editingCardId: action.cardId }
    case 'SET_ADDING_TO_COLUMN':
      return { ...state, addingToColumnId: action.columnId }
    case 'DRAG_START':
      return { ...state, dragState: { cardId: action.cardId, sourceColumnId: action.sourceColumnId } }
    case 'DRAG_OVER_COLUMN':
      return { ...state, dragOverColumnId: action.columnId }
    case 'DROP': {
      if (!state.dragState) return state
      const { cardId } = state.dragState
      const targetCards = state.cards.filter(c => c.columnId === action.targetColumnId)
      return {
        ...state,
        cards: state.cards.map(c =>
          c.id === cardId
            ? { ...c, columnId: action.targetColumnId, order: targetCards.length }
            : c,
        ),
        dragState: null,
        dragOverColumnId: null,
      }
    }
    case 'DRAG_END':
      return { ...state, dragState: null, dragOverColumnId: null }
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = createStore<BoardState, BoardAction>(reducer, INITIAL_STATE)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const columns$ = store.select(s => s.columns)
const dragOverColumnId$ = store.select(s => s.dragOverColumnId)
const dragCardId$ = store.select(s => s.dragState?.cardId ?? null)

function cardsForColumn$(columnId: string) {
  return store.state$.pipe(
    map(s => s.cards.filter(c => c.columnId === columnId).sort((a, b) => a.order - b.order)),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )
}

// ---------------------------------------------------------------------------
// Card template
// ---------------------------------------------------------------------------

function cardTemplate(card$: LiveValue<Card>, _key: string) {
  const cardId$ = card$.pipe(map(c => c.id), distinctUntilChanged())
  const title$ = card$.pipe(map(c => c.title), distinctUntilChanged())
  const desc$ = card$.pipe(map(c => c.description), distinctUntilChanged())
  const color$ = card$.pipe(map(c => c.color), distinctUntilChanged())
  const colorStyle$ = color$.pipe(map(c => c ? `border-left: 4px solid ${c}` : ''))

  const isEditing$ = store.state$.pipe(
    map(s => s.editingCardId === card$.snapshot().id),
    distinctUntilChanged(),
  )

  const isDragging$ = dragCardId$.pipe(
    map(id => id === card$.snapshot().id),
    distinctUntilChanged(),
  )
  const draggingClass$ = isDragging$.pipe(map(d => d ? 'kanban-card dragging' : 'kanban-card'))

  return html`
    <div
      class="${draggingClass$}"
      style="${colorStyle$}"
      draggable="true"
      @dragstart=${(e: DragEvent) => {
        const card = card$.snapshot()
        e.dataTransfer!.effectAllowed = 'move'
        e.dataTransfer!.setData('text/plain', card.id)
        // Delay so the dragging class applies after the drag image is captured
        requestAnimationFrame(() => {
          store.dispatch({ type: 'DRAG_START', cardId: card.id, sourceColumnId: card.columnId })
        })
      }}
      @dragend=${() => store.dispatch({ type: 'DRAG_END' })}
    >
      ${when(
        isEditing$,
        () => cardEditForm(card$),
        () => html`
          <div class="card-content">
            ${when(
              color$.pipe(map(c => c !== '')),
              () => html`<div class="card-label" style="background: ${color$}"></div>`,
            )}
            <p class="card-title">${title$}</p>
            ${when(
              desc$.pipe(map(d => d !== '')),
              () => html`<p class="card-desc">${desc$}</p>`,
            )}
          </div>
          <div class="card-actions">
            <button
              class="card-btn card-btn-edit"
              title="Edit"
              @click=${() => store.dispatch({ type: 'SET_EDITING_CARD', cardId: card$.snapshot().id })}
            >✎</button>
            <button
              class="card-btn card-btn-delete"
              title="Delete"
              @click=${() => store.dispatch({ type: 'REMOVE_CARD', cardId: card$.snapshot().id })}
            >×</button>
          </div>
        `,
      )}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Card edit form
// ---------------------------------------------------------------------------

function cardEditForm(card$: LiveValue<Card>) {
  const card = card$.snapshot()

  return html`
    <div class="card-edit-form" @click=${(e: Event) => e.stopPropagation()}>
      <input
        class="card-edit-title"
        type="text"
        .value="${card.title}"
        placeholder="Card title"
        id=${'edit-title-' + card.id}
      />
      <textarea
        class="card-edit-desc"
        placeholder="Add a description…"
        rows="3"
        id=${'edit-desc-' + card.id}
      >${card.description}</textarea>
      <div class="color-picker">
        ${list(
          of(LABEL_COLORS),
          (c, i) => String(i),
          (color$) => html`
            <button
              class="color-swatch"
              style="${color$.pipe(map(c => `background: ${c || '#ddd'}`))}"
              title="${color$.pipe(map(c => c || 'No label'))}"
              @click=${(e: Event) => {
                const parent = (e.target as HTMLElement).parentElement!
                parent.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'))
                ;(e.target as HTMLElement).classList.add('active')
                ;(e.target as HTMLElement).dataset['color'] = color$.snapshot()
              }}
            ></button>
          `,
        )}
      </div>
      <div class="card-edit-actions">
        <button class="btn btn-primary" @click=${() => {
          const titleEl = document.getElementById(`edit-title-${card.id}`) as HTMLInputElement
          const descEl = document.getElementById(`edit-desc-${card.id}`) as HTMLTextAreaElement
          const activeColor = document.querySelector(`#edit-title-${card.id}`)
            ?.closest('.card-edit-form')
            ?.querySelector('.color-swatch.active') as HTMLElement | null
          const color = activeColor?.dataset['color'] ?? card.color
          const title = titleEl?.value.trim() || card.title
          const description = descEl?.value ?? card.description
          store.dispatch({ type: 'UPDATE_CARD', cardId: card.id, title, description, color })
        }}>Save</button>
        <button class="btn btn-ghost" @click=${() =>
          store.dispatch({ type: 'SET_EDITING_CARD', cardId: null })
        }>Cancel</button>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Column template
// ---------------------------------------------------------------------------

function columnTemplate(column$: LiveValue<Column>, _key: string) {
  const colId$ = column$.pipe(map(c => c.id), distinctUntilChanged())
  const colTitle$ = column$.pipe(map(c => c.title), distinctUntilChanged())

  // Derive column-specific streams
  const cards$ = store.state$.pipe(
    map(s => {
      const colId = column$.snapshot().id
      return s.cards.filter(c => c.columnId === colId).sort((a, b) => a.order - b.order)
    }),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )

  const cardCount$ = cards$.pipe(map(c => c.length), distinctUntilChanged())

  const isAdding$ = store.state$.pipe(
    map(s => s.addingToColumnId === column$.snapshot().id),
    distinctUntilChanged(),
  )

  const isEditingColumn$ = store.state$.pipe(
    map(s => s.editingColumnId === column$.snapshot().id),
    distinctUntilChanged(),
  )

  const isDragOver$ = dragOverColumnId$.pipe(
    map(id => id === column$.snapshot().id),
    distinctUntilChanged(),
  )
  const columnClass$ = isDragOver$.pipe(map(d => d ? 'kanban-column drag-over' : 'kanban-column'))

  return html`
    <div
      class="${columnClass$}"
      @dragover=${(e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'
        store.dispatch({ type: 'DRAG_OVER_COLUMN', columnId: column$.snapshot().id })
      }}
      @dragleave=${() => store.dispatch({ type: 'DRAG_OVER_COLUMN', columnId: '' })}
      @drop=${(e: DragEvent) => {
        e.preventDefault()
        store.dispatch({ type: 'DROP', targetColumnId: column$.snapshot().id })
      }}
    >
      <div class="column-header">
        ${when(
          isEditingColumn$,
          () => {
            const col = column$.snapshot()
            return html`
              <input
                class="column-title-input"
                type="text"
                .value="${col.title}"
                id=${'edit-col-' + col.id}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    const title = (e.target as HTMLInputElement).value.trim()
                    if (title) {
                      store.dispatch({ type: 'RENAME_COLUMN', columnId: col.id, title })
                    }
                  }
                  if (e.key === 'Escape') {
                    store.dispatch({ type: 'SET_EDITING_COLUMN', columnId: null })
                  }
                }}
                @blur=${(e: Event) => {
                  const title = (e.target as HTMLInputElement).value.trim()
                  if (title) {
                    store.dispatch({ type: 'RENAME_COLUMN', columnId: col.id, title })
                  } else {
                    store.dispatch({ type: 'SET_EDITING_COLUMN', columnId: null })
                  }
                }}
              />
            `
          },
          () => html`
            <h2
              class="column-title"
              @dblclick=${() => store.dispatch({ type: 'SET_EDITING_COLUMN', columnId: column$.snapshot().id })}
            >${colTitle$}</h2>
          `,
        )}
        <span class="column-count">${cardCount$}</span>
        <button
          class="column-menu-btn"
          title="Delete column"
          @click=${() => {
            store.dispatch({ type: 'REMOVE_COLUMN', columnId: column$.snapshot().id })
          }}
        >×</button>
      </div>

      <div class="column-cards">
        ${list(cards$, c => c.id, cardTemplate)}
      </div>

      <div class="column-footer">
        <div class="${isAdding$.pipe(map(a => a ? 'add-card-form' : 'add-card-form is-hidden'))}">
          <textarea
            class="add-card-input"
            placeholder="Enter a title for this card…"
            rows="2"
            id=${'add-card-input-' + column$.snapshot().id}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const input = e.target as HTMLTextAreaElement
                const title = input.value.trim()
                if (title) {
                  store.dispatch({ type: 'ADD_CARD', columnId: column$.snapshot().id, title })
                  input.value = ''
                }
              }
              if (e.key === 'Escape') {
                store.dispatch({ type: 'SET_ADDING_TO_COLUMN', columnId: null })
              }
            }}
          ></textarea>
          <div class="add-card-actions">
            <button class="btn btn-primary" @click=${() => {
              const colId = column$.snapshot().id
              const input = document.getElementById(`add-card-input-${colId}`) as HTMLTextAreaElement
              const title = input?.value.trim()
              if (title) {
                store.dispatch({ type: 'ADD_CARD', columnId: colId, title })
                input.value = ''
              }
            }}>Add Card</button>
            <button class="btn btn-ghost" @click=${() =>
              store.dispatch({ type: 'SET_ADDING_TO_COLUMN', columnId: null })
            }>×</button>
          </div>
        </div>
        <button
          class="${isAdding$.pipe(map(a => a ? 'add-card-btn is-hidden' : 'add-card-btn'))}"
          @click=${() => store.dispatch({ type: 'SET_ADDING_TO_COLUMN', columnId: column$.snapshot().id })}
        >+ Add a card</button>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Add column form
// ---------------------------------------------------------------------------

const isAddingColumn$ = store.select(s => s.addingColumn)

// ---------------------------------------------------------------------------
// App template
// ---------------------------------------------------------------------------

const { fragment, sub } = html`
  <div class="kanban-app">
    <header class="kanban-header">
      <h1>Kanban Board</h1>
      <span class="header-subtitle">rxjs-spa</span>
    </header>

    <div class="kanban-board">
      ${list(columns$, c => c.id, columnTemplate)}

      <div class="add-column-wrapper">
        ${when(
          isAddingColumn$,
          () => html`
            <div class="add-column-form">
              <input
                class="add-column-input"
                type="text"
                placeholder="Enter list title…"
                id="add-column-input"
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    const title = (e.target as HTMLInputElement).value.trim()
                    if (title) {
                      store.dispatch({ type: 'ADD_COLUMN', title })
                    }
                  }
                  if (e.key === 'Escape') {
                    store.dispatch({ type: 'SET_ADDING_COLUMN', adding: false })
                  }
                }}
              />
              <div class="add-column-actions">
                <button class="btn btn-primary" @click=${() => {
                  const input = document.getElementById('add-column-input') as HTMLInputElement
                  const title = input?.value.trim()
                  if (title) {
                    store.dispatch({ type: 'ADD_COLUMN', title })
                  }
                }}>Add List</button>
                <button class="btn btn-ghost" @click=${() =>
                  store.dispatch({ type: 'SET_ADDING_COLUMN', adding: false })
                }>×</button>
              </div>
            </div>
          `,
          () => html`
            <button
              class="add-column-btn"
              @click=${() => store.dispatch({ type: 'SET_ADDING_COLUMN', adding: true })}
            >+ Add another list</button>
          `,
        )}
      </div>
    </div>
  </div>
`

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('app')!
root.appendChild(fragment)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sub.unsubscribe()
    root.innerHTML = ''
  })
}
