import { describe, it, expect, afterEach } from 'vitest'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import { html, when, list, unsafeHtml } from './template'
import type { TemplateResult } from './template'
import { Subscription } from 'rxjs'

// Helper: mount a TemplateResult into a container and return both
function mount(result: TemplateResult): { container: HTMLDivElement; sub: Subscription } {
  const container = document.createElement('div')
  container.appendChild(result.fragment)
  return { container, sub: result.sub }
}

describe('html tagged template — static rendering', () => {
  it('creates a simple element', () => {
    const result = html`<p>Hello</p>`
    const { container, sub } = mount(result)
    expect(container.innerHTML).toBe('<p>Hello</p>')
    sub.unsubscribe()
  })

  it('creates nested elements', () => {
    const result = html`<div><span>inner</span></div>`
    const { container, sub } = mount(result)
    expect(container.querySelector('span')!.textContent).toBe('inner')
    sub.unsubscribe()
  })

  it('creates multiple root elements', () => {
    const result = html`<p>one</p><p>two</p>`
    const { container, sub } = mount(result)
    expect(container.querySelectorAll('p').length).toBe(2)
    sub.unsubscribe()
  })
})

describe('html tagged template — text interpolation', () => {
  it('interpolates a static string', () => {
    const result = html`<p>${'world'}</p>`
    const { container, sub } = mount(result)
    expect(container.querySelector('p')!.textContent).toBe('world')
    sub.unsubscribe()
  })

  it('interpolates a static number', () => {
    const result = html`<span>${42}</span>`
    const { container, sub } = mount(result)
    expect(container.querySelector('span')!.textContent).toBe('42')
    sub.unsubscribe()
  })

  it('is safe against XSS — text interpolation uses textContent, not innerHTML', () => {
    const result = html`<p>${'<script>alert("xss")</script>'}</p>`
    const { container, sub } = mount(result)
    // textContent returns raw text (browser inherently safe)
    expect(container.querySelector('p')!.textContent).toBe('<script>alert("xss")</script>')
    // innerHTML shows the escaped entities (proof it's not parsed as HTML)
    expect(container.innerHTML).toContain('&lt;script&gt;')
    expect(container.querySelector('script')).toBeNull()
    sub.unsubscribe()
  })

  it('subscribes to an Observable and updates text', () => {
    const subject = new BehaviorSubject('initial')
    const result = html`<p>${subject}</p>`
    const { container, sub } = mount(result)

    expect(container.querySelector('p')!.textContent).toBe('initial')

    subject.next('updated')
    expect(container.querySelector('p')!.textContent).toBe('updated')

    sub.unsubscribe()
  })

  it('is safe against XSS — Observable emissions use textContent', () => {
    const subject = new BehaviorSubject('<b>bold</b>')
    const result = html`<p>${subject}</p>`
    const { container, sub } = mount(result)

    // textContent is the raw string
    expect(container.querySelector('p')!.textContent).toBe('<b>bold</b>')
    // innerHTML shows entities — no actual <b> element created
    expect(container.querySelector('b')).toBeNull()
    sub.unsubscribe()
  })

  it('handles multiple interpolations', () => {
    const a$ = new BehaviorSubject('hello')
    const b$ = new BehaviorSubject('world')
    const result = html`<p>${a$} ${b$}</p>`
    const { container, sub } = mount(result)

    expect(container.querySelector('p')!.textContent).toBe('hello world')

    a$.next('hi')
    expect(container.querySelector('p')!.textContent).toBe('hi world')

    sub.unsubscribe()
  })
})

describe('html tagged template — unsafeHtml', () => {
  it('renders raw HTML from static string', () => {
    const result = html`<div>${unsafeHtml('<b>bold</b>')}</div>`
    const { container, sub } = mount(result)
    expect(container.querySelector('b')!.textContent).toBe('bold')
    sub.unsubscribe()
  })

  it('renders raw HTML from Observable', () => {
    const content$ = new BehaviorSubject('<em>italic</em>')
    const result = html`<div>${unsafeHtml(content$)}</div>`
    const { container, sub } = mount(result)
    expect(container.querySelector('em')!.textContent).toBe('italic')

    content$.next('<strong>strong</strong>')
    expect(container.querySelector('strong')!.textContent).toBe('strong')
    sub.unsubscribe()
  })
})

