import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Observable, Subscription, of, throwError } from 'rxjs'
import { createDataRouter, createRouter, withGuard, withScrollReset, lazy } from './public'
import type { RouteMatch, Router } from './public'

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

describe('createDataRouter', () => {
  beforeEach(() => {
    window.location.hash = '#/'
  })

  it('emits loading then success for routes with loaders', () => {
    window.location.hash = '#/users'
    const router = createDataRouter({
      '/': {
        name: 'home',
        mount: () => new Subscription(),
      },
      '/users': {
        name: 'users',
        loader: () => of([{ id: 1 }]),
        mount: () => new Subscription(),
      },
    } as const)

    const states: string[] = []
    const sub = router.routeState$.subscribe((state) => states.push(state.status))

    expect(states).toEqual(['loading', 'success'])
    sub.unsubscribe()
  })

  it('cancels stale loaders when navigating quickly', () => {
    window.location.hash = '#/users/1'
    const cancelled: string[] = []

    const router = createDataRouter({
      '/users/:id': {
        name: 'user',
        loader: ({ params }) =>
          new Observable<string>(() => () => cancelled.push(params.id)),
        mount: () => new Subscription(),
      },
    } as const)

    const sub = router.routeState$.subscribe(() => {})
    setHash('#/users/2')

    expect(cancelled).toEqual(['1'])
    sub.unsubscribe()
  })

  it('mount(outlet) renders pending, success, and error states', async () => {
    vi.useFakeTimers()
    window.location.hash = '#/users'
    const outlet = document.createElement('div')

    const mounted: string[] = []
    const router = createDataRouter({
      '/users': {
        name: 'users',
        loader: () => new Promise<string>((resolve) => setTimeout(() => resolve('Ada'), 10)),
        pending: (el) => {
          el.textContent = 'Loading users...'
        },
        mount: (el, ctx) => {
          el.textContent = `User: ${ctx.data}`
          mounted.push(String(ctx.data))
          return new Subscription()
        },
      },
      '/broken': {
        name: 'broken',
        loader: () => throwError(() => new Error('boom')),
        error: (el, err) => {
          el.textContent = `Error: ${(err as Error).message}`
        },
        mount: () => new Subscription(),
      },
    } as const)

    const sub = router.mount(outlet)
    expect(outlet.textContent).toBe('Loading users...')

    await vi.advanceTimersByTimeAsync(10)
    expect(mounted).toEqual(['Ada'])
    expect(outlet.textContent).toBe('User: Ada')

    setHash('#/broken')
    expect(outlet.textContent).toBe('Error: boom')

    sub.unsubscribe()
    vi.useRealTimers()
  })

  it('supports lazyMount and mounts resolved view modules', async () => {
    window.location.hash = '#/lazy'
    const outlet = document.createElement('div')

    const router = createDataRouter({
      '/lazy': {
        name: 'lazy',
        lazyMount: async () => ({
          default: (el) => {
            el.textContent = 'Lazy view mounted'
            return new Subscription()
          },
        }),
      },
    } as const)

    const sub = router.mount(outlet)
    await Promise.resolve()
    await Promise.resolve()

    expect(outlet.textContent).toBe('Lazy view mounted')
    sub.unsubscribe()
  })

  it('preloads all lazy routes when preload: "all" is enabled', async () => {
    window.location.hash = '#/'
    const calls: string[] = []

    createDataRouter({
      '/': {
        name: 'home',
        mount: () => new Subscription(),
      },
      '/lazy': {
        name: 'lazy',
        lazyMount: async () => {
          calls.push('lazy')
          return {
            default: () => new Subscription(),
          }
        },
      },
    } as const, { preload: 'all' })

    await Promise.resolve()
    expect(calls).toEqual(['lazy'])
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

// ===========================================================================
// History mode
// ===========================================================================

const HISTORY_ROUTES = {
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '/users/:id/posts/:postId': 'user-post',
} as const

const HISTORY_ROUTES_WILDCARD = {
  '/': 'home',
  '/users': 'users',
  '/users/:id': 'user-detail',
  '*': 'not-found',
} as const

describe('createRouter — history mode: route matching', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('matches the root route', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['home'])
    sub.unsubscribe()
  })

  it('matches a static path', () => {
    history.replaceState(null, '', '/users')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['users'])
    sub.unsubscribe()
  })

  it('extracts a single param', () => {
    history.replaceState(null, '', '/users/42')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const params: Record<string, string>[] = []
    const sub = router.route$.subscribe(r => params.push(r.params))
    expect(params[0]).toEqual({ id: '42' })
    sub.unsubscribe()
  })

  it('extracts multiple params', () => {
    history.replaceState(null, '', '/users/7/posts/99')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const params: Record<string, string>[] = []
    const sub = router.route$.subscribe(r => params.push(r.params))
    expect(params[0]).toEqual({ id: '7', postId: '99' })
    sub.unsubscribe()
  })

  it('does not emit for unrecognised paths when no wildcard defined', () => {
    history.replaceState(null, '', '/not-a-real-route')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual([])
    sub.unsubscribe()
  })
})

