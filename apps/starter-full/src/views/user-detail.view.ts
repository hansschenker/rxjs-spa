import { combineLatest } from 'rxjs'
import { map } from 'rxjs/operators'
import { defineComponent, html, when } from '@rxjs-spa/dom'
import { remember } from '@rxjs-spa/core'
import { toRemoteData, isSuccess, isLoading, isError } from '@rxjs-spa/http'
import type { Router } from '@rxjs-spa/router'
import { api } from '../api/api'

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const userDetailView = defineComponent<{
  router: Router<any>
  params: Record<string, string>
}>(({ router, params }) => {
  const userId = params['id']

  // Parallel fetch: user + posts
  const data$ = combineLatest([
    api.users.get(userId).pipe(toRemoteData()),
    api.posts.byUser(userId).pipe(toRemoteData()),
  ]).pipe(remember())

  const user$ = data$.pipe(map(([u]) => u))
  const posts$ = data$.pipe(map(([, p]) => p))

  const loading$ = data$.pipe(map(([u, p]) => isLoading(u) || isLoading(p)))
  const error$ = data$.pipe(map(([u, p]) =>
    isError(u) ? u.error : isError(p) ? p.error : null,
  ))

  return html`
    <section class="view">
      <button class="btn-back" @click=${() => router.navigate('/users')}>← Back to Users</button>

      ${when(loading$, () => html`<p class="status">Loading user…</p>`)}
      ${when(error$.pipe(map(e => e !== null)), () => html`<p class="status error">${error$}</p>`)}

      ${when(
        user$.pipe(map(u => isSuccess(u))),
        () => html`
          <div class="profile-card">
            <div class="profile-avatar">
              ${user$.pipe(map(u => isSuccess(u) ? u.data.name.charAt(0).toUpperCase() : ''))}
            </div>
            <div class="profile-info">
              <h1>${user$.pipe(map(u => isSuccess(u) ? u.data.name : ''))}</h1>
              <p class="user-email">${user$.pipe(map(u => isSuccess(u) ? u.data.email : ''))}</p>
              <p>${user$.pipe(map(u => isSuccess(u) ? u.data.phone : ''))}</p>
              <p>${user$.pipe(map(u => isSuccess(u) ? u.data.website : ''))}</p>
              <p>${user$.pipe(map(u => isSuccess(u) ? u.data.company.name : ''))}</p>
            </div>
          </div>
        `,
      )}

      ${when(
        posts$.pipe(map(p => isSuccess(p))),
        () => html`
          <h2 class="section-title">Posts</h2>
          <ul class="post-list">
            ${posts$.pipe(
              map(p => isSuccess(p)
                ? p.data.map(post => html`
                    <li class="post-card">
                      <h3>${post.title}</h3>
                      <p>${post.body}</p>
                    </li>
                  `)
                : [],
              ),
            )}
          </ul>
        `,
      )}
    </section>
  `
})