describe('html tagged template — attribute binding', () => {
  it('sets a static attribute', () => {
    const result = html`<a href=${'https://example.com'}>link</a>`
    const { container, sub } = mount(result)
    expect(container.querySelector('a')!.getAttribute('href')).toBe('https://example.com')
    sub.unsubscribe()
  })

  it('reactively updates an attribute', () => {
    const href$ = new BehaviorSubject('/page1')
    const result = html`<a href=${href$}>link</a>`
    const { container, sub } = mount(result)

    expect(container.querySelector('a')!.getAttribute('href')).toBe('/page1')
    href$.next('/page2')
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/page2')
    sub.unsubscribe()
  })

  it('removes attribute when null', () => {
    const title$ = new BehaviorSubject<string | null>('tooltip')
    const result = html`<div title=${title$}>content</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('div')!.getAttribute('title')).toBe('tooltip')
    title$.next(null)
    expect(container.querySelector('div')!.hasAttribute('title')).toBe(false)
    sub.unsubscribe()
  })
})

describe('html tagged template — event binding', () => {
  it('wires an event listener via @event', () => {
    let clicked = false
    const result = html`<button @click=${() => { clicked = true }}>Click</button>`
    const { container, sub } = mount(result)

    container.querySelector('button')!.click()
    expect(clicked).toBe(true)
    sub.unsubscribe()
  })

  it('removes event listener on unsubscribe', () => {
    let count = 0
    const result = html`<button @click=${() => { count++ }}>Click</button>`
    const { container, sub } = mount(result)

    container.querySelector('button')!.click()
    expect(count).toBe(1)

    sub.unsubscribe()
    container.querySelector('button')!.click()
    expect(count).toBe(1) // no longer listening
  })

  it('receives the event object', () => {
    let receivedEvent: Event | null = null
    const result = html`<button @click=${(e: Event) => { receivedEvent = e }}>Click</button>`
    const { container, sub } = mount(result)

    container.querySelector('button')!.click()
    expect(receivedEvent).toBeInstanceOf(Event)
    sub.unsubscribe()
  })

  it('supports kebab-case custom event names', () => {
    let fired = false
    const result = html`<div @custom-event=${() => { fired = true }}></div>`
    const { container, sub } = mount(result)

    container.querySelector('div')!.dispatchEvent(new Event('custom-event'))
    expect(fired).toBe(true)
    sub.unsubscribe()
  })
})

describe('html tagged template — property binding', () => {
  it('sets a property with static value', () => {
    const result = html`<input .value=${'hello'} />`
    const { container, sub } = mount(result)
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('hello')
    sub.unsubscribe()
  })

  it('reactively updates a property', () => {
    const value$ = new BehaviorSubject('initial')
    const result = html`<input .value=${value$} />`
    const { container, sub } = mount(result)

    expect((container.querySelector('input') as HTMLInputElement).value).toBe('initial')
    value$.next('updated')
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('updated')
    sub.unsubscribe()
  })

  it('supports property names with dashes (custom element props)', () => {
    const result = html`<div .custom-prop=${'value'}></div>`
    const { container, sub } = mount(result)

    expect((container.querySelector('div') as any)['custom-prop']).toBe('value')
    sub.unsubscribe()
  })
})

describe('html tagged template — boolean attribute', () => {
  it('adds attribute when truthy', () => {
    const result = html`<input ?disabled=${true} />`
    const { container, sub } = mount(result)
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(true)
    sub.unsubscribe()
  })

  it('removes attribute when falsy', () => {
    const result = html`<input ?disabled=${false} />`
    const { container, sub } = mount(result)
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(false)
    sub.unsubscribe()
  })

  it('reactively toggles a boolean attribute', () => {
    const disabled$ = new BehaviorSubject(true)
    const result = html`<input ?disabled=${disabled$} />`
    const { container, sub } = mount(result)

    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(true)
    disabled$.next(false)
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(false)
    disabled$.next(true)
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(true)
    sub.unsubscribe()
  })

  it('supports kebab-case boolean attributes', () => {
    const hidden$ = new BehaviorSubject(true)
    const result = html`<div ?aria-hidden=${hidden$}></div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('div')!.hasAttribute('aria-hidden')).toBe(true)
    hidden$.next(false)
    expect(container.querySelector('div')!.hasAttribute('aria-hidden')).toBe(false)
    sub.unsubscribe()
  })
})