describe('createRouter — history mode: wildcard route', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('matches wildcard for unrecognised paths', () => {
    history.replaceState(null, '', '/some/unknown/path')
    router = createRouter(HISTORY_ROUTES_WILDCARD, { mode: 'history' })
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))
    expect(seen).toHaveLength(1)
    expect(seen[0].name).toBe('not-found')
    expect(seen[0].params).toEqual({})
    expect(seen[0].path).toBe('/some/unknown/path')
    sub.unsubscribe()
  })

  it('prefers specific routes over wildcard', () => {
    history.replaceState(null, '', '/users')
    router = createRouter(HISTORY_ROUTES_WILDCARD, { mode: 'history' })
    const seen: string[] = []
    const sub = router.route$.subscribe(r => seen.push(r.name))
    expect(seen).toEqual(['users'])
    sub.unsubscribe()
  })
})

describe('createRouter — history mode: query params', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('parses query string into query object', () => {
    history.replaceState(null, '', '/users?page=2&sort=name')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))
    expect(seen).toHaveLength(1)
    expect(seen[0].name).toBe('users')
    expect(seen[0].query).toEqual({ page: '2', sort: 'name' })
    expect(seen[0].path).toBe('/users')
    sub.unsubscribe()
  })

  it('provides empty query object when no query string', () => {
    history.replaceState(null, '', '/users')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))
    expect(seen[0].query).toEqual({})
    sub.unsubscribe()
  })

  it('decodes URI-encoded query values', () => {
    history.replaceState(null, '', '/?msg=hello%20world&tag=a%26b')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))
    expect(seen[0].query).toEqual({ msg: 'hello world', tag: 'a&b' })
    sub.unsubscribe()
  })

  it('works with params and query together', () => {
    history.replaceState(null, '', '/users/42?tab=posts')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))
    expect(seen[0].name).toBe('user-detail')
    expect(seen[0].params).toEqual({ id: '42' })
    expect(seen[0].query).toEqual({ tab: 'posts' })
    sub.unsubscribe()
  })
})

describe('createRouter — history mode: navigate()', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('navigate() pushes state and emits the new route', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    router.navigate('/users')
    router.navigate('/users/5')

    expect(names).toEqual(['home', 'users', 'user-detail'])
    sub.unsubscribe()
  })

  it('does not re-emit when navigating to the same path', () => {
    history.replaceState(null, '', '/users')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    router.navigate('/users') // same — should be deduplicated
    router.navigate('/users/1') // different — should emit

    expect(names).toEqual(['users', 'user-detail'])
    sub.unsubscribe()
  })

  it('emits when query changes via navigate', () => {
    history.replaceState(null, '', '/users?page=1')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const seen: RouteMatch[] = []
    const sub = router.route$.subscribe(r => seen.push(r))

    router.navigate('/users?page=2')

    expect(seen).toHaveLength(2)
    expect(seen[0].query).toEqual({ page: '1' })
    expect(seen[1].query).toEqual({ page: '2' })
    sub.unsubscribe()
  })

  it('late subscriber receives the current route immediately', () => {
    history.replaceState(null, '', '/users/99')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })

    const sub1 = router.route$.subscribe(() => {})

    const late: string[] = []
    const sub2 = router.route$.subscribe(r => late.push(r.name))

    expect(late).toEqual(['user-detail'])
    sub1.unsubscribe()
    sub2.unsubscribe()
  })
})

describe('createRouter — history mode: popstate (back/forward)', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('emits on popstate events (browser back/forward)', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    // Simulate browser back to /users
    history.replaceState(null, '', '/users')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(names).toEqual(['home', 'users'])
    sub.unsubscribe()
  })
})

describe('createRouter — history mode: link()', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('returns clean paths without hash', () => {
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    expect(router.link('/users/42')).toBe('/users/42')
    expect(router.link('/')).toBe('/')
  })

  it('prepends / if missing', () => {
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    expect(router.link('users')).toBe('/users')
  })
})

describe('createRouter — history mode: click interception', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('intercepts <a> clicks and navigates without page reload', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    const link = document.createElement('a')
    link.href = '/users'
    document.body.appendChild(link)

    link.click()

    expect(names).toEqual(['home', 'users'])
    expect(window.location.pathname).toBe('/users')
    document.body.removeChild(link)
    sub.unsubscribe()
  })

  it('does not intercept clicks with modifier keys', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    const link = document.createElement('a')
    link.href = '/users'
    document.body.appendChild(link)

    // Simulate ctrl+click — should not be intercepted
    const ctrlClick = new MouseEvent('click', { bubbles: true, ctrlKey: true })
    link.dispatchEvent(ctrlClick)

    expect(names).toEqual(['home']) // no navigation
    document.body.removeChild(link)
    sub.unsubscribe()
  })

  it('does not intercept links with target="_blank"', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    const link = document.createElement('a')
    link.href = '/users'
    link.target = '_blank'
    document.body.appendChild(link)

    link.click()

    expect(names).toEqual(['home']) // no navigation
    document.body.removeChild(link)
    sub.unsubscribe()
  })

  it('does not intercept links with download attribute', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    const link = document.createElement('a')
    link.href = '/users'
    link.setAttribute('download', '')
    document.body.appendChild(link)

    link.click()

    expect(names).toEqual(['home']) // no navigation
    document.body.removeChild(link)
    sub.unsubscribe()
  })

  it('intercepts clicks on child elements inside <a>', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    const link = document.createElement('a')
    link.href = '/users'
    const span = document.createElement('span')
    span.textContent = 'Users'
    link.appendChild(span)
    document.body.appendChild(link)

    span.click()

    expect(names).toEqual(['home', 'users'])
    document.body.removeChild(link)
    sub.unsubscribe()
  })
})

