import { Observable, of } from 'rxjs'
import { ajax, AjaxConfig, AjaxError } from 'rxjs/ajax'
import { map, catchError, startWith } from 'rxjs/operators'

// ---------------------------------------------------------------------------
// RemoteData — discriminated union representing async request lifecycle
// ---------------------------------------------------------------------------

export type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; statusCode?: number }

export const idle = (): RemoteData<never> => ({ status: 'idle' })
export const loading = (): RemoteData<never> => ({ status: 'loading' })
export const success = <T>(data: T): RemoteData<T> => ({ status: 'success', data })
export const failure = (error: string, statusCode?: number): RemoteData<never> => ({
  status: 'error',
  error,
  statusCode,
})

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

/**
 * toRemoteData(source$)
 *
 * Wraps any Observable into a RemoteData stream:
 *   - Immediately emits `{ status: 'loading' }`
 *   - On success emits `{ status: 'success', data }`
 *   - On error emits `{ status: 'error', error, statusCode? }`
 *
 * Usage:
 *   const users$ = http.get<User[]>('/api/users').pipe(toRemoteData())
 */
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

// ---------------------------------------------------------------------------
// Internal request factory
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HttpRequestOptions
  extends Omit<AjaxConfig, 'url' | 'method' | 'body'> {}

export interface HttpClient {
  get<T>(url: string, options?: HttpRequestOptions): Observable<T>
  post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>
  delete<T>(url: string, options?: HttpRequestOptions): Observable<T>
}

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------

/**
 * An interceptor can modify the outgoing request config and/or the
 * incoming response Observable.
 *
 * - `request(config)` — called before the XHR is sent. Return a modified config.
 * - `response(source$)` — called after the XHR Observable is created.
 *   Return a transformed Observable (e.g. for retry, logging, error mapping).
 *
 * Both methods are optional.
 */
export interface HttpInterceptor {
  request?(config: AjaxConfig): AjaxConfig
  response?<T>(source$: Observable<T>): Observable<T>
}

export interface HttpClientConfig {
  /** Base URL prepended to all relative paths. */
  baseUrl?: string
  /** Interceptors applied in order: request phase left-to-right, response phase right-to-left. */
  interceptors?: HttpInterceptor[]
}

// ---------------------------------------------------------------------------
// createHttpClient
// ---------------------------------------------------------------------------

/**
 * createHttpClient(config?)
 *
 * Creates an HTTP client with optional base URL and interceptors.
 * Returns the same `HttpClient` interface as the default `http` export.
 *
 * Interceptor execution order:
 *   Request phase:  interceptor[0].request → interceptor[1].request → … → XHR
 *   Response phase: … → interceptor[1].response → interceptor[0].response → subscriber
 *
 * @example
 *   const api = createHttpClient({
 *     baseUrl: 'https://api.example.com',
 *     interceptors: [
 *       { request: (c) => ({ ...c, headers: { ...c.headers, Authorization: `Bearer ${token}` } }) },
 *       { response: (res$) => res$.pipe(retry(2)) },
 *     ],
 *   })
 *
 *   api.get<User[]>('/users').subscribe(console.log) // → GET https://api.example.com/users
 */
export function createHttpClient(config?: HttpClientConfig): HttpClient {
  const baseUrl = config?.baseUrl?.replace(/\/+$/, '') ?? ''
  const interceptors = config?.interceptors ?? []

  function interceptedRequest<T>(ajaxConfig: AjaxConfig): Observable<T> {
    // Apply request interceptors left-to-right
    let cfg = ajaxConfig
    for (const i of interceptors) {
      if (i.request) cfg = i.request(cfg)
    }

    // Prepend base URL to relative paths
    if (baseUrl && cfg.url && !cfg.url.startsWith('http://') && !cfg.url.startsWith('https://')) {
      cfg = { ...cfg, url: baseUrl + (cfg.url.startsWith('/') ? cfg.url : '/' + cfg.url) }
    }

    let result$: Observable<T> = request<T>(cfg)

    // Apply response interceptors right-to-left (reverse order)
    for (let idx = interceptors.length - 1; idx >= 0; idx--) {
      const i = interceptors[idx]
      if (i.response) result$ = i.response<T>(result$)
    }

    return result$
  }

  return {
    get<T>(url: string, options?: HttpRequestOptions): Observable<T> {
      return interceptedRequest<T>({ ...options, url, method: 'GET' })
    },
    post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T> {
      return interceptedRequest<T>({ ...options, url, method: 'POST', body })
    },
    put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T> {
      return interceptedRequest<T>({ ...options, url, method: 'PUT', body })
    },
    patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T> {
      return interceptedRequest<T>({ ...options, url, method: 'PATCH', body })
    },
    delete<T>(url: string, options?: HttpRequestOptions): Observable<T> {
      return interceptedRequest<T>({ ...options, url, method: 'DELETE' })
    },
  }
}

// ---------------------------------------------------------------------------
// http — default client (no interceptors, no base URL)
// ---------------------------------------------------------------------------

/**
 * Default HTTP client with no interceptors or base URL.
 * Use `createHttpClient(config)` for customisation.
 *
 * Every method returns a cold Observable — nothing is sent until you subscribe,
 * and unsubscribing cancels the in-flight XHR.
 *
 * @example
 *   http.get<User[]>('/api/users').subscribe(console.log)
 *   http.get<User[]>('/api/users').pipe(toRemoteData())
 */
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
