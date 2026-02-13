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
// http — the public API surface
// ---------------------------------------------------------------------------

export interface HttpRequestOptions
  extends Omit<AjaxConfig, 'url' | 'method' | 'body'> {}

/**
 * Thin, cancellable HTTP client built on rxjs/ajax.
 *
 * Every method returns a cold Observable — nothing is sent until you subscribe,
 * and unsubscribing cancels the in-flight XHR.
 *
 * @example
 *   // Basic GET
 *   http.get<User[]>('/api/users').subscribe(console.log)
 *
 *   // With switchMap for cancellation
 *   search$.pipe(
 *     switchMap(q => http.get<User[]>(`/api/users?q=${q}`))
 *   ).subscribe(renderUsers)
 *
 *   // Wrapped in RemoteData
 *   http.get<User[]>('/api/users').pipe(toRemoteData())
 */
export const http = {
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
