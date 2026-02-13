import { Subscription, combineLatest, of } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { createStore, ofType } from '@rxjs-spa/store'
import { attr, classToggle, events, mount, renderKeyedList, text } from '@rxjs-spa/dom'
import type { Router, RouteParams } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { GlobalState, GlobalAction } from '../store/global.store'
import type { Post, User } from '../types'
import { api } from '../api/api'

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

export function userDetailView(
  container: Element,
  _globalStore: Store<GlobalState, GlobalAction>,
  router: Router<'home' | 'users' | 'user-detail'>,
  params: RouteParams,
): Subscription {
  const { id } = params

  // ── DOM ───────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <section class="view user-detail-view">
      <p><a id="back-link" href="${router.link('/users')}" class="back-link">← All users</a></p>

      <div id="loading-msg" class="loading hidden">Loading…</div>
      <div id="error-msg"   class="error hidden"></div>

      <div id="profile-card" class="card profile-card hidden">
        <div class="profile-header">
          <div class="profile-avatar"></div>
          <div>
            <h1 id="user-name"></h1>
            <p id="user-username" class="muted"></p>
          </div>
        </div>
        <div class="profile-meta">
          <span>✉ <span id="user-email"></span></span>
          <span>📞 <span id="user-phone"></span></span>
          <span>🌐 <a id="user-website" href="" target="_blank"></a></span>
          <span>🏢 <span id="user-company"></span></span>
          <span>📍 <span id="user-address"></span></span>
        </div>
      </div>

      <div id="posts-section" class="hidden">
        <h2>Posts</h2>
        <ul id="post-list" class="post-list"></ul>
      </div>
    </section>
  `

  const loadingEl   = container.querySelector<HTMLElement>('#loading-msg')!
  const errorEl     = container.querySelector<HTMLElement>('#error-msg')!
  const profileCard = container.querySelector<HTMLElement>('#profile-card')!
  const postsSection = container.querySelector<HTMLElement>('#posts-section')!
  const postListEl  = container.querySelector<HTMLUListElement>('#post-list')!

  const nameEl      = container.querySelector<HTMLElement>('#user-name')!
  const usernameEl  = container.querySelector<HTMLElement>('#user-username')!
  const emailEl     = container.querySelector<HTMLElement>('#user-email')!
  const phoneEl     = container.querySelector<HTMLElement>('#user-phone')!
  const websiteEl   = container.querySelector<HTMLAnchorElement>('#user-website')!
  const companyEl   = container.querySelector<HTMLElement>('#user-company')!
  const addressEl   = container.querySelector<HTMLElement>('#user-address')!
  const avatarEls   = container.querySelectorAll<HTMLElement>('.profile-avatar')

  // ── Local store ───────────────────────────────────────────────────────────
  const store = createStore<UserDetailState, UserDetailAction>(userDetailReducer, INITIAL)

  // ── Effect: FETCH → parallel HTTP calls ───────────────────────────────────
  const effectSub = store.actions$.pipe(
    ofType('FETCH'),
    switchMap(({ userId }) =>
      combineLatest([
        api.users.get(userId),
        api.posts.byUser(userId),
      ]).pipe(
        map(([user, posts]) => ({ type: 'FETCH_SUCCESS' as const, user, posts })),
        catchError(err =>
          of({ type: 'FETCH_ERROR' as const, error: String((err as Error).message) }),
        ),
      ),
    ),
  ).subscribe(action => store.dispatch(action))

  // Trigger load
  store.dispatch({ type: 'FETCH', userId: id })

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasUser$ = store.select(s => s.user !== null)
  const user$    = store.select(s => s.user)
  const posts$   = store.select(s => s.posts)

  return mount(container, () => [
    effectSub,

    // Loading / error visibility
    classToggle(loadingEl,    'hidden')(store.select(s => !s.loading)),
    classToggle(loadingEl,    'visible')(store.select(s => s.loading)),
    classToggle(errorEl,      'hidden')(store.select(s => s.error === null)),
    text(errorEl)(store.select(s => s.error ?? '')),

    // Profile card visibility
    classToggle(profileCard,   'hidden')(hasUser$.pipe(map(h => !h))),
    classToggle(postsSection,  'hidden')(hasUser$.pipe(map(h => !h))),

    // Profile fields (guard with nullish coalescing)
    text(nameEl)(user$.pipe(map(u => u?.name ?? ''))),
    text(usernameEl)(user$.pipe(map(u => u ? `@${u.username}` : ''))),
    text(emailEl)(user$.pipe(map(u => u?.email ?? ''))),
    text(phoneEl)(user$.pipe(map(u => u?.phone ?? ''))),
    text(websiteEl)(user$.pipe(map(u => u?.website ?? ''))),
    attr(websiteEl, 'href')(user$.pipe(map(u => u ? `https://${u.website}` : null))),
    text(companyEl)(user$.pipe(map(u => u?.company.name ?? ''))),
    text(addressEl)(user$.pipe(map(u => u ? `${u.address.street}, ${u.address.city}` : ''))),

    // Initials avatar
    ...Array.from(avatarEls).map(el =>
      text(el)(user$.pipe(map(u => u?.name.charAt(0).toUpperCase() ?? ''))),
    ),

    // Post list
    renderKeyedList<Post>(
      postListEl,
      p => String(p.id),
      p => {
        const li = document.createElement('li')
        li.className = 'post-item'
        li.innerHTML = `
          <strong class="post-title">${p.title}</strong>
          <p class="post-body">${p.body}</p>
        `
        return { node: li }
      },
    )(posts$),
  ])
}
