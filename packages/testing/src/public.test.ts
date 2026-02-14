import { describe, test, expect, vi, beforeEach } from 'vitest'
import { BehaviorSubject, of, Subject, throwError, Observable } from 'rxjs'
import { delay } from 'rxjs/operators'

import {
  collectFrom,
  createMockStore,
  createMockRouter,
  createMockHttpClient,
  triggerHashChange,
} from './public'

// ---------------------------------------------------------------------------
// collectFrom
// ---------------------------------------------------------------------------

describe('collectFrom', () => {
  test('collects synchronous emissions', () => {
    const subject = new Subject<number>()
    const result = collectFrom(subject)

    subject.next(1)
    subject.next(2)
    subject.next(3)

    expect(result.values).toEqual([1, 2, 3])
    result.subscription.unsubscribe()
  })

  test('captures BehaviorSubject initial value', () => {
    const bs = new BehaviorSubject<string>('initial')
    const result = collectFrom(bs)

    expect(result.values).toEqual(['initial'])
    bs.next('updated')
    expect(result.values).toEqual(['initial', 'updated'])
    result.subscription.unsubscribe()
  })

  test('stops collecting after unsubscribe', () => {
    const subject = new Subject<number>()
    const result = collectFrom(subject)

    subject.next(1)
    result.subscription.unsubscribe()
    subject.next(2) // should not appear

    expect(result.values).toEqual([1])
  })
})

// ---------------------------------------------------------------------------
// createMockStore
// ---------------------------------------------------------------------------

describe('createMockStore', () => {
  test('emits initial state', () => {
    const store = createMockStore({ count: 0 })
    const result = collectFrom(store.state$)

    expect(result.values).toEqual([{ count: 0 }])
    result.subscription.unsubscribe()
  })

  test('setState drives state$', () => {
    const store = createMockStore({ count: 0 })
    const result = collectFrom(store.state$)

    store.setState({ count: 5 })
    store.setState({ count: 10 })

    expect(result.values).toEqual([{ count: 0 }, { count: 5 }, { count: 10 }])
    result.subscription.unsubscribe()
  })

  test('getState returns current state', () => {
    const store = createMockStore({ count: 0 })
    expect(store.getState()).toEqual({ count: 0 })

    store.setState({ count: 42 })
    expect(store.getState()).toEqual({ count: 42 })
  })

  test('dispatch records actions and emits on actions$', () => {
    type Action = { type: 'INC' } | { type: 'DEC' }
    const store = createMockStore<{ count: number }, Action>({ count: 0 })
    const result = collectFrom(store.actions$)

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'DEC' })

    expect(store.dispatchedActions).toEqual([{ type: 'INC' }, { type: 'DEC' }])
    expect(result.values).toEqual([{ type: 'INC' }, { type: 'DEC' }])
    result.subscription.unsubscribe()
  })

  test('select returns distinct derived slices', () => {
    const store = createMockStore({ count: 0, name: 'test' })
    const result = collectFrom(store.select((s) => s.count))

    store.setState({ count: 0, name: 'changed' }) // count unchanged → no emit
    store.setState({ count: 1, name: 'changed' }) // count changed → emit

    expect(result.values).toEqual([0, 1])
    result.subscription.unsubscribe()
  })
})

// ---------------------------------------------------------------------------
// createMockRouter
// ---------------------------------------------------------------------------

