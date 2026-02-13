import { Subscription, of } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { createStore, ofType } from '@rxjs-spa/store'
import { http, toRemoteData, isLoading, isSuccess, isError } from '@rxjs-spa/http'
import { attr, classToggle, events, mount, renderKeyedComponents, text } from '@rxjs-spa/dom'
import type { Router } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { GlobalState, GlobalAction } from '../store/global.store'
import type { User } from '../types'
import { api } from '../api/api'

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
// User card mini-component
// ---------------------------------------------------------------------------

type UserCardAction = never // cards don't dispatch actions upward in this view

function userCard(
  item$: import('rxjs').Observable<User>,
  _ctx: { dispatch: (a: UserCardAction) => void },
  router: Router<'home' | 'users' | 'user-detail'>,
): { node: Node; sub: Subscription } {
  const li = document.createElement('li')
  li.className = 'user-card'
  li.innerHTML = `
    <div class="user-avatar"></div>
    <div class="user-info">
      <strong class="user-name"></strong>
      <span class="user-email"></span>
      <span class="user-company"></span>
    </div>
    <a class="user-link btn-outline" href="">View profile →</a>
  `

  const nameEl    = li.querySelector<HTMLElement>('.user-name')!
  const emailEl   = li.querySelector<HTMLElement>('.user-email')!
  const companyEl = li.querySelector<HTMLElement>('.user-company')!
  const linkEl    = li.querySelector<HTMLAnchorElement>('.user-link')!
  const avatarEl  = li.querySelector<HTMLElement>('.user-avatar')!

  const sub = new Subscription()
  sub.add(text(nameEl)(item$.pipe(map(u => u.name))))
  sub.add(text(emailEl)(item$.pipe(map(u => u.email))))
  sub.add(text(companyEl)(item$.pipe(map(u => u.company.name))))
  sub.add(attr(linkEl, 'href')(item$.pipe(map(u => router.link(`/users/${u.id}`)))))
  // Initials avatar
  sub.add(text(avatarEl)(item$.pipe(map(u => u.name.charAt(0).toUpperCase()))))

  return { node: li, sub }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function usersView(
  container: Element,
  _globalStore: Store<GlobalState, GlobalAction>,
  router: Router<'home' | 'users' | 'user-detail'>,
): Subscription {
  // ── DOM ───────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <section class="view users-view">
      <h1>Users</h1>
      <p>Data from <a href="https://jsonplaceholder.typicode.com" target="_blank">JSONPlaceholder</a></p>

      <div class="toolbar">
        <input id="search-input" type="search" placeholder="Filter by name…" />
        <button id="refresh-btn">Refresh</button>
      </div>

      <p id="error-msg" class="error hidden"></p>
      <p id="loading-msg" class="loading hidden">Loading…</p>

      <ul id="user-list" class="user-list"></ul>
    </section>
  `

  const searchInput = container.querySelector<HTMLInputElement>('#search-input')!
  const refreshBtn  = container.querySelector<HTMLButtonElement>('#refresh-btn')!
  const errorMsg    = container.querySelector<HTMLElement>('#error-msg')!
  const loadingMsg  = container.querySelector<HTMLElement>('#loading-msg')!
  const userListEl  = container.querySelector<HTMLUListElement>('#user-list')!

  // ── Local store ───────────────────────────────────────────────────────────
  const store = createStore<UsersState, UsersAction>(usersReducer, INITIAL)

  // ── Effect: FETCH → HTTP → FETCH_SUCCESS | FETCH_ERROR ───────────────────
  const effectSub = store.actions$.pipe(
    ofType('FETCH'),
    switchMap(() =>
      api.users.list().pipe(
        map(users => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchError(err =>
          of({ type: 'FETCH_ERROR' as const, error: String((err as Error).message) }),
        ),
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

  const noResultSubject = new Subscription()

  return mount(container, () => [
    effectSub,

    // Search input → SET_SEARCH
    events(searchInput, 'input').subscribe(() =>
      store.dispatch({ type: 'SET_SEARCH', query: searchInput.value }),
    ),

    // Refresh button → FETCH
    events(refreshBtn, 'click').subscribe(() => store.dispatch({ type: 'FETCH' })),

    // Show/hide loading
    classToggle(loadingMsg, 'hidden')(store.select(s => !s.loading)),
    classToggle(loadingMsg, 'visible')(store.select(s => s.loading)),

    // Show/hide error
    classToggle(errorMsg, 'hidden')(store.select(s => s.error === null)),
    text(errorMsg)(store.select(s => s.error ?? '')),

    // Render keyed user cards
    renderKeyedComponents<User, UserCardAction>(
      userListEl,
      u => String(u.id),
      (item$, ctx) => userCard(item$, ctx, router),
      { next: () => {} }, // no upward actions from cards
    )(filteredUsers$),
  ])
}
