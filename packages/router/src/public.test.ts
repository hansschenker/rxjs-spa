import { describe, it, expect, beforeEach, vi } from 'vitest'
import { of, throwError } from 'rxjs'
import { createRouter, withGuard } from './public'
import type { RouteMatch } from './public'

// jsdom doesn't fire real hashchange events when you set location.hash,
// so we trigger it manually in each test.
function setHash(path: string) {
  window.location.hash = path
  window.dispatchEvent(new Event('hashchange'))
}

const ROUTES = {
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '/users/:id/posts/:postId': 'user-post',
} as const

describe('createRouter — route matching', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('matches the root route', () => {
    window.location.hash = '#/'
    const router = createRouter(ROUTES)
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['home'])
    sub.unsubscribe()
  })

  it('matches a static path', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES)
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['users'])
    sub.unsubscribe()
  })

  it('extracts a single param', () => {
    window.location.hash = '#/users/42'
    const router = createRouter(ROUTES)
    const matches: ReturnType<typeof router.route$['subscribe']>[] = []
    const params: Record<string, string>[] = []
    const sub = router.route$.subscribe(r => params.push(r.params))
    expect(params[0]).toEqual({ id: '42' })
    sub.unsubscribe()
  })

  it('extracts multiple params', () => {
    window.location.hash = '#/users/7/posts/99'
    const router = createRouter(ROUTES)
    const params: Record<string, string>[] = []
    const sub = router.route$.subscribe(r => params.push(r.params))
    expect(params[0]).toEqual({ id: '7', postId: '99' })
    sub.unsubscribe()
  })

  it('does not emit for unrecognised paths when no wildcard defined', () => {
    window.location.hash = '#/not-a-real-route'
    const router = createRouter(ROUTES)
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual([])
    sub.unsubscribe()
  })
})

// ---------------------------------------------------------------------------
// Wildcard / 404 route
// ---------------------------------------------------------------------------

const ROUTES_WITH_WILDCARD = {
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '*': 'not-found',
} as const

describe('createRouter — wildcard route', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('matches wildcard for unrecognised paths', () => {
    window.location.hash = '#/some/unknown/path'
    const router = createRouter(ROUTES_WITH_WILDCARD)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))
    expect(seen).toHaveLength(1)
    expect(seen[0].name).toBe('not-found')
    expect(seen[0].params).toEqual({})
    expect(seen[0].path).toBe('/some/unknown/path')
    sub.unsubscribe()
  })

  it('prefers specific routes over wildcard', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES_WITH_WILDCARD)
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['users'])
    sub.unsubscribe()
  })

  it('wildcard matches root when / is not defined', () => {
    window.location.hash = '#/anything'
    const router = createRouter({ '/about': 'about', '*': 'fallback' } as const)
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['fallback'])
    sub.unsubscribe()
  })

  it('navigation to unknown path emits wildcard route', () => {
    window.location.hash = '#/'
    const router = createRouter(ROUTES_WITH_WILDCARD)
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))

    setHash('#/does-not-exist')

    expect(seen).toEqual(['home', 'not-found'])
    sub.unsubscribe()
  })
})

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

describe('createRouter — query params', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('parses query string into query object', () => {
    window.location.hash = '#/users?page=2&sort=name'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    expect(seen).toHaveLength(1)
    expect(seen[0].name).toBe('users')
    expect(seen[0].query).toEqual({ page: '2', sort: 'name' })
    expect(seen[0].path).toBe('/users')
    sub.unsubscribe()
  })

  it('provides empty query object when no query string', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    expect(seen[0].query).toEqual({})
    sub.unsubscribe()
  })

  it('decodes URI-encoded query values', () => {
    window.location.hash = '#/?msg=hello%20world&tag=a%26b'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    expect(seen[0].query).toEqual({ msg: 'hello world', tag: 'a&b' })
    sub.unsubscribe()
  })

  it('handles query keys without values', () => {
    window.location.hash = '#/users?debug'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    expect(seen[0].query).toEqual({ debug: '' })
    sub.unsubscribe()
  })

  it('emits when query changes on the same path', () => {
    window.location.hash = '#/users?page=1'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    setHash('#/users?page=2')

    expect(seen).toHaveLength(2)
    expect(seen[0].query).toEqual({ page: '1' })
    expect(seen[1].query).toEqual({ page: '2' })
    sub.unsubscribe()
  })

  it('does not re-emit when path and query are identical', () => {
    window.location.hash = '#/users?page=1'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    setHash('#/users?page=1')

    expect(seen).toHaveLength(1)
    sub.unsubscribe()
  })

  it('works with params and query together', () => {
    window.location.hash = '#/users/42?tab=posts'
    const router = createRouter(ROUTES)
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    expect(seen[0].name).toBe('user-detail')
    expect(seen[0].params).toEqual({ id: '42' })
    expect(seen[0].query).toEqual({ tab: 'posts' })
    sub.unsubscribe()
  })
})

