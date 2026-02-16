import { Subscription, combineLatest } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { createStore, ofType } from '@rxjs-spa/store'
import { catchAndReport } from '@rxjs-spa/errors'
import { defineComponent, html } from '@rxjs-spa/dom'
import type { Router, RouteParams } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { GlobalState, GlobalAction } from '../store/global.store'
import type { Post, User } from '../types'
import { api } from '../api/api'
import { errorHandler } from '../error-handler'

// ---------------------------------------------------------------------------
// Model / Action / Reducer
// ---------------------------------------------------------------------------

interface UserDetailState {
  user: User | null
  posts: Post[]
  loading: boolean
  error: string | null
}

type UserDetailAction =
  | { type: 'FETCH'; userId: string }
  | { type: 'FETCH_SUCCESS'; user: User; posts: Post[] }
  | { type: 'FETCH_ERROR'; error: string }

function userDetailReducer(state: UserDetailState, action: UserDetailAction): UserDetailState {
  switch (action.type) {
    case 'FETCH':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, user: action.user, posts: action.posts }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error }
  }
}

const INITIAL: UserDetailState = { user: null, posts: [], loading: false, error: null }

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const userDetailView = defineComponent<{
  globalStore: Store<GlobalState, GlobalAction>,
  router: Router<any>,
  params: RouteParams
}>(({ router, params }) => {
  const { id } = params

  // ── Local store ───────────────────────────────────────────────────────────
  const store = createStore<UserDetailState, UserDetailAction>(userDetailReducer, INITIAL)

  // ── Effect: FETCH → parallel HTTP calls ───────────────────────────────────
  // Note: we subscribe to this effect in the component body, which is fine
  const effectSub = store.actions$.pipe(
    ofType('FETCH'),
    switchMap(({ userId }) =>
      combineLatest([
        api.users.get(userId),
        api.posts.byUser(userId),
      ]).pipe(
        map(([user, posts]) => ({ type: 'FETCH_SUCCESS' as const, user, posts })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load user details' },
          context: 'userDetailView/FETCH',
        }),
      ),
    ),
  ).subscribe(action => store.dispatch(action))

  // Trigger load
  // If id is present in params, fetch.
  if (id) {
    store.dispatch({ type: 'FETCH', userId: id })
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasUser$ = store.select(s => s.user !== null)
  const user$ = store.select(s => s.user)
  const posts$ = store.select(s => s.posts)
  const loading$ = store.select(s => s.loading)
  const error$ = store.select(s => s.error)

  // Classes / Visibility
  const loadingClass$ = loading$.pipe(map(l => l ? 'loading visible' : 'loading hidden'))
  const errorClass$ = error$.pipe(map(e => e ? 'error visible' : 'error hidden'))
  const contentClass$ = hasUser$.pipe(map(h => h ? 'visible' : 'hidden'))

  // ── Render ────────────────────────────────────────────────────────────────
  return html`
    <section class="view user-detail-view">
      <p><a id="back-link" href="${router.link('/users')}" class="back-link">← All users</a></p>

      <div id="loading-msg" class="${loadingClass$}">Loading…</div>
      <div id="error-msg"   class="${errorClass$}">${error$.pipe(map(e => e ?? ''))}</div>

      <!-- Profile Card -->
      <div id="profile-card" class="card profile-card ${contentClass$}">
        <div class="profile-header">
          <div class="profile-avatar">
            ${user$.pipe(map(u => u?.name.charAt(0).toUpperCase() ?? ''))}
          </div>
          <div>
            <h1 id="user-name">${user$.pipe(map(u => u?.name ?? ''))}</h1>
            <p id="user-username" class="muted">${user$.pipe(map(u => u ? `@${u.username}` : ''))}</p>
          </div>
        </div>
        <div class="profile-meta">
          <span>✉ <span>${user$.pipe(map(u => u?.email ?? ''))}</span></span>
          <span>📞 <span>${user$.pipe(map(u => u?.phone ?? ''))}</span></span>
          <span>🌐 <a href="${user$.pipe(map(u => u ? `https://${u.website}` : ''))}" target="_blank">
            ${user$.pipe(map(u => u?.website ?? ''))}
          </a></span>
          <span>🏢 <span>${user$.pipe(map(u => u?.company.name ?? ''))}</span></span>
          <span>📍 <span>${user$.pipe(map(u => u ? `${u.address.street}, ${u.address.city}` : ''))}</span></span>
        </div>
      </div>

      <!-- Posts Section -->
      <div id="posts-section" class="${contentClass$}">
        <h2>Posts</h2>
        <ul id="post-list" class="post-list">
          ${posts$.pipe(
    map(posts => posts.map(p => html`
              <li class="post-item">
                <strong class="post-title">${p.title}</strong>
                <p class="post-body">${p.body}</p>
              </li>
            `))
  )}
        </ul>
      </div>
    </section>
  `
})
