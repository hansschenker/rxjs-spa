import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import { Subscription } from 'rxjs'
import {
  fadeIn,
  fadeOut,
  slideIn,
  slideOut,
  scaleIn,
  scaleOut,
  webAnimate,
  cssTransition,
  cssKeyframes,
  waitForTransition,
  waitForAnimation,
  findFirstElement,
} from './animation'
import type { AnimateFn, AnimationConfig } from './animation'
import { html, when, list } from './template'
import type { TemplateResult } from './template'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountTemplate(result: TemplateResult): { container: HTMLDivElement; sub: Subscription } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  container.appendChild(result.fragment)
  return { container, sub: result.sub }
}

function cleanup(container: HTMLDivElement, sub: Subscription) {
  sub.unsubscribe()
  container.remove()
}

/** Create a mock AnimateFn that resolves after calling a callback. */
function createMockAnimateFn(): { fn: AnimateFn; calls: Element[]; resolve: () => void } {
  const calls: Element[] = []
  let resolveFn: (() => void) | null = null

  const fn: AnimateFn = (el: Element) => {
    calls.push(el)
    return new Promise<void>((resolve) => {
      resolveFn = resolve
    })
  }

  return {
    fn,
    calls,
    resolve: () => {
      if (resolveFn) resolveFn()
    },
  }
}

/** Create a mock AnimateFn that resolves immediately. */
function createInstantAnimateFn(): { fn: AnimateFn; calls: Element[] } {
  const calls: Element[] = []
  const fn: AnimateFn = (el: Element) => {
    calls.push(el)
    return Promise.resolve()
  }
  return { fn, calls }
}

// ---------------------------------------------------------------------------
// findFirstElement
// ---------------------------------------------------------------------------