describe('createRouter — navigation', () => {
  beforeEach(() => {
    window.location.hash = '#/'
  })

  it('navigate() updates the hash and emits the new route', () => {
    const router = createRouter(ROUTES)
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    setHash('#/users')
    setHash('#/users/5')

    expect(names).toEqual(['home', 'users', 'user-detail'])
    sub.unsubscribe()
  })

  it('does not re-emit when navigating to the same path', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES)
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    setHash('#/users') // same — should be deduplicated
    setHash('#/users/1') // different — should emit

    expect(names).toEqual(['users', 'user-detail'])
    sub.unsubscribe()
  })

  it('late subscriber receives the current route immediately', () => {
    window.location.hash = '#/users/99'
    const router = createRouter(ROUTES)

    // First subscriber to warm up shareReplay
    const sub1 = router.route$.subscribe(() => {})

    const late: string[] = []
    const sub2 = router.route$.subscribe(r => late.push(r.name))

    expect(late).toEqual(['user-detail'])
    sub1.unsubscribe()
    sub2.unsubscribe()
  })
})

describe('createRouter — link()', () => {
  it('prepends # to paths', () => {
    const router = createRouter(ROUTES)
    expect(router.link('/users/42')).toBe('#/users/42')
    expect(router.link('/')).toBe('#/')
  })
})

// ---------------------------------------------------------------------------
// withGuard
// ---------------------------------------------------------------------------

describe('withGuard', () => {
  function makeRoutes() {
    window.location.hash = '#/'
    return createRouter(ROUTES)
  }

  it('passes through public routes without calling the guard', () => {
    const router = makeRoutes()
    const guard = vi.fn(() => of(false)) // would deny if called
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users', 'user-detail'], guard, denied),
    ).subscribe(r => seen.push(r.name))

    expect(seen).toEqual(['home'])
    expect(guard).not.toHaveBeenCalled()
    expect(denied).not.toHaveBeenCalled()
    sub.unsubscribe()
  })

  it('passes through protected route when guard returns true', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES)
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users', 'user-detail'], () => of(true), denied),
    ).subscribe(r => seen.push(r.name))

    expect(seen).toEqual(['users'])
    expect(denied).not.toHaveBeenCalled()
    sub.unsubscribe()
  })

  it('suppresses protected route and calls onDenied when guard returns false', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES)
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users', 'user-detail'], () => of(false), denied),
    ).subscribe(r => seen.push(r.name))

    expect(seen).toEqual([])
    expect(denied).toHaveBeenCalledOnce()
    sub.unsubscribe()
  })

  it('calls onDenied and suppresses when guard observable errors', () => {
    window.location.hash = '#/users'
    const router = createRouter(ROUTES)
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users'], () => throwError(() => new Error('guard failed')), denied),
    ).subscribe(r => seen.push(r.name))

    expect(seen).toEqual([])
    expect(denied).toHaveBeenCalledOnce()
    sub.unsubscribe()
  })

  it('re-evaluates guard on each navigation', () => {
    window.location.hash = '#/'
    const router = makeRoutes()
    let isAuthenticated = false
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users'], () => of(isAuthenticated), denied),
    ).subscribe(r => seen.push(r.name))

    // Navigate to protected route — denied
    setHash('#/users')
    expect(denied).toHaveBeenCalledOnce()
    expect(seen).toEqual(['home'])

    // Authenticate, navigate again — allowed
    isAuthenticated = true
    setHash('#/')
    setHash('#/users')
    expect(seen).toEqual(['home', 'home', 'users'])
    sub.unsubscribe()
  })
})
