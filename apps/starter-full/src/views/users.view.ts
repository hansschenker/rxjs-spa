import { map, switchMap } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import { createStore, ofType } from '@rxjs-spa/store'
import { catchAndReport } from '@rxjs-spa/errors'
import type { Router } from '@rxjs-spa/router'
import { api } from '../api/api'
import { errorHandler } from '../error-handler'
import type { User } from '../api/api'

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
    case 'FETCH':         return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS': return { ...state, loading: false, users: action.users }
    case 'FETCH_ERROR':   return { ...state, loading: false, error: action.error }
    case 'SET_SEARCH':    return { ...state, search: action.query }
  }
}

const INITIAL: UsersState = { users: [], loading: false, error: null, search: '' }

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const usersView = defineComponent<{ router: Router<any> }>(({ router }) => {
  const store = createStore<UsersState, UsersAction>(usersReducer, INITIAL)

  // Effect: FETCH → HTTP → dispatch result
  store.actions$.pipe(
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

  // Derived streams
  const filteredUsers$ = store.state$.pipe(
    map(s => {
      const q = s.search.trim().toLowerCase()
      return q ? s.users.filter(u => u.name.toLowerCase().includes(q)) : s.users
    }),
  )

  const loadingClass$ = store.select(s => s.loading).pipe(
    map(l => l ? 'status visible' : 'status hidden'),
  )
  const errorClass$ = store.select(s => s.error).pipe(
    map(e => e ? 'status error visible' : 'status hidden'),
  )
  const errorText$ = store.select(s => s.error ?? '')

  return html`
    <section class="view">
      <h1>Users</h1>
      <p>Data from <a href="https://jsonplaceholder.typicode.com" target="_blank">JSONPlaceholder</a></p>

      <div class="toolbar">
        <input
          type="search"
          placeholder="Filter by name…"
          @input=${(e: Event) => store.dispatch({
            type: 'SET_SEARCH',
            query: (e.target as HTMLInputElement).value,
          })}
        />
        <button @click=${() => store.dispatch({ type: 'FETCH' })}>Refresh</button>
      </div>

      <p class="${errorClass$}">${errorText$}</p>
      <p class="${loadingClass$}">Loading…</p>

      <ul class="user-list">
        ${filteredUsers$.pipe(
          map(users => users.map(user => html`
            <li class="user-card">
              <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
              <div class="user-info">
                <strong>${user.name}</strong>
                <span class="user-email">${user.email}</span>
                <span class="user-company">${user.company.name}</span>
              </div>
              <a class="btn-outline" href="${router.link(`/users/${user.id}`)}">
                View profile →
              </a>
            </li>
          `)),
        )}
      </ul>
    </section>
  `
})
