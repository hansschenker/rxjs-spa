import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { firstValueFrom, of, throwError, Observable } from 'rxjs'
import { map, retry } from 'rxjs/operators'
import { AjaxConfig, AjaxError } from 'rxjs/ajax'
import {
  toRemoteData,
  isLoading,
  isSuccess,
  isError,
  idle,
  loading,
  success,
  failure,
  createHttpClient,
} from './public'
import type { HttpInterceptor } from './public'

describe('RemoteData helpers', () => {
  it('idle / loading / success / failure constructors', () => {
    expect(idle().status).toBe('idle')
    expect(loading().status).toBe('loading')
    expect(success(42).status).toBe('success')
    expect((success(42) as Extract<ReturnType<typeof success>, { status: 'success' }>).data).toBe(42)
    expect(failure('oops').status).toBe('error')
    expect((failure('oops') as Extract<ReturnType<typeof failure>, { status: 'error' }>).error).toBe('oops')
  })

  it('type guards', () => {
    expect(isLoading(loading())).toBe(true)
    expect(isSuccess(success(1))).toBe(true)
    expect(isError(failure('x'))).toBe(true)
    expect(isLoading(success(1))).toBe(false)
  })
})

describe('toRemoteData()', () => {
  it('emits loading then success', async () => {
    const emitted: string[] = []
    const source$ = of(42)

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => emitted.push(rd.status),
        complete: resolve,
      })
    })

    expect(emitted).toEqual(['loading', 'success'])
  })

  it('emits loading then error on failure', async () => {
    const emitted: string[] = []
    const source$ = throwError(() => new Error('boom'))

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => emitted.push(rd.status),
        complete: resolve,
      })
    })

    expect(emitted).toEqual(['loading', 'error'])
  })

  it('error RemoteData carries the message', async () => {
    const source$ = throwError(() => new Error('network failure'))
    const values: Array<{ status: string; error?: string }> = []

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => values.push(rd as { status: string; error?: string }),
        complete: resolve,
      })
    })

    const errRd = values.find((v) => v.status === 'error')
    expect(errRd?.error).toBe('network failure')
  })

  it('success RemoteData carries the data', async () => {
    const source$ = of([1, 2, 3])
    const values: Array<{ status: string; data?: number[] }> = []

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => values.push(rd as { status: string; data?: number[] }),
        complete: resolve,
      })
    })

    const successRd = values.find((v) => v.status === 'success')
    expect(successRd?.data).toEqual([1, 2, 3])
  })
})

// ---------------------------------------------------------------------------
// createHttpClient — interceptors
// ---------------------------------------------------------------------------

// Mock rxjs/ajax to capture config and return controlled responses
vi.mock('rxjs/ajax', async () => {
  const actual = await vi.importActual<typeof import('rxjs/ajax')>('rxjs/ajax')
  return {
    ...actual,
    ajax: vi.fn((config: AjaxConfig) => {
      // Store the last config for inspection
      ;(globalThis as Record<string, unknown>).__lastAjaxConfig = config
      return of({ response: { mocked: true, url: config.url } })
    }),
  }
})

// Import the mocked ajax so we can inspect calls
import { ajax } from 'rxjs/ajax'
const mockedAjax = vi.mocked(ajax)

