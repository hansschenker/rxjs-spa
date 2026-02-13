# @rxjs-spa/http

Thin, cancellable HTTP client built on `rxjs/ajax`.

Every method returns a **cold Observable** — no request is sent until you subscribe,
and unsubscribing aborts the in-flight XHR.

## http

```ts
import { http } from '@rxjs-spa/http'
```

| Method | Signature |
|--------|-----------|
| `get` | `http.get<T>(url, options?)` |
| `post` | `http.post<T>(url, body?, options?)` |
| `put` | `http.put<T>(url, body?, options?)` |
| `patch` | `http.patch<T>(url, body?, options?)` |
| `delete` | `http.delete<T>(url, options?)` |

All methods set `Content-Type: application/json` and `Accept: application/json` by default.
Pass `options` (a partial `AjaxConfig`) to add custom headers, `responseType`, etc.

### Examples

```ts
// GET
http.get<User[]>('/api/users').subscribe(users => …)

// Auto-cancel on new search term
searchTerm$.pipe(
  switchMap(q => http.get<User[]>(`/api/users?q=${q}`)),
).subscribe(renderUsers)

// POST
http.post<User>('/api/users', { name: 'Alice' }).subscribe(created => …)
```

## RemoteData

A discriminated union modelling the four states of an async request:

```ts
type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; statusCode?: number }
```

### Constructors

```ts
import { idle, loading, success, failure } from '@rxjs-spa/http'

idle()           // { status: 'idle' }
loading()        // { status: 'loading' }
success([1,2,3]) // { status: 'success', data: [1,2,3] }
failure('oops')  // { status: 'error', error: 'oops' }
```

### Type guards

```ts
import { isIdle, isLoading, isSuccess, isError } from '@rxjs-spa/http'

if (isSuccess(rd)) console.log(rd.data)
if (isError(rd))   console.error(rd.error, rd.statusCode)
```

## toRemoteData

Wraps any Observable into a `RemoteData<T>` stream:

```ts
import { toRemoteData } from '@rxjs-spa/http'

const users$: Observable<RemoteData<User[]>> = http
  .get<User[]>('/api/users')
  .pipe(toRemoteData())

// Emits: { status: 'loading' } → { status: 'success', data: […] }
//    or: { status: 'loading' } → { status: 'error', error: '…' }
```

Combine with `store.dispatch` for MVU:

```ts
http.get<User[]>('/api/users').pipe(toRemoteData()).subscribe(rd => {
  if (isSuccess(rd)) store.dispatch({ type: 'LOAD_SUCCESS', users: rd.data })
  if (isError(rd))   store.dispatch({ type: 'LOAD_ERROR', error: rd.error })
})
```
