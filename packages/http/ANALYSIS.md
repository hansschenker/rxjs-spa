# @rxjs-spa/http — Package Analysis

## Overview

`@rxjs-spa/http` is a reactive HTTP client built on `rxjs/ajax` (browser `XMLHttpRequest`). It provides cold Observables for all HTTP methods, a configurable interceptor pipeline, and the `RemoteData<T>` discriminated union for type-safe async state management.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2 (uses `rxjs/ajax` internally)
- **Build:** Vite library mode (ES + CJS), `rxjs` and `rxjs/ajax` kept external
- **Tests:** jsdom via Vitest — 20+ test cases
- **Source Size:** ~228 lines in a single module (`public.ts`)
- **No external HTTP libraries** — uses `rxjs/ajax` directly

---

## Architecture

```
                         createHttpClient({ baseUrl, interceptors })
                                        │
                                        ▼
  http.get('/users')  ──►  interceptors[0].request(config)
                               │
                               ▼
                           interceptors[1].request(config)
                               │
                               ▼
                           baseUrl prepended (if relative)
                               │
                               ▼
                           ajax({ url, method, headers, ... })   ← rxjs/ajax (cold Observable)
                               │
                               ▼
                           map(res => res.response)
                               │
                               ▼
                           interceptors[1].response(source$)     ← reverse order
                               │
                               ▼
                           interceptors[0].response(source$)
                               │
                               ▼
                           Observable<T>  ← subscriber
```

Every HTTP method returns a **cold Observable** — nothing is sent until subscription, each subscription creates a new XHR, and unsubscribing cancels the in-flight request.

---

## RemoteData Pattern

A discriminated union representing the four states of an async request:

```typescript
type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; statusCode?: number }
```

### Constructors

| Function | Returns |
|----------|---------|
| `idle()` | `{ status: 'idle' }` |
| `loading()` | `{ status: 'loading' }` |
| `success(data)` | `{ status: 'success', data }` |
| `failure(error, statusCode?)` | `{ status: 'error', error, statusCode? }` |

### Type Guards

| Function | Narrows To |
|----------|-----------|
| `isIdle(rd)` | `{ status: 'idle' }` |
| `isLoading(rd)` | `{ status: 'loading' }` |
| `isSuccess(rd)` | `{ status: 'success'; data: T }` |
| `isError(rd)` | `{ status: 'error'; error: string; statusCode?: number }` |

Type guards enable exhaustive pattern matching in views:

```typescript
const users$ = http.get<User[]>('/api/users').pipe(toRemoteData())

users$.subscribe(rd => {
  if (isLoading(rd))  renderSpinner()
  if (isSuccess(rd))  renderList(rd.data)   // rd.data typed as User[]
  if (isError(rd))    renderError(rd.error, rd.statusCode)
})
```

---

## `toRemoteData()` Operator

Transforms any `Observable<T>` into an `Observable<RemoteData<T>>`:

```
subscribe
    │
    ▼
emit { status: 'loading' }         ← startWith()
    │
    ▼
source emits data ──► { status: 'success', data }
       OR
source errors ──► { status: 'error', error, statusCode? }
```

- Immediately emits `loading` on subscribe via `startWith()`
- Maps successful emissions to `success`
- Catches errors, extracts message and HTTP status code (from `AjaxError` if available)
- Completes after error (does not resubscribe)

```typescript
const data$ = http.get<User[]>('/api/users').pipe(toRemoteData())
// Emits: loading → success({ data: [...] })
// Or:    loading → error({ error: '...', statusCode: 404 })
```

---

## HTTP Client

### Default Singleton — `http`

A pre-built client with no base URL and no interceptors. For quick, unconfigured usage:

```typescript
import { http } from '@rxjs-spa/http'

http.get<User[]>('/api/users').subscribe(users => ...)
http.post<User>('/api/users', { name: 'Alice' }).subscribe(user => ...)
```

### Factory — `createHttpClient(config?)`

Creates a configured client with optional base URL and interceptor pipeline:

```typescript
import { createHttpClient } from '@rxjs-spa/http'

const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  interceptors: [authInterceptor, loggingInterceptor],
})

api.get<User[]>('/users')          // → https://api.example.com/users
api.get<Data>('https://other.com') // → https://other.com (absolute, no baseUrl)
```

### Methods

All five methods share the same signature pattern and return cold Observables:

```typescript
interface HttpClient {
  get<T>(url: string, options?: HttpRequestOptions): Observable<T>
  post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  delete<T>(url: string, options?: HttpRequestOptions): Observable<T>
}
```

`HttpRequestOptions` extends `AjaxConfig` (minus `url`, `method`, `body`) — supports custom headers, response type, timeout, etc.

### Default Headers

Every request includes these headers (overridable via options):

```
Content-Type: application/json
Accept: application/json
```

---

## Interceptor Pipeline

```typescript
interface HttpInterceptor {
  request?(config: AjaxConfig): AjaxConfig
  response?<T>(source$: Observable<T>): Observable<T>
}
```

Both hooks are optional. Execution order is asymmetric:

- **Request phase:** left-to-right (first interceptor runs first)
- **Response phase:** right-to-left (last interceptor runs first)

With interceptors `[A, B]`:

```
Request:   A.request(config) → B.request(config) → XHR
Response:  XHR → B.response(source$) → A.response(source$) → subscriber
```

### Example Interceptors

**Auth header:**
```typescript
const authInterceptor: HttpInterceptor = {
  request(config) {
    return {
      ...config,
      headers: { ...config.headers, Authorization: `Bearer ${getToken()}` },
    }
  },
}
```

**Retry on failure:**
```typescript
const retryInterceptor: HttpInterceptor = {
  response(source$) {
    return source$.pipe(retry(2))
  },
}
```

**Logging:**
```typescript
const loggingInterceptor: HttpInterceptor = {
  request(config) {
    console.log(`→ ${config.method} ${config.url}`)
    return config
  },
  response(source$) {
    return source$.pipe(tap(data => console.log('← response', data)))
  },
}
```

---

## Base URL Handling

- Trailing slashes stripped: `'https://api.example.com/'` → `'https://api.example.com'`
- Prepended only to relative URLs (not starting with `http://` or `https://`)
- Leading slash added if missing: both `'/users'` and `'users'` resolve to `baseUrl + '/users'`
- Allows mixing relative (scoped) and absolute (external) URLs in the same client

---

## Cancellation Behavior

Inherited from `rxjs/ajax` — unsubscribing from the Observable cancels the underlying `XMLHttpRequest`:

```typescript
const sub = http.get('/api/slow-endpoint').subscribe(...)
sub.unsubscribe()  // XHR aborted
```

This integrates naturally with RxJS operators:

- **`switchMap`** — new request cancels the previous one
- **`takeUntil`** — cancels on signal
- **Route changes** — unsubscribing the view subscription cancels all in-flight requests

---

## Key Design Decisions

### 1. Cold Observables Throughout

Every HTTP method returns a cold Observable. No request is made until subscription. Each subscription creates a new request. This is the RxJS-idiomatic approach and enables composable cancellation.

### 2. RemoteData as a First-Class Type

Rather than managing loading/error state externally, `RemoteData<T>` encodes the full async lifecycle in a single value. Type guards enable safe narrowing without manual status checks.

### 3. Interceptor Order Mirrors Express/Angular

Request interceptors run in declaration order (outer → inner), response interceptors run in reverse (inner → outer). This matches mental models from middleware-based frameworks.

### 4. Singleton + Factory

The default `http` export provides zero-config convenience. `createHttpClient()` provides full configurability. Both share the same `HttpClient` interface for drop-in swapping.

### 5. AjaxError Status Extraction

`toRemoteData()` specifically detects `AjaxError` instances to extract HTTP status codes, giving consumers both a human-readable error message and a machine-readable status code for conditional handling (e.g., 401 → redirect to login).

---

## Test Coverage

| Area | Tests | Key Scenarios |
|------|-------|---------------|
| RemoteData constructors | 4 | `idle`, `loading`, `success`, `failure` output shape |
| Type guards | 3 | `isLoading`, `isSuccess`, `isError` predicate behavior |
| `toRemoteData()` | 4 | Success path (`loading → success`), error path (`loading → error`), message extraction |
| `createHttpClient` methods | 1 | All 5 methods exist on returned object |
| Base URL | 3 | Relative prepend, absolute bypass, trailing slash stripping |
| Request interceptors | 2 | Single interceptor (auth header), multiple interceptors (left-to-right order) |
| Response interceptors | 2 | Single transformation, multiple interceptors (right-to-left order) |
| Combined interceptors | 1 | Request + response on same client |
| No interceptors | 1 | Plain client without config |

**Mocking strategy:** `vi.mock('rxjs/ajax')` replaces `ajax` with a function that captures the config and returns a mock response, allowing tests to verify URL construction and interceptor execution order without real XHR.

---

## File Map

```
packages/http/
  package.json              Package metadata, peer deps, conditional exports
  vite.config.ts            Vite library build (ES + CJS), rxjs/ajax external
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (228 lines)
    public.test.ts          Complete test suite (278 lines)
```

---

## API Surface Summary

**RemoteData:**
- `RemoteData<T>` (type)
- `idle()`, `loading()`, `success(data)`, `failure(error, statusCode?)`
- `isIdle(rd)`, `isLoading(rd)`, `isSuccess(rd)`, `isError(rd)`
- `toRemoteData<T>()` (operator)

**HTTP Client:**
- `http` — default singleton (no config)
- `createHttpClient(config?)` — factory with `baseUrl` and `interceptors`
- `HttpClient` — interface with `get`, `post`, `put`, `patch`, `delete`
- `HttpInterceptor` — `{ request?(config), response?(source$) }`
- `HttpRequestOptions` — extends `AjaxConfig`
- `HttpClientConfig` — `{ baseUrl?, interceptors? }`

---

## Summary

`@rxjs-spa/http` is a compact (~228 lines), focused HTTP client that wraps `rxjs/ajax` with ergonomic defaults (JSON headers, response extraction), a configurable interceptor pipeline (request left-to-right, response right-to-left), and the `RemoteData<T>` discriminated union for type-safe async state management. Every request is a cold Observable with automatic XHR cancellation on unsubscribe, making it naturally composable with `switchMap`, route changes, and store effects. The package ships both a zero-config singleton (`http`) and a factory (`createHttpClient`) for base URL and interceptor support.