describe('when() — conditional rendering', () => {
  it('shows content when condition is true', () => {
    const show$ = new BehaviorSubject(true)
    const result = html`<div>${when(show$, () => html`<p>visible</p>`)}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('p')!.textContent).toBe('visible')
    sub.unsubscribe()
  })

  it('hides content when condition is false', () => {
    const show$ = new BehaviorSubject(false)
    const result = html`<div>${when(show$, () => html`<p>visible</p>`)}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('p')).toBeNull()
    sub.unsubscribe()
  })

  it('toggles content reactively', () => {
    const show$ = new BehaviorSubject(false)
    const result = html`<div>${when(show$, () => html`<p>visible</p>`)}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('p')).toBeNull()

    show$.next(true)
    expect(container.querySelector('p')!.textContent).toBe('visible')

    show$.next(false)
    expect(container.querySelector('p')).toBeNull()
    sub.unsubscribe()
  })

  it('supports else branch', () => {
    const loggedIn$ = new BehaviorSubject(false)
    const result = html`<div>${when(
      loggedIn$,
      () => html`<p>Welcome!</p>`,
      () => html`<p>Please login</p>`,
    )}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('p')!.textContent).toBe('Please login')

    loggedIn$.next(true)
    expect(container.querySelector('p')!.textContent).toBe('Welcome!')

    loggedIn$.next(false)
    expect(container.querySelector('p')!.textContent).toBe('Please login')
    sub.unsubscribe()
  })

  it('tears down inner subscriptions on toggle', () => {
    const show$ = new BehaviorSubject(true)
    const inner$ = new BehaviorSubject('hello')
    const result = html`<div>${when(
      show$,
      () => html`<span>${inner$}</span>`,
    )}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('span')!.textContent).toBe('hello')

    // Toggle off — should tear down inner
    show$.next(false)
    expect(container.querySelector('span')).toBeNull()

    sub.unsubscribe()
  })
})

describe('list() — keyed list rendering', () => {
  interface Item { id: string; name: string }

  it('renders initial items', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => html`<li>${item$.pipe(map(i => i.name))}</li>`,
    )}</ul>`
    const { container, sub } = mount(result)

    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0].textContent).toBe('Alice')
    expect(lis[1].textContent).toBe('Bob')
    sub.unsubscribe()
  })

  it('updates existing items without recreating nodes', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
    ])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => html`<li>${item$.pipe(map(i => i.name))}</li>`,
    )}</ul>`
    const { container, sub } = mount(result)

    const firstLi = container.querySelector('li')!

    items$.next([{ id: '1', name: 'Alice Updated' }])
    expect(container.querySelector('li')!.textContent).toBe('Alice Updated')
    // Same node reused
    expect(container.querySelector('li')!).toBe(firstLi)
    sub.unsubscribe()
  })

  it('adds new items', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
    ])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => html`<li>${item$.pipe(map(i => i.name))}</li>`,
    )}</ul>`
    const { container, sub } = mount(result)

    items$.next([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[1].textContent).toBe('Bob')
    sub.unsubscribe()
  })

  it('removes disappeared items', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => html`<li>${item$.pipe(map(i => i.name))}</li>`,
    )}</ul>`
    const { container, sub } = mount(result)

    items$.next([{ id: '2', name: 'Bob' }])
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(1)
    expect(lis[0].textContent).toBe('Bob')
    sub.unsubscribe()
  })

  it('handles empty list', () => {
    const items$ = new BehaviorSubject<Item[]>([])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => html`<li>${item$.pipe(map(i => i.name))}</li>`,
    )}</ul>`
    const { container, sub } = mount(result)

    expect(container.querySelectorAll('li').length).toBe(0)
    sub.unsubscribe()
  })

  it('item$ has .snapshot() returning current value', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
    ])

    let capturedSnapshot: Item | null = null

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => {
        capturedSnapshot = item$.snapshot()
        return html`<li>${item$.pipe(map(i => i.name))}</li>`
      },
    )}</ul>`
    const { sub } = mount(result)

    expect(capturedSnapshot).toEqual({ id: '1', name: 'Alice' })
    sub.unsubscribe()
  })

  it('.snapshot() updates when item is updated', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
    ])

    let itemRef: { snapshot(): Item } | null = null

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => {
        itemRef = item$
        return html`<li>${item$.pipe(map(i => i.name))}</li>`
      },
    )}</ul>`
    const { sub } = mount(result)

    expect(itemRef!.snapshot().name).toBe('Alice')

    items$.next([{ id: '1', name: 'Alice Updated' }])
    expect(itemRef!.snapshot().name).toBe('Alice Updated')

    sub.unsubscribe()
  })

  it('.snapshot() works inside event handlers', () => {
    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
    ])

    const dispatched: string[] = []

    const result = html`<div>${list(
      items$,
      i => i.id,
      (item$, key) => html`<button @click=${() => dispatched.push(item$.snapshot().name)}>Go</button>`,
    )}</div>`
    const { container, sub } = mount(result)

    container.querySelector('button')!.click()
    expect(dispatched).toEqual(['Alice'])

    items$.next([{ id: '1', name: 'Bob' }])
    container.querySelector('button')!.click()
    expect(dispatched).toEqual(['Alice', 'Bob'])

    sub.unsubscribe()
  })
})