describe('createHttpClient', () => {
  beforeEach(() => {
    mockedAjax.mockClear()
  })

  it('returns an HttpClient with all methods', () => {
    const client = createHttpClient()
    expect(typeof client.get).toBe('function')
    expect(typeof client.post).toBe('function')
    expect(typeof client.put).toBe('function')
    expect(typeof client.patch).toBe('function')
    expect(typeof client.delete).toBe('function')
  })

  it('prepends baseUrl to relative paths', async () => {
    const client = createHttpClient({ baseUrl: 'https://api.example.com' })
    await firstValueFrom(client.get('/users'))

    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    expect(config.url).toBe('https://api.example.com/users')
  })

  it('does not prepend baseUrl to absolute URLs', async () => {
    const client = createHttpClient({ baseUrl: 'https://api.example.com' })
    await firstValueFrom(client.get('https://other.com/data'))

    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    expect(config.url).toBe('https://other.com/data')
  })

  it('strips trailing slashes from baseUrl', async () => {
    const client = createHttpClient({ baseUrl: 'https://api.example.com/' })
    await firstValueFrom(client.get('/users'))

    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    expect(config.url).toBe('https://api.example.com/users')
  })

  it('request interceptor modifies the config', async () => {
    const authInterceptor: HttpInterceptor = {
      request: (c) => ({
        ...c,
        headers: { ...c.headers, Authorization: 'Bearer tok123' },
      }),
    }

    const client = createHttpClient({ interceptors: [authInterceptor] })
    await firstValueFrom(client.get('/secure'))

    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    expect((config.headers as Record<string, string>).Authorization).toBe('Bearer tok123')
  })

  it('request interceptors run in order (left to right)', async () => {
    const order: number[] = []

    const first: HttpInterceptor = {
      request: (c) => {
        order.push(1)
        return { ...c, headers: { ...c.headers, 'X-First': 'yes' } }
      },
    }
    const second: HttpInterceptor = {
      request: (c) => {
        order.push(2)
        return { ...c, headers: { ...c.headers, 'X-Second': 'yes' } }
      },
    }

    const client = createHttpClient({ interceptors: [first, second] })
    await firstValueFrom(client.get('/test'))

    expect(order).toEqual([1, 2])
    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    const headers = config.headers as Record<string, string>
    expect(headers['X-First']).toBe('yes')
    expect(headers['X-Second']).toBe('yes')
  })

  it('response interceptor transforms the response Observable', async () => {
    const uppercaseInterceptor: HttpInterceptor = {
      response: <T>(source$: Observable<T>): Observable<T> =>
        source$.pipe(
          map((v) => {
            if (typeof v === 'object' && v !== null) {
              return { ...v, intercepted: true } as T
            }
            return v
          }),
        ),
    }

    const client = createHttpClient({ interceptors: [uppercaseInterceptor] })
    const result = await firstValueFrom(client.get<{ mocked: boolean; intercepted?: boolean }>('/test'))

    expect(result.intercepted).toBe(true)
  })

  it('response interceptors run in reverse order (right to left)', async () => {
    const order: number[] = []

    const first: HttpInterceptor = {
      response: <T>(source$: Observable<T>): Observable<T> => {
        order.push(1)
        return source$
      },
    }
    const second: HttpInterceptor = {
      response: <T>(source$: Observable<T>): Observable<T> => {
        order.push(2)
        return source$
      },
    }

    const client = createHttpClient({ interceptors: [first, second] })
    await firstValueFrom(client.get('/test'))

    // Response interceptors applied right-to-left: second first, then first
    expect(order).toEqual([2, 1])
  })

  it('works with both request and response interceptors', async () => {
    const interceptor: HttpInterceptor = {
      request: (c) => ({ ...c, headers: { ...c.headers, 'X-Custom': 'val' } }),
      response: <T>(source$: Observable<T>): Observable<T> =>
        source$.pipe(map((v) => ({ ...(v as object), tagged: true }) as T)),
    }

    const client = createHttpClient({
      baseUrl: 'https://api.test.com',
      interceptors: [interceptor],
    })
    const result = await firstValueFrom(client.post<{ tagged?: boolean }>('/data', { key: 'value' }))

    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    expect(config.url).toBe('https://api.test.com/data')
    expect((config.headers as Record<string, string>)['X-Custom']).toBe('val')
    expect(config.body).toEqual({ key: 'value' })
    expect(result.tagged).toBe(true)
  })

  it('works with no interceptors (plain client)', async () => {
    const client = createHttpClient()
    const result = await firstValueFrom(client.get<{ mocked: boolean }>('/plain'))

    const config = mockedAjax.mock.calls[0][0] as AjaxConfig
    expect(config.url).toBe('/plain')
    expect(result.mocked).toBe(true)
  })

  it('interceptor can see and modify method', async () => {
    const methodLogger: HttpInterceptor = {
      request: (c) => {
        expect(c.method).toBe('DELETE')
        return c
      },
    }

    const client = createHttpClient({ interceptors: [methodLogger] })
    await firstValueFrom(client.delete('/item/1'))
  })
})
