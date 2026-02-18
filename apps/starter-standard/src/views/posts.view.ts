import { map, switchMap } from 'rxjs/operators'
import { defineComponent, html } from '@rxjs-spa/dom'
import { createStore, ofType } from '@rxjs-spa/store'
import { http } from '@rxjs-spa/http'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Post {
  id: number
  userId: number
  title: string
  body: string
}

// ---------------------------------------------------------------------------
// Model / Action / Reducer
// ---------------------------------------------------------------------------

interface PostsState {
  posts: Post[]
  loading: boolean
  error: string | null
  search: string
}

type PostsAction =
  | { type: 'FETCH' }
  | { type: 'FETCH_SUCCESS'; posts: Post[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_SEARCH'; query: string }

function postsReducer(state: PostsState, action: PostsAction): PostsState {
  switch (action.type) {
    case 'FETCH':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, posts: action.posts }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error }
    case 'SET_SEARCH':
      return { ...state, search: action.query }
  }
}

const INITIAL: PostsState = { posts: [], loading: false, error: null, search: '' }

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const postsView = defineComponent<Record<string, never>>((_props) => {
  const store = createStore<PostsState, PostsAction>(postsReducer, INITIAL)

  // Effect: FETCH → HTTP GET → dispatch result
  store.actions$.pipe(
    ofType('FETCH'),
    switchMap(() =>
      http.get<Post[]>('https://jsonplaceholder.typicode.com/posts').pipe(
        map(posts => ({ type: 'FETCH_SUCCESS' as const, posts: posts.slice(0, 20) })),
      ),
    ),
  ).subscribe({
    next: action => store.dispatch(action),
    error: () => store.dispatch({ type: 'FETCH_ERROR', error: 'Failed to load posts' }),
  })

  // Trigger initial load
  store.dispatch({ type: 'FETCH' })

  // Derived streams
  const filteredPosts$ = store.state$.pipe(
    map(s => {
      const q = s.search.trim().toLowerCase()
      return q ? s.posts.filter(p => p.title.toLowerCase().includes(q)) : s.posts
    }),
  )

  const loading$ = store.select(s => s.loading)
  const error$ = store.select(s => s.error)

  const loadingClass$ = loading$.pipe(map(l => l ? 'status visible' : 'status hidden'))
  const errorClass$ = error$.pipe(map(e => e ? 'status error visible' : 'status hidden'))

  return html`
    <section class="view">
      <h1>Posts</h1>
      <p>Fetched from <a href="https://jsonplaceholder.typicode.com" target="_blank">JSONPlaceholder</a></p>

      <div class="toolbar">
        <input
          type="search"
          placeholder="Filter posts…"
          @input=${(e: Event) => store.dispatch({
            type: 'SET_SEARCH',
            query: (e.target as HTMLInputElement).value,
          })}
        />
        <button @click=${() => store.dispatch({ type: 'FETCH' })}>Refresh</button>
      </div>

      <p class="${loadingClass$}">Loading…</p>
      <p class="${errorClass$}">${error$}</p>

      <ul class="post-list">
        ${filteredPosts$.pipe(
          map(posts => posts.map(post => html`
            <li class="post-card">
              <h3>${post.title}</h3>
              <p>${post.body}</p>
            </li>
          `)),
        )}
      </ul>
    </section>
  `
})