describe('html tagged template — nested templates', () => {
  it('embeds a child TemplateResult', () => {
    const child = html`<span>child</span>`
    const result = html`<div>${child}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('span')!.textContent).toBe('child')
    sub.unsubscribe()
  })

  it('manages child subscriptions', () => {
    const value$ = new BehaviorSubject('initial')
    const child = html`<span>${value$}</span>`
    const result = html`<div>${child}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('span')!.textContent).toBe('initial')
    value$.next('updated')
    expect(container.querySelector('span')!.textContent).toBe('updated')

    sub.unsubscribe()
  })
})

describe('html tagged template — subscription teardown', () => {
  it('unsubscribes all Observable bindings', () => {
    const text$ = new BehaviorSubject('hello')
    const attr$ = new BehaviorSubject('cls')
    const result = html`<p class=${attr$}>${text$}</p>`
    const { container, sub } = mount(result)

    sub.unsubscribe()

    // Emissions after unsubscribe should not update DOM
    text$.next('bye')
    attr$.next('other')
    expect(container.querySelector('p')!.textContent).toBe('hello')
    expect(container.querySelector('p')!.getAttribute('class')).toBe('cls')
  })
})

describe('html tagged template — template caching', () => {
  it('reuses parsed template for same strings identity', () => {
    function makeTemplate(value: string) {
      return html`<p>${value}</p>`
    }

    const r1 = makeTemplate('one')
    const r2 = makeTemplate('two')
    const { container: c1, sub: s1 } = mount(r1)
    const { container: c2, sub: s2 } = mount(r2)

    expect(c1.querySelector('p')!.textContent).toBe('one')
    expect(c2.querySelector('p')!.textContent).toBe('two')
    s1.unsubscribe()
    s2.unsubscribe()
  })
})