describe('createRouter — history mode: destroy()', () => {
  it('removes click interceptor and popstate listener', () => {
    history.replaceState(null, '', '/')
    const router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const names: string[] = []
    const sub = router.route$.subscribe(r => names.push(r.name))

    router.destroy()

    // Click should NOT be intercepted after destroy
    const link = document.createElement('a')
    link.href = '/users'
    document.body.appendChild(link)
    link.click()

    // Popstate should NOT trigger after destroy
    history.replaceState(null, '', '/users')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(names).toEqual(['home']) // no new emissions
    document.body.removeChild(link)
    sub.unsubscribe()
    history.replaceState(null, '', '/')
  })
})

describe('createRouter — history mode: withGuard', () => {
  let router: Router<string>

  afterEach(() => {
    router?.destroy()
    history.replaceState(null, '', '/')
  })

  it('guards work with history mode', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users', 'user-detail'], () => of(false), denied),
    ).subscribe(r => seen.push(r.name))

    router.navigate('/users')

    expect(seen).toEqual(['home'])
    expect(denied).toHaveBeenCalledOnce()
    sub.unsubscribe()
  })

  it('allows navigation when guard returns true', () => {
    history.replaceState(null, '', '/')
    router = createRouter(HISTORY_ROUTES, { mode: 'history' })
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users'], () => of(true), denied),
    ).subscribe(r => seen.push(r.name))

    router.navigate('/users')

    expect(seen).toEqual(['home', 'users'])
    expect(denied).not.toHaveBeenCalled()
    sub.unsubscribe()
  })
})

// ===========================================================================
// withScrollReset
// ===========================================================================

describe('withScrollReset', () => {
  beforeEach(() => {
    window.location.hash = '#/'
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls scrollTo on each route emission', () => {
    const router = createRouter(ROUTES)
    const seen: string[] = []

    const sub = router.route$.pipe(
      withScrollReset(),
    ).subscribe(r => seen.push(r.name))

    setHash('#/users')
    setHash('#/users/5')

    expect(seen).toEqual(['home', 'users', 'user-detail'])
    expect(window.scrollTo).toHaveBeenCalledTimes(3)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })
    sub.unsubscribe()
  })

  it('passes through RouteMatch unchanged', () => {
    window.location.hash = '#/users/42'
    const router = createRouter(ROUTES)
    const matches: RouteMatch[] = []

    const sub = router.route$.pipe(
      withScrollReset(),
    ).subscribe(r => matches.push(r))

    expect(matches).toHaveLength(1)
    expect(matches[0].name).toBe('user-detail')
    expect(matches[0].params).toEqual({ id: '42' })
    sub.unsubscribe()
  })

  it('composes with withGuard — denied routes do not scroll', () => {
    const router = createRouter(ROUTES)
    const denied = vi.fn()
    const seen: string[] = []

    const sub = router.route$.pipe(
      withGuard(['users'], () => of(false), denied),
      withScrollReset(),
    ).subscribe(r => seen.push(r.name))

    setHash('#/users')

    // Home scrolled, but denied /users did not
    expect(seen).toEqual(['home'])
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    sub.unsubscribe()
  })
})

// ===========================================================================
// lazy
// ===========================================================================

describe('lazy', () => {
  it('emits the resolved value and completes', async () => {
    const result$ = lazy(() => Promise.resolve({ hello: 'world' }))
    const values: { hello: string }[] = []
    let completed = false

    await new Promise<void>((resolve) => {
      result$.subscribe({
        next: (v) => values.push(v),
        complete: () => { completed = true; resolve() },
      })
    })

    expect(values).toEqual([{ hello: 'world' }])
    expect(completed).toBe(true)
  })

  it('is cold — loader is not called until subscribe', () => {
    const loader = vi.fn(() => Promise.resolve(42))
    const result$ = lazy(loader)

    expect(loader).not.toHaveBeenCalled()

    const sub = result$.subscribe(() => {})
    expect(loader).toHaveBeenCalledOnce()
    sub.unsubscribe()
  })

  it('propagates loader errors', async () => {
    const result$ = lazy(() => Promise.reject(new Error('load failed')))
    let errorMsg = ''

    await new Promise<void>((resolve) => {
      result$.subscribe({
        error: (e) => { errorMsg = e.message; resolve() },
      })
    })

    expect(errorMsg).toBe('load failed')
  })
})