describe('findFirstElement', () => {
  it('returns first Element node', () => {
    const text = document.createTextNode('hello')
    const el = document.createElement('div')
    expect(findFirstElement([text, el])).toBe(el)
  })

  it('returns null when no Element nodes', () => {
    const text = document.createTextNode('hello')
    expect(findFirstElement([text])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(findFirstElement([])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// webAnimate factory
// ---------------------------------------------------------------------------

describe('webAnimate', () => {
  it('calls el.animate() with keyframes and options', async () => {
    const el = document.createElement('div')
    let finishCb: (() => void) | null = null
    const mockAnimation = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
    }
    el.animate = vi.fn().mockReturnValue(mockAnimation)

    const animFn = webAnimate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 300 },
    )

    const promise = animFn(el)

    expect(el.animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 300 },
    )

    // Simulate animation finish
    mockAnimation.onfinish!()
    await promise
  })

  it('resolves on cancel', async () => {
    const el = document.createElement('div')
    const mockAnimation = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
    }
    el.animate = vi.fn().mockReturnValue(mockAnimation)

    const animFn = webAnimate([{ opacity: 0 }, { opacity: 1 }])
    const promise = animFn(el)

    mockAnimation.oncancel!()
    await promise
  })
})

// ---------------------------------------------------------------------------
// cssTransition factory
// ---------------------------------------------------------------------------

describe('cssTransition', () => {
  it('applies from class, then swaps to active class', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    const animFn = cssTransition({
      from: 'fade-from',
      active: 'fade-active',
      duration: 100,
    })

    const promise = animFn(el)

    // After calling, from class should have been added and removed,
    // active class should be present
    expect(el.classList.contains('fade-active')).toBe(true)
    expect(el.classList.contains('fade-from')).toBe(false)

    // Simulate transitionend
    el.dispatchEvent(new Event('transitionend'))

    return promise.then(() => {
      expect(el.classList.contains('fade-active')).toBe(false)
      el.remove()
    })
  })

  it('applies to class after transition completes', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    const animFn = cssTransition({
      from: 'enter-from',
      active: 'enter-active',
      to: 'entered',
      duration: 100,
    })

    const promise = animFn(el)
    el.dispatchEvent(new Event('transitionend'))

    await promise
    expect(el.classList.contains('entered')).toBe(true)
    expect(el.classList.contains('enter-active')).toBe(false)
    el.remove()
  })

  it('resolves on timeout if no transitionend fires', async () => {
    vi.useFakeTimers()
    const el = document.createElement('div')

    const animFn = cssTransition({
      from: 'fade-from',
      active: 'fade-active',
      duration: 50,
    })

    const promise = animFn(el)
    vi.advanceTimersByTime(50)
    await promise

    expect(el.classList.contains('fade-active')).toBe(false)
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// cssKeyframes factory
// ---------------------------------------------------------------------------

describe('cssKeyframes', () => {
  it('adds class and removes after animationend', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    const animFn = cssKeyframes('bounce-in', 100)
    const promise = animFn(el)

    expect(el.classList.contains('bounce-in')).toBe(true)

    el.dispatchEvent(new Event('animationend'))
    await promise

    expect(el.classList.contains('bounce-in')).toBe(false)
    el.remove()
  })

  it('resolves on timeout if no animationend fires', async () => {
    vi.useFakeTimers()
    const el = document.createElement('div')

    const animFn = cssKeyframes('spin', 50)
    const promise = animFn(el)

    expect(el.classList.contains('spin')).toBe(true)
    vi.advanceTimersByTime(50)
    await promise

    expect(el.classList.contains('spin')).toBe(false)
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// waitForTransition / waitForAnimation
// ---------------------------------------------------------------------------

describe('waitForTransition', () => {
  it('resolves on transitionend', async () => {
    const el = document.createElement('div')
    const promise = waitForTransition(el, 1000)
    el.dispatchEvent(new Event('transitionend'))
    await promise
  })

  it('resolves on timeout', async () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    const promise = waitForTransition(el, 50)
    vi.advanceTimersByTime(50)
    await promise
    vi.useRealTimers()
  })
})

describe('waitForAnimation', () => {
  it('resolves on animationend', async () => {
    const el = document.createElement('div')
    const promise = waitForAnimation(el, 1000)
    el.dispatchEvent(new Event('animationend'))
    await promise
  })

  it('resolves on timeout', async () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    const promise = waitForAnimation(el, 50)
    vi.advanceTimersByTime(50)
    await promise
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// Built-in presets (verify they produce AnimateFns)
// ---------------------------------------------------------------------------

describe('built-in presets', () => {
  function mockAnimate(el: Element) {
    const mockAnimation = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
    }
    el.animate = vi.fn().mockReturnValue(mockAnimation)
    return mockAnimation
  }

  it('fadeIn calls animate with opacity 0→1', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)
    const promise = fadeIn(200)(el)

    expect(el.animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    )
    mock.onfinish!()
    await promise
  })

  it('fadeOut calls animate with opacity 1→0', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)
    const promise = fadeOut(200)(el)

    expect(el.animate).toHaveBeenCalledWith(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    )
    mock.onfinish!()
    await promise
  })

  it('slideIn calls animate with translate', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)
    const promise = slideIn('right', 250)(el)

    expect(el.animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: 'translate(20px, 0)' },
        { opacity: 1, transform: 'translate(0, 0)' },
      ],
      { duration: 250, easing: 'ease-out', fill: 'forwards' },
    )
    mock.onfinish!()
    await promise
  })

  it('slideOut calls animate with translate', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)
    const promise = slideOut('down', 250)(el)

    expect(el.animate).toHaveBeenCalledWith(
      [
        { opacity: 1, transform: 'translate(0, 0)' },
        { opacity: 0, transform: 'translate(0, 20px)' },
      ],
      { duration: 250, easing: 'ease-in', fill: 'forwards' },
    )
    mock.onfinish!()
    await promise
  })

  it('scaleIn calls animate with scale 0.8→1', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)
    const promise = scaleIn(150)(el)

    expect(el.animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: 'scale(0.8)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 150, easing: 'ease-out', fill: 'forwards' },
    )
    mock.onfinish!()
    await promise
  })

  it('scaleOut calls animate with scale 1→0.8', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)
    const promise = scaleOut(150)(el)

    expect(el.animate).toHaveBeenCalledWith(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.8)' },
      ],
      { duration: 150, easing: 'ease-in', fill: 'forwards' },
    )
    mock.onfinish!()
    await promise
  })

  it('presets use default durations', async () => {
    const el = document.createElement('div')
    const mock = mockAnimate(el)

    fadeIn()(el)
    expect((el.animate as any).mock.calls[0][1].duration).toBe(300)
    mock.onfinish!()

    const mock2 = mockAnimate(el)
    slideIn()(el)
    expect((el.animate as any).mock.calls[0][1].duration).toBe(300)
    mock2.onfinish!()
  })
})

