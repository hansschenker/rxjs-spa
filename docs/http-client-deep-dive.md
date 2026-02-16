# @rxjs-spa/http — HTTP Client Deep Dive

A complete, step-by-step explanation of how the HTTP client works in `rxjs-spa` — from creating a request to handling the response. Covers the default client, client factories, interceptor chains, the `RemoteData<T>` pattern, cancellation, error handling, and integration with stores and testing.

---

## Table of Contents

1. [`RemoteData<T>` — The Request Lifecycle Type](#step-1-remotedata--the-request-lifecycle-type)
2. [`toRemoteData()` — Wrapping Observables into RemoteData Streams](#step-2-toremotedata--wrapping-observables-into-remotedata-streams)
3. [The Internal `request()` Function](#step-3-the-internal-request-function)
4. [`HttpClient` Interface — The Core Contract](#step-4-httpclient-interface--the-core-contract)
5. [The Default `http` Singleton](#step-5-the-default-http-singleton)
6. [`createHttpClient()` — The Factory Function](#step-6-createhttpclient--the-factory-function)
7. [`HttpInterceptor` — Request and Response Phases](#step-7-httpinterceptor--request-and-response-phases)
8. [Interceptor Chain Execution Order](#step-8-interceptor-chain-execution-order)
9. [Headers Handling & Body Serialization](#step-9-headers-handling--body-serialization)
10. [Cold Observables & XHR Cancellation](#step-10-cold-observables--xhr-cancellation)
11. [Error Handling — AjaxError, Network Failures, Status Codes](#step-11-error-handling--ajaxerror-network-failures-status-codes)
12. [Complete Request Execution Flow](#step-12-complete-request-execution-flow)
13. [Integration with Stores — The Effects Pattern](#step-13-integration-with-stores--the-effects-pattern)
14. [Integration with Testing — `createMockHttpClient()`](#step-14-integration-with-testing--createmockhttpclient)
15. [Real-World Patterns — Demo App](#step-15-real-world-patterns--demo-app)
16. [Architecture Summary](#step-16-architecture-summary)

---

## Step 1: `RemoteData<T>` — The Request Lifecycle Type

### The Problem

Every async HTTP request has four possible states: not started, in-flight, succeeded, or failed. Without a structured type, you end up with fragile combinations of booleans and nulls:

```typescript
// Fragile: What does loading=true + error='timeout' mean?
interface BadState {
  data: User[] | null
  loading: boolean
  error: string | null
}
```

### The Solution: Discriminated Union

`RemoteData<T>` models the entire request lifecycle as a **discriminated union** — exactly one state is active at any time:

```typescript
export type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; statusCode?: number }
```

| State | Meaning | Extra Fields |
| --- | --- | --- |
| `idle` | No request initiated yet | None |
| `loading` | Request is in-flight | None |
| `success` | Request completed with data | `data: T` |
| `error` | Request failed | `error: string`, `statusCode?: number` |

### Constructor Helpers

Factory functions for convenient construction:

```typescript
export const idle = (): RemoteData<never> => ({ status: 'idle' })
export const loading = (): RemoteData<never> => ({ status: 'loading' })
export const success = <T>(data: T): RemoteData<T> => ({ status: 'success', data })
export const failure = (error: string, statusCode?: number): RemoteData<never> => ({
  status: 'error',
  error,
  statusCode,
})
```

`idle` and `loading` return `RemoteData<never>` because they carry no data — they're compatible with any `RemoteData<T>`.

### Type Guard Functions

```typescript
export function isIdle<T>(rd: RemoteData<T>): rd is { status: 'idle' } {
  return rd.status === 'idle'
}
export function isLoading<T>(rd: RemoteData<T>): rd is { status: 'loading' } {
  return rd.status === 'loading'
}
export function isSuccess<T>(rd: RemoteData<T>): rd is { status: 'success'; data: T } {
  return rd.status === 'success'
}
export function isError<T>(
  rd: RemoteData<T>,
): rd is { status: 'error'; error: string; statusCode?: number } {
  return rd.status === 'error'
}
```

These use TypeScript's `is` keyword for **compile-time type narrowing**:

```typescript
const rd: RemoteData<User[]> = loading()

if (isSuccess(rd)) {
  // TypeScript KNOWS rd.data is User[] — no type cast needed
  console.log(rd.data.length)
}

if (isError(rd)) {
  // TypeScript KNOWS rd.error is string, rd.statusCode is number | undefined
  console.log(`${rd.statusCode ?? 'Network'}: ${rd.error}`)
}
```

### UI Rendering Pattern

```typescript
function renderRemoteData<T>(
  rd: RemoteData<T>,
  onSuccess: (data: T) => string,
): string {
  if (isIdle(rd)) return '<p>Click to load</p>'
  if (isLoading(rd)) return '<div class="spinner"></div>'
  if (isError(rd)) return `<p class="error">${rd.error}</p>`
  if (isSuccess(rd)) return onSuccess(rd.data)
  return ''
}
```

---

## Step 2: `toRemoteData()` — Wrapping Observables into RemoteData Streams

### Implementation

```typescript
export function toRemoteData<T>() {
  return (source$: Observable<T>): Observable<RemoteData<T>> =>
    source$.pipe(
      map((data): RemoteData<T> => ({ status: 'success', data })),
      startWith<RemoteData<T>>({ status: 'loading' }),
      catchError((err: unknown) => {
        const statusCode = err instanceof AjaxError ? err.status : undefined
        const message =
          err instanceof AjaxError
            ? (err.message ?? `HTTP ${err.status}`)
            : String((err as Error).message ?? err)
        return of<RemoteData<T>>({ status: 'error', error: message, statusCode })
      }),
    )
}
```

### Execution Flow — Step by Step

```
subscribe()
    │
    ├─→ startWith({ status: 'loading' })    ← Emits IMMEDIATELY
    │
    ├─→ ...XHR in flight...
    │
    ├─→ SUCCESS PATH:
    │     source$ emits data
    │       ↓
    │     map(data => { status: 'success', data })
    │       ↓
    │     subscriber receives: { status: 'success', data: User[] }
    │
    └─→ ERROR PATH:
          source$ errors
            ↓
          catchError extracts error info
            ↓
          subscriber receives: { status: 'error', error: '...', statusCode: 404 }
```

### Error Extraction Logic

The operator intelligently handles two error types:

**`AjaxError`** (from `rxjs/ajax` — HTTP error responses):

- Extracts `statusCode` from `err.status` (e.g., 404, 500)
- Uses `err.message` if available, otherwise constructs `HTTP ${status}`

**Generic `Error`** (network failure, timeout, parsing error):

- No `statusCode` available (`undefined`)
- Extracts `message` from `(err as Error).message` or stringifies the error

### Usage

```typescript
const users$: Observable<RemoteData<User[]>> = http
  .get<User[]>('/api/users')
  .pipe(toRemoteData())

users$.subscribe((rd) => {
  // Emission 1: { status: 'loading' }                           ← immediate
  // Emission 2: { status: 'success', data: [...] }              ← on response
  //         OR: { status: 'error', error: '...', statusCode: 500 } ← on failure
})
```

---

## Step 3: The Internal `request()` Function

This private helper is the backbone of all HTTP methods:

```typescript
function request<T>(config: AjaxConfig): Observable<T> {
  return ajax<T>({
    ...config,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.headers,
    },
  }).pipe(map((res) => res.response as T))
}
```

### What Happens Step by Step

1. **Spread the config** — `...config` passes `url`, `method`, `body`, etc.
2. **Merge default headers** — Sets `Content-Type: application/json` and `Accept: application/json`
3. **Caller headers override** — `...config.headers` allows supplied headers to take precedence
4. **Call `rxjs/ajax`** — `ajax<T>(finalConfig)` creates and returns a cold Observable wrapping an `XMLHttpRequest`
5. **Extract the response body** — `map(res => res.response as T)` unwraps the `AjaxResponse` to just the payload

### `AjaxResponse` Structure

The `ajax()` operator from `rxjs/ajax` returns:

```typescript
{
  originalEvent: ProgressEvent
  xhr: XMLHttpRequest
  request: AjaxRequest
  status: number            // HTTP status (200, 404, 500, etc.)
  response: T               // The parsed response body
  responseText: string
  responseType: XMLHttpRequestResponseType
}
```

The `map` extracts just the `response` field — the actual data you care about.

---

## Step 4: `HttpClient` Interface — The Core Contract

```typescript
export interface HttpClient {
  get<T>(url: string, options?: HttpRequestOptions): Observable<T>
  post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  delete<T>(url: string, options?: HttpRequestOptions): Observable<T>
}
```

This is the **core contract** satisfied by both:

- The default `http` singleton (pre-instantiated, no config)
- Instances returned by `createHttpClient(config)` (with baseUrl and interceptors)
- Mock clients from `createMockHttpClient()` (for testing)

### Method Properties

Every method:

| Property | Detail |
| --- | --- |
| **Generic `<T>`** | Response type is caller-specified |
| **Returns cold Observable** | XHR not executed until subscribed |
| **Cancellable** | Unsubscribing aborts the in-flight XHR |
| **Repeatable** | Subscribing multiple times sends multiple requests |

### `HttpRequestOptions`

```typescript
export interface HttpRequestOptions
  extends Omit<AjaxConfig, 'url' | 'method' | 'body'> {}
```

Extends `AjaxConfig` from `rxjs/ajax`, **omitting fields set by the method itself**:

- ✅ Can pass: `headers`, `timeout`, `withCredentials`, `async`, `responseType`
- ❌ Cannot pass: `url` (set by method arg), `method` (set by method name), `body` (set by POST/PUT/PATCH arg)

```typescript
http.get('/api/users', {
  headers: { 'X-Custom': 'value' },
  timeout: 5000,
  withCredentials: true,
})
```

---

## Step 5: The Default `http` Singleton

```typescript
export const http: HttpClient = {
  get<T>(url: string, options?: HttpRequestOptions): Observable<T> {
    return request<T>({ ...options, url, method: 'GET' })
  },
  post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T> {
    return request<T>({ ...options, url, method: 'POST', body })
  },
  put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T> {
    return request<T>({ ...options, url, method: 'PUT', body })
  },
  patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T> {
    return request<T>({ ...options, url, method: 'PATCH', body })
  },
  delete<T>(url: string, options?: HttpRequestOptions): Observable<T> {
    return request<T>({ ...options, url, method: 'DELETE' })
  },
}
```

This is a **pre-instantiated client** with:

- **No interceptors** — Requests go straight to `ajax()`
- **No baseUrl** — URLs are used as-is
- **Direct calls to `request()`** — Minimal overhead

Use for one-off requests or when you don't need customization:

```typescript
import { http } from '@rxjs-spa/http'

http.get<User[]>('/api/users').subscribe((users) => {
  console.log(users)
})
```

---

## Step 6: `createHttpClient()` — The Factory Function

### Signature

```typescript
export function createHttpClient(config?: HttpClientConfig): HttpClient
```

### `HttpClientConfig`

```typescript
export interface HttpClientConfig {
  baseUrl?: string // Prepended to all relative paths
  interceptors?: HttpInterceptor[] // Applied in order
}
```

### Implementation — Step by Step

```typescript
export function createHttpClient(config?: HttpClientConfig): HttpClient {
  const baseUrl = config?.baseUrl?.replace(/\/+$/, '') ?? ''
  const interceptors = config?.interceptors ?? []

  function interceptedRequest<T>(ajaxConfig: AjaxConfig): Observable<T> {
    // ── STEP 1: Run request interceptors (left-to-right) ──
    let cfg = ajaxConfig
    for (const i of interceptors) {
      if (i.request) cfg = i.request(cfg)
    }

    // ── STEP 2: Prepend baseUrl to relative paths ──
    if (baseUrl && cfg.url && !cfg.url.startsWith('http://') && !cfg.url.startsWith('https://')) {
      cfg = { ...cfg, url: baseUrl + (cfg.url.startsWith('/') ? cfg.url : '/' + cfg.url) }
    }

    // ── STEP 3: Execute the actual HTTP request ──
    let result$ = request<T>(cfg)

    // ── STEP 4: Run response interceptors (right-to-left) ──
    for (let idx = interceptors.length - 1; idx >= 0; idx--) {
      const i = interceptors[idx]
      if (i.response) result$ = i.response<T>(result$)
    }

    return result$
  }

  return {
    get: <T>(url: string, opts?: HttpRequestOptions) =>
      interceptedRequest<T>({ ...opts, url, method: 'GET' }),
    post: <T>(url: string, body?: unknown, opts?: HttpRequestOptions) =>
      interceptedRequest<T>({ ...opts, url, method: 'POST', body }),
    put: <T>(url: string, body?: unknown, opts?: HttpRequestOptions) =>
      interceptedRequest<T>({ ...opts, url, method: 'PUT', body }),
    patch: <T>(url: string, body?: unknown, opts?: HttpRequestOptions) =>
      interceptedRequest<T>({ ...opts, url, method: 'PATCH', body }),
    delete: <T>(url: string, opts?: HttpRequestOptions) =>
      interceptedRequest<T>({ ...opts, url, method: 'DELETE' }),
  }
}
```

### BaseUrl Processing

```typescript
const baseUrl = config?.baseUrl?.replace(/\/+$/, '') ?? ''
```

Strips **trailing slashes** to prevent double-slash URLs:

| Input | After Processing |
| --- | --- |
| `'https://api.example.com/'` | `'https://api.example.com'` |
| `'https://api.example.com///'` | `'https://api.example.com'` |
| `undefined` | `''` |

### BaseUrl Prepending Logic

```typescript
if (baseUrl && cfg.url && !cfg.url.startsWith('http://') && !cfg.url.startsWith('https://')) {
  cfg = { ...cfg, url: baseUrl + (cfg.url.startsWith('/') ? cfg.url : '/' + cfg.url) }
}
```

Three conditions must all be true:

1. A `baseUrl` is configured
2. The config has a `url`
3. The url is **not absolute** (doesn't start with `http://` or `https://`)

| baseUrl | url | Result |
| --- | --- | --- |
| `https://api.com` | `/users` | `https://api.com/users` |
| `https://api.com` | `users` | `https://api.com/users` |
| `https://api.com` | `https://other.com/data` | `https://other.com/data` (bypasses baseUrl) |

**Absolute URLs bypass baseUrl** — useful for cross-origin requests from a client configured with a default API base.

---

## Step 7: `HttpInterceptor` — Request and Response Phases

### Interface

```typescript
export interface HttpInterceptor {
  request?(config: AjaxConfig): AjaxConfig
  response?<T>(source$: Observable<T>): Observable<T>
}
```

Both methods are **optional** — an interceptor can implement only the request phase, only the response phase, or both.

### Request Phase

```typescript
request?(config: AjaxConfig): AjaxConfig
```

- Called **before** the XHR is sent
- Receives the full `AjaxConfig` (url, method, body, headers, etc.)
- Returns a **modified config**
- Must be **synchronous**

**Example — Auth Token Injection:**

```typescript
const authInterceptor: HttpInterceptor = {
  request: (config) => ({
    ...config,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${getToken()}`,
    },
  }),
}
```

**Example — Request Logging:**

```typescript
const loggingInterceptor: HttpInterceptor = {
  request: (config) => {
    console.log(`[HTTP] ${config.method} ${config.url}`)
    return config // Pass through unchanged
  },
}
```

### Response Phase

```typescript
response?<T>(source$: Observable<T>): Observable<T>
```

- Called **after** the Observable is created, **before** subscription
- Receives the source Observable
- Returns a **transformed Observable**
- Can add operators like `retry`, `timeout`, `tap`, etc.

**Example — Automatic Retry:**

```typescript
const retryInterceptor: HttpInterceptor = {
  response: (source$) => source$.pipe(retry(2)),
}
```

**Example — Response Logging:**

```typescript
const responseLogInterceptor: HttpInterceptor = {
  response: (source$) =>
    source$.pipe(
      tap((data) => console.log('Response:', data)),
      catchError((err) => {
        console.error('HTTP Error:', err)
        return throwError(() => err) // Re-throw to keep error propagation
      }),
    ),
}
```

**Example — Response Timing:**

```typescript
const timingInterceptor: HttpInterceptor = {
  request: (config) => {
    ;(config as any).__startTime = Date.now()
    return config
  },
  response: (source$) =>
    source$.pipe(
      tap(() => {
        const elapsed = Date.now() - (source$ as any).__startTime
        console.log(`Request took ${elapsed}ms`)
      }),
    ),
}
```

---

## Step 8: Interceptor Chain Execution Order

With `interceptors: [interceptor0, interceptor1, interceptor2]`:

### Request Phase — Left-to-Right

```
Original config
    ↓
interceptor0.request(config)  → modified config
    ↓
interceptor1.request(config)  → modified config
    ↓
interceptor2.request(config)  → final config
    ↓
ajax(finalConfig)              → XHR sent
```

Each interceptor receives the config returned by the previous one. Earlier interceptors' changes are visible to later ones.

### Response Phase — Right-to-Left

```
ajax() result Observable
    ↓
interceptor2.response(obs$)   → wrapped Observable
    ↓
interceptor1.response(obs$)   → wrapped Observable
    ↓
interceptor0.response(obs$)   → final Observable
    ↓
subscriber receives data
```

This follows the **onion pattern** (like Express middleware):

- Request flows inward (left → right)
- Response flows outward (right → left)
- Earlier interceptors wrap later ones

### Implementation Detail

```typescript
// Request phase: forward loop
let cfg = ajaxConfig
for (const i of interceptors) {
  if (i.request) cfg = i.request(cfg)
}

// Response phase: reverse loop
for (let idx = interceptors.length - 1; idx >= 0; idx--) {
  const i = interceptors[idx]
  if (i.response) result$ = i.response<T>(result$)
}
```

### Practical Example — Two Interceptors

```typescript
const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  interceptors: [
    {
      // Interceptor 0: Auth
      request: (config) => ({
        ...config,
        headers: { ...config.headers, Authorization: 'Bearer token' },
      }),
    },
    {
      // Interceptor 1: Retry
      response: (source$) => source$.pipe(retry(2)),
    },
  ],
})

client.get<User[]>('/users').subscribe(console.log)
```

**Execution order:**

```
1. Interceptor 0 request: adds Authorization header
2. Interceptor 1 request: (not defined — skipped)
3. BaseUrl prepended: https://api.example.com/users
4. Default headers merged: Content-Type + Accept + Authorization
5. ajax() sends XHR

6. ajax() returns Observable
7. Interceptor 1 response: wraps with retry(2)
8. Interceptor 0 response: (not defined — skipped)
9. Subscriber receives data (or up to 2 retries on failure)
```

---

## Step 9: Headers Handling & Body Serialization

### Default Headers

```typescript
headers: {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...config.headers,
}
```

Object spreading means:

1. Default headers are set first
2. Caller-supplied headers **override** defaults
3. Interceptor-added headers **override** both

### Header Override Example

```typescript
http.post('/api/data', formData, {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Custom': 'header',
  },
})

// Final headers sent:
// {
//   'Content-Type': 'application/x-www-form-urlencoded',  ← overridden
//   'Accept': 'application/json',                          ← default kept
//   'X-Custom': 'header',                                  ← custom added
// }
```

### Body Serialization

The `body` parameter is passed directly to `ajax()`:

| Body Type | Behavior |
| --- | --- |
| **Object** | `XMLHttpRequest` auto-serializes to JSON (because `Content-Type` is `application/json`) |
| **String** | Sent as-is |
| **`FormData`** | Sent as multipart/form-data (override `Content-Type` to `undefined` to let browser set it) |
| **`null` / `undefined`** | No body sent |

```typescript
// JSON body (automatic serialization)
http.post('/api/users', { name: 'Alice', email: 'alice@example.com' })

// String body
http.post('/api/raw', 'plain text content', {
  headers: { 'Content-Type': 'text/plain' },
})

// FormData body (file upload)
const formData = new FormData()
formData.append('file', fileBlob)
http.post('/api/upload', formData, {
  headers: { 'Content-Type': undefined }, // Let browser set boundary
})
```

---

## Step 10: Cold Observables & XHR Cancellation

### Cold Observables

The HTTP client returns **cold Observables** — nothing happens until you subscribe:

```typescript
const users$ = http.get<User[]>('/api/users')
// XHR NOT sent yet — just an Observable blueprint

const sub1 = users$.subscribe(console.log)
// XHR #1 sent NOW

const sub2 = users$.subscribe(console.log)
// XHR #2 sent — a SEPARATE request!
```

Each subscription triggers a **new XHR request**. To share a single request among multiple subscribers:

```typescript
const users$ = http.get<User[]>('/api/users').pipe(shareReplay(1))

const sub1 = users$.subscribe(console.log) // XHR sent
const sub2 = users$.subscribe(console.log) // No new XHR — replayed from buffer
```

### Cancellation via Unsubscribe

When you unsubscribe from an HTTP Observable, the underlying `XMLHttpRequest` is **aborted**:

```typescript
const sub = http.get<User[]>('/api/users').subscribe(console.log)

// Later, before response arrives:
sub.unsubscribe()
// xhr.abort() called internally by rxjs/ajax
// Network request cancelled, no data emitted, no error thrown
```

This is handled by `rxjs/ajax` internally — its teardown logic calls `xhr.abort()`.

### Cancellation in Practice with `switchMap`

```typescript
store.actions$
  .pipe(
    ofType('SEARCH'),
    switchMap(({ query }) => http.get<Results>(`/api/search?q=${query}`)),
  )
  .subscribe(console.log)
```

When the user types quickly:

```
Dispatch SEARCH 'a'   → XHR #1 starts
Dispatch SEARCH 'ab'  → XHR #1 ABORTED, XHR #2 starts
Dispatch SEARCH 'abc' → XHR #2 ABORTED, XHR #3 starts
                       → XHR #3 completes, results emitted
```

`switchMap` unsubscribes from the previous inner Observable (which aborts the XHR) before subscribing to the new one. No race conditions, no stale results.

---

## Step 11: Error Handling — AjaxError, Network Failures, Status Codes

### AjaxError Structure

When an XHR fails, `rxjs/ajax` throws an `AjaxError`:

```typescript
{
  message: string | undefined
  name: 'AjaxError'
  status: number              // HTTP status (0, 400, 404, 500, etc.)
  response: any               // Response body (if any)
  xhr: XMLHttpRequest
}
```

### Error Scenarios

| Scenario | `status` | `message` |
| --- | --- | --- |
| HTTP 404 Not Found | `404` | `'ajax error 404'` or server message |
| HTTP 500 Internal Server Error | `500` | `'ajax error 500'` or server message |
| Network failure (offline, DNS) | `0` | `undefined` or `'Network request failed'` |
| CORS error | `0` | `undefined` |
| Request timeout | `0` | `'ajax error'` |

### How `toRemoteData()` Handles Errors

```typescript
catchError((err: unknown) => {
  const statusCode = err instanceof AjaxError ? err.status : undefined
  const message =
    err instanceof AjaxError
      ? (err.message ?? `HTTP ${err.status}`)
      : String((err as Error).message ?? err)
  return of<RemoteData<T>>({ status: 'error', error: message, statusCode })
})
```

| Error Type | `statusCode` | `error` |
| --- | --- | --- |
| `AjaxError` (HTTP error) | `err.status` (e.g., 404) | `err.message` or `'HTTP 404'` |
| Generic `Error` (network) | `undefined` | `err.message` |
| Non-Error thrown value | `undefined` | `String(err)` |

### Manual Error Handling (without `toRemoteData`)

```typescript
http.get<User[]>('/api/users').pipe(
  catchError((err) => {
    if (err instanceof AjaxError) {
      if (err.status === 401) {
        router.navigate('/login')
        return EMPTY
      }
      if (err.status === 404) {
        return of([]) // Return empty array as fallback
      }
    }
    return throwError(() => err) // Re-throw unhandled errors
  }),
)
```

---

## Step 12: Complete Request Execution Flow

Here's the entire lifecycle of a request, from method call to subscriber:

```typescript
const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  interceptors: [
    {
      request: (cfg) => ({
        ...cfg,
        headers: { ...cfg.headers, Authorization: 'Bearer token123' },
      }),
    },
    {
      response: (source$) => source$.pipe(retry(1)),
    },
  ],
})

api.get<User>('/users/42').subscribe({
  next: (user) => console.log(user),
  error: (err) => console.error(err),
})
```

### Step-by-Step Trace

```
1. api.get<User>('/users/42')
   └─→ interceptedRequest<User>({ url: '/users/42', method: 'GET' })

2. REQUEST INTERCEPTOR LOOP (left-to-right):
   └─→ Interceptor 0 (auth):
         Input:  { url: '/users/42', method: 'GET' }
         Output: { url: '/users/42', method: 'GET',
                   headers: { Authorization: 'Bearer token123' } }

3. BASEURL PREPENDING:
   └─→ '/users/42' is relative (no http://)
   └─→ Final URL: 'https://api.example.com/users/42'

4. request<User>(finalConfig):
   └─→ Default headers merged:
         { 'Content-Type': 'application/json',
           'Accept': 'application/json',
           'Authorization': 'Bearer token123' }
   └─→ ajax<User>(config) called → returns cold Observable

5. RESPONSE INTERCEPTOR LOOP (right-to-left):
   └─→ Interceptor 1 (retry):
         Wraps Observable with retry(1)
   └─→ Interceptor 0 (auth):
         No response method — skipped

6. subscribe() triggers:
   └─→ XMLHttpRequest created
   └─→ XHR configured: GET https://api.example.com/users/42
   └─→ XHR sent

7. RESPONSE ARRIVES:
   └─→ SUCCESS (200):
         AjaxResponse.response extracted via map()
         User object emitted to subscriber
   └─→ ERROR (first attempt):
         retry(1) catches → resubscribes → XHR sent again
         └─→ SUCCESS (retry): User emitted
         └─→ ERROR (retry): AjaxError propagated to subscriber
```

---

## Step 13: Integration with Stores — The Effects Pattern

### The Pattern

HTTP calls live in **effects** — side-effect handlers wired to `store.actions$`. The reducer stays pure.

```
User interaction
    ↓
dispatch({ type: 'FETCH' })
    ↓
Reducer: sets loading = true
    ↓
actions$ emits FETCH
    ↓
Effect catches FETCH via ofType()
    ↓
Effect calls http.get()
    ↓
HTTP response arrives
    ↓
Effect dispatches FETCH_SUCCESS or FETCH_ERROR
    ↓
Reducer: updates state with data or error
    ↓
UI re-renders via state$ subscriptions
```

### Basic Effect

```typescript
const effectSub = store.actions$
  .pipe(
    ofType('FETCH_USERS'),
    switchMap(() =>
      http.get<User[]>('/api/users').pipe(
        map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchError((err) =>
          of({
            type: 'FETCH_ERROR' as const,
            error: err instanceof AjaxError ? err.message : 'Network error',
          }),
        ),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

### Effect with `catchAndReport` (from `@rxjs-spa/errors`)

```typescript
const effectSub = store.actions$
  .pipe(
    ofType('FETCH_USERS'),
    switchMap(() =>
      http.get<User[]>('/api/users').pipe(
        map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load users' },
          context: 'usersView/FETCH_USERS',
        }),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

**Benefits of `catchAndReport`:**

1. Error is reported to the centralized error handler (logging, toasts, Sentry)
2. Fallback action is dispatched (reducer handles it)
3. The outer `switchMap` stream stays alive — future FETCH actions still work

### Parallel Requests with `combineLatest`

```typescript
const effectSub = store.actions$
  .pipe(
    ofType('FETCH_USER_DETAIL'),
    switchMap(({ userId }) =>
      combineLatest([
        api.users.get(userId), // GET /users/:id
        api.posts.byUser(userId), // GET /posts?userId=:id
      ]).pipe(
        map(([user, posts]) => ({
          type: 'FETCH_DETAIL_SUCCESS' as const,
          user,
          posts,
        })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_DETAIL_ERROR' as const, error: 'Failed to load' },
          context: 'userDetailView/FETCH',
        }),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

Both requests run in parallel. `combineLatest` waits for **both** to complete before emitting. If **either** fails, the `catchAndReport` catches it.

### Effect with `exhaustMap` (Prevent Double Submit)

```typescript
const submitEffect = store.actions$
  .pipe(
    ofType('SUBMIT_FORM'),
    exhaustMap(({ data }) =>
      http.post<Response>('/api/submit', data).pipe(
        map((res) => ({ type: 'SUBMIT_SUCCESS' as const, res })),
        catchAndReport(errorHandler, {
          fallback: { type: 'SUBMIT_ERROR' as const, error: 'Submit failed' },
        }),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

`exhaustMap` **ignores** new SUBMIT_FORM actions while a previous one is in-flight. This prevents double-submit without disabling the button.

---

## Step 14: Integration with Testing — `createMockHttpClient()`

### The Mock Client

```typescript
export interface MockHttpClient extends HttpClient {
  calls: MockCall[] // Records all requests for assertions
  whenGet(url: string): MockResponse
  whenPost(url: string): MockResponse
  whenPut(url: string): MockResponse
  whenPatch(url: string): MockResponse
  whenDelete(url: string): MockResponse
}

export interface MockResponse {
  respond<T>(data: T): void // Configure synchronous response
  respondWith<T>(obs$: Observable<T>): void // Configure custom Observable
}

export interface MockCall {
  method: string
  url: string
  body?: unknown
}
```

### Implementation

```typescript
export function createMockHttpClient(): MockHttpClient {
  const responses = new Map<string, Observable<unknown>>()
  const calls: MockCall[] = []

  function makeKey(method: string, url: string): string {
    return `${method}:${url}`
  }

  function doRequest<T>(method: string, url: string, body?: unknown): Observable<T> {
    // Record every call
    calls.push({ method, url, ...(body !== undefined ? { body } : {}) })

    // Look up configured response
    const response = responses.get(makeKey(method, url))
    if (!response) {
      return throwError(() => new Error(`No mock configured for ${method} ${url}`))
    }
    return response as Observable<T>
  }

  function configureMock(method: string, url: string): MockResponse {
    return {
      respond<T>(data: T) {
        responses.set(makeKey(method, url), of(data))
      },
      respondWith<T>(obs$: Observable<T>) {
        responses.set(makeKey(method, url), obs$)
      },
    }
  }

  return {
    calls,
    get: <T>(url: string) => doRequest<T>('GET', url),
    post: <T>(url: string, body?: unknown) => doRequest<T>('POST', url, body),
    put: <T>(url: string, body?: unknown) => doRequest<T>('PUT', url, body),
    patch: <T>(url: string, body?: unknown) => doRequest<T>('PATCH', url, body),
    delete: <T>(url: string) => doRequest<T>('DELETE', url),
    whenGet: (url) => configureMock('GET', url),
    whenPost: (url) => configureMock('POST', url),
    whenPut: (url) => configureMock('PUT', url),
    whenPatch: (url) => configureMock('PATCH', url),
    whenDelete: (url) => configureMock('DELETE', url),
  }
}
```

### Key Features

| Feature | Detail |
| --- | --- |
| **Response map** | Stores mock Observables by `METHOD:URL` key |
| **Call recording** | Every request is pushed to `calls[]` for assertions |
| **`respond(data)`** | Wraps data in `of(data)` — synchronous emission |
| **`respondWith(obs$)`** | Custom Observable — simulate delays, errors, sequences |
| **Unconfigured URL** | Throws `Error('No mock configured for ...')` |

### Testing an Effect End-to-End

```typescript
it('FETCH effect dispatches FETCH_SUCCESS with users', () => {
  const http = createMockHttpClient()
  const store = createMockStore<UsersState, UsersAction>({ users: [], loading: false })

  // Configure mock response
  http.whenGet('/api/users').respond([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ])

  // Wire effect (same code as production)
  const effectSub = store.actions$
    .pipe(
      ofType('FETCH'),
      switchMap(() =>
        http.get<User[]>('/api/users').pipe(
          map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        ),
      ),
    )
    .subscribe((action) => store.dispatch(action))

  // Trigger the effect
  store.dispatch({ type: 'FETCH' })

  // Assert HTTP was called
  expect(http.calls).toEqual([{ method: 'GET', url: '/api/users' }])

  // Assert correct actions were dispatched
  expect(store.dispatchedActions).toEqual([
    { type: 'FETCH' },
    { type: 'FETCH_SUCCESS', users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] },
  ])

  effectSub.unsubscribe()
})
```

### Simulating Errors

```typescript
it('handles HTTP errors gracefully', () => {
  const http = createMockHttpClient()
  const store = createMockStore<UsersState, UsersAction>({ users: [], loading: false })

  // Configure error response
  http.whenGet('/api/users').respondWith(throwError(() => new Error('Server down')))

  const effectSub = store.actions$
    .pipe(
      ofType('FETCH'),
      switchMap(() =>
        http.get<User[]>('/api/users').pipe(
          map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
          catchError(() => of({ type: 'FETCH_ERROR' as const, error: 'Failed' })),
        ),
      ),
    )
    .subscribe((action) => store.dispatch(action))

  store.dispatch({ type: 'FETCH' })

  expect(store.dispatchedActions).toEqual([
    { type: 'FETCH' },
    { type: 'FETCH_ERROR', error: 'Failed' },
  ])

  effectSub.unsubscribe()
})
```

### Simulating Delays

```typescript
http.whenGet('/api/slow').respondWith(of(data).pipe(delay(1000)))
```

---

## Step 15: Real-World Patterns — Demo App

### API Module — Multiple Clients for Different Origins

```typescript
// api/api.ts
const loggingInterceptor: HttpInterceptor = {
  request: (config) => {
    console.log(`[http] ${config.method} ${config.url}`)
    return config
  },
}

// Client for JSONPlaceholder API
const http = createHttpClient({
  baseUrl: 'https://jsonplaceholder.typicode.com',
  interceptors: [loggingInterceptor],
})

// Client for auth API (different origin)
const authHttp = createHttpClient({
  baseUrl: 'https://dummyjson.com',
  interceptors: [loggingInterceptor],
})

export const api = {
  users: {
    list: () => http.get<User[]>('/users'),
    get: (id: number | string) => http.get<User>(`/users/${id}`),
  },
  posts: {
    byUser: (userId: number | string) =>
      http.get<Post[]>(`/posts?userId=${userId}`),
  },
  auth: {
    login: (payload: LoginPayload) =>
      authHttp.post<LoginResponse>('/auth/login', payload),
  },
}
```

**Key patterns:**

- Two clients with different `baseUrl`s for different API origins
- Shared logging interceptor across both
- API methods return **cold Observables** — nothing happens until subscribed
- URLs are relative — baseUrl is prepended automatically

### Users View — HTTP + Store + Error Handling

```typescript
// Effect: FETCH → HTTP → FETCH_SUCCESS or FETCH_ERROR
const effectSub = store.actions$
  .pipe(
    ofType('FETCH'),
    switchMap(() =>
      api.users.list().pipe(
        map((users) => ({ type: 'FETCH_SUCCESS' as const, users })),
        catchAndReport(errorHandler, {
          fallback: { type: 'FETCH_ERROR' as const, error: 'Failed to load users' },
          context: 'usersView/FETCH',
        }),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))

// Trigger initial load
store.dispatch({ type: 'FETCH' })
```

### Login View — Error-Specific HTTP Handling

```typescript
const submitEffect$ = form.actions$.pipe(
  ofType('SUBMIT_START'),
  exhaustMap(() => {
    if (!form.isValid()) {
      form.submitEnd(false)
      return of(null)
    }
    const { username, password } = form.getValues()
    return api.auth.login({ username, password }).pipe(
      map((res) => {
        globalStore.dispatch({
          type: 'LOGIN_SUCCESS',
          user: { id: res.id, email: res.email, token: res.accessToken },
        })
        form.submitEnd(true)
        router.navigate(globalStore.getState().redirectPath ?? '/')
        return null
      }),
      catchError((err: unknown) => {
        const msg =
          err instanceof AjaxError && err.status === 400
            ? 'Invalid credentials. Try emilys / emilyspass'
            : 'Login failed — please try again.'
        loginErrorEl.textContent = msg
        loginErrorEl.classList.remove('hidden')
        form.submitEnd(false)
        return of(null)
      }),
    )
  }),
)
```

**Patterns used:**

- `exhaustMap` prevents double-submit while request is in-flight
- Form validation checked before making HTTP call
- `AjaxError` instance checked for specific status codes (400 = invalid credentials)
- Different error messages for different failure types
- `form.submitEnd(false)` re-enables the submit button on error

### User Detail View — Parallel Requests

```typescript
const effectSub = store.actions$
  .pipe(
    ofType('FETCH'),
    switchMap(({ userId }) =>
      combineLatest([
        api.users.get(userId),
        api.posts.byUser(userId),
      ]).pipe(
        map(([user, posts]) => ({
          type: 'FETCH_SUCCESS' as const,
          user,
          posts,
        })),
        catchAndReport(errorHandler, {
          fallback: {
            type: 'FETCH_ERROR' as const,
            error: 'Failed to load user details',
          },
          context: 'userDetailView/FETCH',
        }),
      ),
    ),
  )
  .subscribe((action) => store.dispatch(action))
```

Two requests run in parallel via `combineLatest`. The action is only dispatched when **both** complete.

---

## Step 16: Architecture Summary

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HTTP REQUEST LIFECYCLE                          │
└────────────────────────────────────────────────────────────────────────┘

api.get<User>('/users/42')
    │
    ├─→ interceptedRequest({ url: '/users/42', method: 'GET' })
    │
    ├─→ REQUEST INTERCEPTORS (left-to-right)
    │     interceptor[0].request(config) → modified config
    │     interceptor[1].request(config) → modified config
    │     ...
    │
    ├─→ BASEURL PREPENDING
    │     '/users/42' → 'https://api.example.com/users/42'
    │
    ├─→ DEFAULT HEADERS MERGED
    │     Content-Type: application/json
    │     Accept: application/json
    │     + interceptor-added headers
    │     + caller-supplied headers (override)
    │
    ├─→ ajax(finalConfig) → Cold Observable (XHR not sent)
    │
    ├─→ RESPONSE INTERCEPTORS (right-to-left)
    │     interceptor[N].response(obs$) → wrapped Observable
    │     ...
    │     interceptor[0].response(obs$) → final Observable
    │
    ├─→ .subscribe() → XHR SENT
    │
    ├─→ SUCCESS: map(res => res.response) → data emitted
    │
    ├─→ ERROR: AjaxError thrown → catchError / toRemoteData
    │
    └─→ UNSUBSCRIBE: xhr.abort() → request cancelled


┌────────────────────────────────────────────────────────────────────────┐
│                        REMOTEDATA LIFECYCLE                            │
└────────────────────────────────────────────────────────────────────────┘

http.get('/api/users').pipe(toRemoteData())
    │
    ├─→ subscribe()
    │     ↓ startWith → { status: 'loading' }          ← IMMEDIATE
    │
    ├─→ XHR in flight...
    │
    ├─→ SUCCESS:
    │     ↓ map → { status: 'success', data: User[] }
    │
    └─→ ERROR:
          ↓ catchError → { status: 'error',
                            error: 'Not Found',
                            statusCode: 404 }


┌────────────────────────────────────────────────────────────────────────┐
│                        EFFECTS PATTERN                                 │
└────────────────────────────────────────────────────────────────────────┘

store.dispatch({ type: 'FETCH' })
    │
    ├─→ Reducer: { loading: true }
    │
    ├─→ actions$ emits FETCH
    │     ↓ ofType('FETCH')
    │     ↓ switchMap → http.get('/api/users')
    │
    ├─→ SUCCESS:
    │     ↓ map → { type: 'FETCH_SUCCESS', users: [...] }
    │     ↓ store.dispatch(FETCH_SUCCESS)
    │     ↓ Reducer: { loading: false, users: [...] }
    │
    └─→ ERROR:
          ↓ catchAndReport → reports to error handler
          ↓ fallback → { type: 'FETCH_ERROR', error: '...' }
          ↓ store.dispatch(FETCH_ERROR)
          ↓ Reducer: { loading: false, error: '...' }
```

### Key Design Principles

1. **Cold Observables** — Nothing happens until subscription. Each subscription is a separate request. Unsubscribe cancels the XHR.

2. **Interceptor Onion** — Request phase flows left-to-right, response phase flows right-to-left. Each interceptor wraps the pipeline.

3. **`RemoteData<T>` Eliminates Impossible States** — No `loading=true` + `error='timeout'` confusion. Exactly one state at a time.

4. **Effects Keep Reducers Pure** — HTTP lives in `actions$` subscriptions, never inside reducers. Reducers are pure `(state, action) → state`.

5. **`switchMap` Prevents Races** — New requests cancel in-flight ones. No stale responses leaking into state.

6. **Testable by Design** — `createMockHttpClient()` is a drop-in replacement. Configure responses, trigger effects, assert calls and dispatched actions.

7. **Type Safety** — Generics propagate through the entire chain: `http.get<User>()` → `Observable<User>` → `RemoteData<User>`.

8. **Composable with Any RxJS Operator** — `retry()`, `timeout()`, `shareReplay()`, `debounceTime()`, `combineLatest()` — all standard RxJS operators work naturally because HTTP methods return plain Observables.
