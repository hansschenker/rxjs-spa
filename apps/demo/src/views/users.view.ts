import { Subscription } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { createStore, ofType } from '@rxjs-spa/store'
import { catchAndReport } from '@rxjs-spa/errors'
import { defineComponent, html } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { GlobalState, GlobalAction } from '../store/global.store'
import type { User } from '../types'
import { api } from '../api/api'
import { errorHandler } from '../error-handler'

// ---------------------------------------------------------------------------
// Model / Action / Reducer
// ---------------------------------------------------------------------------

interface UsersState {
  users: User[]
  loading: boolean
  error: string | null
  search: string
}

type UsersAction =
  | { type: 'FETCH' }
  | { type: 'FETCH_SUCCESS'; users: User[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_SEARCH'; query: string }

function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case 'FETCH':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, users: action.users }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error }
    case 'SET_SEARCH':
      return { ...state, search: action.query }
  }
}

const INITIAL: UsersState = { users: [], loading: false, error: null, search: '' }

// ---------------------------------------------------------------------------
// User card mini-component (now declarative)
// ---------------------------------------------------------------------------

function userCard(user: User, router: Router<any>) {
  return html`
    <li class="user-card">
      <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
      <div class="user-info">
        <strong class="user-name">${user.name}</strong>
        <span class="user-email">${user.email}</span>
        <span class="user-company">${user.company.name}</span>
      </div>
      <a class="user-link btn-outline" href="${router.link(`/users/${user.id}`)}">
        View profile →
      </a>
    </li>
  `
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const usersView = defineComponent<{
  globalStore: Store<GlobalState, GlobalAction>,
  router: Router<any>
}>(({ globalStore, router }) => {

  // ── Local store ───────────────────────────────────────────────────────────
  const store = createStore<UsersState, UsersAction>(usersReducer, INITIAL)

  // ── Effect: FETCH → HTTP → FETCH_SUCCESS | FETCH_ERROR ───────────────────
  const effectSub = store.actions$.pipe(
    ofType('FETCH'),
    switchMap(() =>
      api.users.list().pipe(
        map(users => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load users' },
          context: 'usersView/FETCH',
        }),
      ),
    ),
  ).subscribe(action => store.dispatch(action))

  // Trigger initial load
  store.dispatch({ type: 'FETCH' })

  // ── Derived streams ───────────────────────────────────────────────────────
  const filteredUsers$ = store.state$.pipe(
    map(s =>
      s.search.trim()
        ? s.users.filter(u => u.name.toLowerCase().includes(s.search.toLowerCase()))
        : s.users,
    ),
  )

  const loading$ = store.select(s => s.loading)
  const error$ = store.select(s => s.error)

  const loadingClass$ = loading$.pipe(map(l => l ? 'loading visible' : 'loading hidden'))
  const errorClass$ = error$.pipe(map(e => e ? 'error visible' : 'error hidden'))
  const errorText$ = error$.pipe(map(e => e ?? ''))

  // ── Render ────────────────────────────────────────────────────────────────
  return html`
    <section class="view users-view">
      <h1>Users</h1>
      <p>Data from <a href="https://jsonplaceholder.typicode.com" target="_blank">JSONPlaceholder</a></p>

      <div class="toolbar">
        <input 
          id="search-input" 
          type="search" 
          placeholder="Filter by name…" 
          @input=${(e: Event) => store.dispatch({ type: 'SET_SEARCH', query: (e.target as HTMLInputElement).value })}
        />
        <button id="refresh-btn" @click=${() => store.dispatch({ type: 'FETCH' })}>
          Refresh
        </button>
      </div>

      <p id="error-msg" class="${errorClass$}">${errorText$}</p>
      <p id="loading-msg" class="${loadingClass$}">Loading…</p>

      <ul id="user-list" class="user-list">
        ${filteredUsers$.pipe(
    map(users => users.map(u => userCard(u, router)))
  )}
      </ul>
    </section>
  `
})
