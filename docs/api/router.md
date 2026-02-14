# @rxjs-spa/router

Hash-based client router (`window.location.hash` + `hashchange`).

No server configuration required — works on any static host.

## createRouter

```ts
import { createRouter } from '@rxjs-spa/router'

const router = createRouter({
  '/':          'home',
  '/users':     'users',
  '/users/:id': 'user-detail',
})
```

Returns a `Router<N>`:

| Member | Description |
|--------|-------------|
| `route$` | `Observable<RouteMatch<N>>` — multicasted, replays current route. Emits only when the path actually changes. |
| `navigate(path)` | Imperatively navigate: sets `window.location.hash`. |
| `link(path)` | Returns a `#`-prefixed href string for use in `<a href="…">`. |

## createDataRouter (Phase 1)

```ts
import { createDataRouter } from '@rxjs-spa/router'
```

Adds route-level loaders and an outlet mount helper.

```ts
const router = createDataRouter({
  '/users': {
    name: 'users',
    loader: () => http.get<User[]>('/api/users'),
    pending: (outlet) => { outlet.textContent = 'Loading…' },
    error: (outlet, err) => { outlet.textContent = String(err) },
    mount: (outlet, { data }) => usersView(outlet, data),
  },
})

router.mount(document.querySelector('#outlet')!)
```

`DataRouter<N, D>` extends `Router<N>` with:

| Member | Description |
|--------|-------------|
| `routeState$` | `Observable<DataRouteState<N, D>>` with `{ status: 'loading' | 'success' | 'error' }` per route transition. |
| `mount(outlet)` | Subscribes to `routeState$`, runs `pending/error/mount`, and swaps subscriptions automatically. |

Behavior:
- Loaders are canceled automatically on fast navigation (`switchMap`).
- Previous view subscriptions are always unsubscribed before rendering the next state.

## RouteMatch

```ts
interface RouteMatch<N> {
  name: N                        // the route name you defined
  params: Record<string, string> // extracted :param values
  path: string                   // raw path after the #
}
```

## Param matching

Segments prefixed with `:` are captured as params:

| Pattern | Path | params |
|---------|------|--------|
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/users/:id/posts/:postId` | `/users/7/posts/3` | `{ id: '7', postId: '3' }` |

## Route outlet pattern

```ts
let currentViewSub: Subscription | null = null

router.route$.subscribe(({ name, params }) => {
  currentViewSub?.unsubscribe()
  outlet.innerHTML = ''

  switch (name) {
    case 'home':        currentViewSub = homeView(outlet); break
    case 'users':       currentViewSub = usersView(outlet); break
    case 'user-detail': currentViewSub = userDetailView(outlet, params); break
  }
})
```

Unsubscribing the previous view cancels its in-flight HTTP requests, removes all DOM event listeners, and completes per-item streams.