// ---------------------------------------------------------------------------
// Integration: when() with animation
// ---------------------------------------------------------------------------

describe('when() with animation', () => {
  it('runs enter animation on show', async () => {
    const show$ = new BehaviorSubject(false)
    const enter = createInstantAnimateFn()

    const result = html`<div>${when(
      show$,
      () => html`<p class="content">Hello</p>`,
      undefined,
      { enter: enter.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    expect(container.querySelector('.content')).toBeNull()

    show$.next(true)
    expect(container.querySelector('.content')).not.toBeNull()
    expect(enter.calls.length).toBe(1)
    expect(enter.calls[0].tagName).toBe('P')

    cleanup(container, sub)
  })

  it('runs leave animation before removing nodes', async () => {
    const show$ = new BehaviorSubject(true)
    const leave = createMockAnimateFn()

    const result = html`<div>${when(
      show$,
      () => html`<p class="content">Hello</p>`,
      undefined,
      { leave: leave.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    expect(container.querySelector('.content')).not.toBeNull()

    show$.next(false)

    // Leave animation started but not resolved — node still in DOM
    expect(leave.calls.length).toBe(1)
    expect(container.querySelector('.content')).not.toBeNull()

    // Resolve the leave animation
    leave.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // Now the node should be removed
    expect(container.querySelector('.content')).toBeNull()

    cleanup(container, sub)
  })

  it('cancels leave animation on rapid toggle', async () => {
    const show$ = new BehaviorSubject(true)
    const enter = createInstantAnimateFn()
    const leave = createMockAnimateFn()

    const result = html`<div>${when(
      show$,
      () => html`<p class="content">Hello</p>`,
      undefined,
      { enter: enter.fn, leave: leave.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    // Show → hide (starts leave animation)
    show$.next(false)
    expect(leave.calls.length).toBe(1)

    // Hide → show again before leave resolves (should cancel leave)
    show$.next(true)
    expect(container.querySelector('.content')).not.toBeNull()

    // Resolve the old leave — should be a no-op since it was aborted
    leave.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // Content should still be present
    expect(container.querySelector('.content')).not.toBeNull()

    cleanup(container, sub)
  })

  it('works without animation (backward compat)', () => {
    const show$ = new BehaviorSubject(true)
    const result = html`<div>${when(
      show$,
      () => html`<p class="content">Hello</p>`,
    )}</div>`
    const { container, sub } = mountTemplate(result)

    expect(container.querySelector('.content')).not.toBeNull()
    show$.next(false)
    expect(container.querySelector('.content')).toBeNull()

    cleanup(container, sub)
  })

  it('both enter and leave work together', async () => {
    const show$ = new BehaviorSubject(false)
    const enter = createInstantAnimateFn()
    const leave = createInstantAnimateFn()

    const result = html`<div>${when(
      show$,
      () => html`<p class="content">Hello</p>`,
      undefined,
      { enter: enter.fn, leave: leave.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    // Show
    show$.next(true)
    expect(enter.calls.length).toBe(1)
    expect(container.querySelector('.content')).not.toBeNull()

    // Hide
    show$.next(false)
    expect(leave.calls.length).toBe(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('.content')).toBeNull()

    // Show again
    show$.next(true)
    expect(enter.calls.length).toBe(2)
    expect(container.querySelector('.content')).not.toBeNull()

    cleanup(container, sub)
  })
})

// ---------------------------------------------------------------------------
// Integration: list() with animation
// ---------------------------------------------------------------------------

describe('list() with animation', () => {
  it('runs enter animation on new items', () => {
    const items$ = new BehaviorSubject<string[]>([])
    const enter = createInstantAnimateFn()

    const result = html`<div>${list(
      items$,
      (item) => item,
      (item$) => html`<p>${item$}</p>`,
      { enter: enter.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    items$.next(['a', 'b'])
    expect(enter.calls.length).toBe(2)
    expect(container.querySelectorAll('p').length).toBe(2)

    // Add one more
    items$.next(['a', 'b', 'c'])
    expect(enter.calls.length).toBe(3)

    cleanup(container, sub)
  })

  it('runs leave animation before removing items', async () => {
    const items$ = new BehaviorSubject(['a', 'b', 'c'])
    const leave = createMockAnimateFn()

    const result = html`<div>${list(
      items$,
      (item) => item,
      (item$) => html`<p>${item$}</p>`,
      { leave: leave.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    expect(container.querySelectorAll('p').length).toBe(3)

    // Remove 'b'
    items$.next(['a', 'c'])

    // Leave started but not resolved — node might still be in DOM
    expect(leave.calls.length).toBe(1)

    // Resolve leave
    leave.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // After leave, the node for 'b' should be removed
    // But since the container reorders on each emission, we check total active items
    expect(container.querySelectorAll('p').length).toBe(2)

    cleanup(container, sub)
  })

  it('cancels leave if item re-appears', async () => {
    const items$ = new BehaviorSubject(['a', 'b'])
    const leave = createMockAnimateFn()

    const result = html`<div>${list(
      items$,
      (item) => item,
      (item$) => html`<p>${item$}</p>`,
      { leave: leave.fn },
    )}</div>`
    const { container, sub } = mountTemplate(result)

    // Remove 'b' — starts leave animation
    items$.next(['a'])
    expect(leave.calls.length).toBe(1)

    // Re-add 'b' before leave resolves
    items$.next(['a', 'b'])

    // Resolve the old leave — should be aborted / no-op
    leave.resolve()
    await new Promise((r) => setTimeout(r, 0))

    expect(container.querySelectorAll('p').length).toBe(2)

    cleanup(container, sub)
  })

  it('works without animation (backward compat)', () => {
    const items$ = new BehaviorSubject(['a', 'b'])

    const result = html`<div>${list(
      items$,
      (item) => item,
      (item$) => html`<p>${item$}</p>`,
    )}</div>`
    const { container, sub } = mountTemplate(result)

    expect(container.querySelectorAll('p').length).toBe(2)

    items$.next(['a'])
    expect(container.querySelectorAll('p').length).toBe(1)

    cleanup(container, sub)
  })
})

// ---------------------------------------------------------------------------
// Integration: createOutlet with animation
// ---------------------------------------------------------------------------

describe('createOutlet with animation', () => {
  // Import createOutlet dynamically since it's in the router package
  // We test the outlet animation indirectly via the when/list integration
  // since createOutlet lives in @rxjs-spa/router

  it('outlet animation config is accepted by createOutlet', async () => {
    // This is a structural test to verify the types work
    const { createOutlet } = await import('../../router/src/public')

    const route$ = new BehaviorSubject({
      name: 'home' as const,
      params: {},
      query: {},
      path: '/',
      matched: [{ name: 'home' as const, params: {}, path: '/' }],
    })

    const el = document.createElement('div')
    document.body.appendChild(el)

    const enter = createInstantAnimateFn()

    const outlet = createOutlet(el, route$, {
      enter: enter.fn,
    })

    const outletSub = outlet.subscribe((match) => {
      el.innerHTML = `<p>${match.name}</p>`
      return new Subscription()
    })

    // First emission happens synchronously
    expect(el.innerHTML).toBe('<p>home</p>')
    // Enter animation should have run
    expect(enter.calls.length).toBe(1)

    outletSub.unsubscribe()
    el.remove()
  })

  it('outlet runs leave animation before clearing', async () => {
    const { createOutlet } = await import('../../router/src/public')

    const route$ = new Subject<{
      name: string
      params: Record<string, string>
      query: Record<string, string>
      path: string
      matched: Array<{ name: string; params: Record<string, string>; path: string }>
    }>()

    const el = document.createElement('div')
    document.body.appendChild(el)

    const leave = createMockAnimateFn()

    const outlet = createOutlet(el, route$, { leave: leave.fn })

    const outletSub = outlet.subscribe((match) => {
      el.innerHTML = `<p>${match.name}</p>`
      return new Subscription()
    })

    // First route
    route$.next({
      name: 'home',
      params: {},
      query: {},
      path: '/',
      matched: [{ name: 'home', params: {}, path: '/' }],
    })
    expect(el.innerHTML).toBe('<p>home</p>')

    // Second route — leave animation should start
    route$.next({
      name: 'about',
      params: {},
      query: {},
      path: '/about',
      matched: [{ name: 'about', params: {}, path: '/about' }],
    })

    // Leave was called on the old content
    expect(leave.calls.length).toBe(1)
    // Old content still visible during animation
    expect(el.innerHTML).toBe('<p>home</p>')

    // Resolve leave
    leave.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // Now new content should be rendered
    expect(el.innerHTML).toBe('<p>about</p>')

    outletSub.unsubscribe()
    el.remove()
  })
})
