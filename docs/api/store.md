# @rxjs-spa/store

MVU-style state management backed by RxJS `scan` + `shareReplay`.

## createStore

```ts
import { createStore } from '@rxjs-spa/store'

const store = createStore(reducer, initialState)
```

Returns a `Store<S, A>` with:

| Member | Type | Description |
|--------|------|-------------|
| `state$` | `Observable<S>` | Multicasted state. Replays latest to late subscribers. |
| `actions$` | `Observable<A>` | Every dispatched action — use for effects. |
| `dispatch(action)` | `void` | Push an action through the reducer. |
| `select(fn)` | `Observable<T>` | Derived slice; emits only on change (strict equality). |
| `getState()` | `S` | Synchronous snapshot of the current state. |

### Example

```ts
type State  = { count: number }
type Action = { type: 'INC' } | { type: 'DEC' } | { type: 'RESET' }

const store = createStore<State, Action>(
  (s, a) => {
    switch (a.type) {
      case 'INC':   return { count: s.count + 1 }
      case 'DEC':   return { count: s.count - 1 }
      case 'RESET': return { count: 0 }
    }
  },
  { count: 0 },
)

store.select(s => s.count).subscribe(n => console.log(n))
store.dispatch({ type: 'INC' }) // logs: 1
```

## ofType

```ts
import { ofType } from '@rxjs-spa/store'

store.actions$.pipe(ofType('INC', 'DEC')).subscribe(…)
```

Filters the action stream to only the listed `type` values and **narrows the TypeScript type**.

## Effects pattern

Side-effects live outside the reducer. Wire them using `actions$`:

```ts
import { switchMap, map, catchError, of } from 'rxjs'
import { ofType } from '@rxjs-spa/store'
import { http } from '@rxjs-spa/http'

store.actions$.pipe(
  ofType('LOAD_USERS'),
  switchMap(() =>
    http.get<User[]>('/api/users').pipe(
      map(users => ({ type: 'LOAD_SUCCESS' as const, users })),
      catchError(err => of({ type: 'LOAD_ERROR' as const, error: err.message })),
    ),
  ),
).subscribe(action => store.dispatch(action))
```

Use `switchMap` to cancel in-flight requests when a new action arrives.

## combineStores

```ts
import { combineStores } from '@rxjs-spa/store'

const vm$ = combineStores(authStore, uiStore, (auth, ui) => ({
  username: auth.user?.name,
  theme: ui.theme,
}))
```