describe('createMockRouter', () => {
  test('emits initial route when provided', () => {
    const router = createMockRouter({
      name: 'home',
      params: {},
      query: {},
      path: '/',
    })
    const result = collectFrom(router.route$)

    expect(result.values.length).toBe(1)
    expect(result.values[0].name).toBe('home')
    result.subscription.unsubscribe()
  })

  test('emit pushes route changes', () => {
    const router = createMockRouter<'home' | 'users'>({
      name: 'home',
      params: {},
      query: {},
      path: '/',
    })
    const result = collectFrom(router.route$)

    router.emit({ name: 'users', params: {}, query: {}, path: '/users' })

    expect(result.values.length).toBe(2)
    expect(result.values[1].name).toBe('users')
    result.subscription.unsubscribe()
  })

  test('navigate records paths', () => {
    const router = createMockRouter()

    router.navigate('/users')
    router.navigate('/users/42')

    expect(router.navigatedTo).toEqual(['/users', '/users/42'])
  })

  test('link returns path as-is for absolute paths', () => {
    const router = createMockRouter()

    expect(router.link('/users')).toBe('/users')
    expect(router.link('users')).toBe('/users')
  })

  test('destroy is callable (no-op)', () => {
    const router = createMockRouter()
    expect(() => router.destroy()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// createMockHttpClient
// ---------------------------------------------------------------------------

describe('createMockHttpClient', () => {
  test('responds to configured GET request', () => {
    const http = createMockHttpClient()
    http.whenGet('/api/users').respond([{ id: 1 }])

    const result = collectFrom(http.get<{ id: number }[]>('/api/users'))

    expect(result.values).toEqual([[{ id: 1 }]])
    result.subscription.unsubscribe()
  })

  test('responds to configured POST request with body', () => {
    const http = createMockHttpClient()
    http.whenPost('/api/users').respond({ id: 2, name: 'Bob' })

    const result = collectFrom(
      http.post('/api/users', { name: 'Bob' }),
    )

    expect(result.values).toEqual([{ id: 2, name: 'Bob' }])
    expect(http.calls).toEqual([
      { method: 'POST', url: '/api/users', body: { name: 'Bob' } },
    ])
    result.subscription.unsubscribe()
  })

  test('responds to PUT, PATCH, DELETE', () => {
    const http = createMockHttpClient()
    http.whenPut('/api/u/1').respond('put-ok')
    http.whenPatch('/api/u/1').respond('patch-ok')
    http.whenDelete('/api/u/1').respond('del-ok')

    const putResult = collectFrom(http.put('/api/u/1', { x: 1 }))
    const patchResult = collectFrom(http.patch('/api/u/1', { x: 2 }))
    const delResult = collectFrom(http.delete('/api/u/1'))

    expect(putResult.values).toEqual(['put-ok'])
    expect(patchResult.values).toEqual(['patch-ok'])
    expect(delResult.values).toEqual(['del-ok'])

    putResult.subscription.unsubscribe()
    patchResult.subscription.unsubscribe()
    delResult.subscription.unsubscribe()
  })

  test('records all calls in order', () => {
    const http = createMockHttpClient()
    http.whenGet('/a').respond(1)
    http.whenPost('/b').respond(2)

    collectFrom(http.get('/a')).subscription.unsubscribe()
    collectFrom(http.post('/b', 'body')).subscription.unsubscribe()

    expect(http.calls).toEqual([
      { method: 'GET', url: '/a' },
      { method: 'POST', url: '/b', body: 'body' },
    ])
  })

  test('throws error for unconfigured requests', () => {
    const http = createMockHttpClient()
    const errors: Error[] = []

    http.get('/unknown').subscribe({
      error: (e) => errors.push(e),
    })

    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('No mock configured for GET /unknown')
  })

  test('respondWith allows custom Observable responses', () => {
    const http = createMockHttpClient()
    const error = new Error('server error')
    http.whenGet('/fail').respondWith(throwError(() => error))

    const errors: Error[] = []
    http.get('/fail').subscribe({ error: (e) => errors.push(e) })

    expect(errors).toEqual([error])
  })
})

// ---------------------------------------------------------------------------
// triggerHashChange
// ---------------------------------------------------------------------------

describe('triggerHashChange', () => {
  test('sets window.location.hash', () => {
    triggerHashChange('#/test-path')
    expect(window.location.hash).toBe('#/test-path')
  })

  test('dispatches hashchange event', () => {
    const handler = vi.fn()
    window.addEventListener('hashchange', handler)

    triggerHashChange('#/another')

    expect(handler).toHaveBeenCalledOnce()
    window.removeEventListener('hashchange', handler)
  })
})
