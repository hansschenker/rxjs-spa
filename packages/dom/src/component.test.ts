import { describe, it, expect, vi } from 'vitest'
import { BehaviorSubject, Observable, Subscription } from 'rxjs'
import { map } from 'rxjs/operators'
import { defineComponent } from './component'
import { html, list } from './template'
import type { TemplateResult } from './template'

// Helper: mount a TemplateResult into a container
function mount(result: TemplateResult): { container: HTMLDivElement; sub: Subscription } {
  const container = document.createElement('div')
  container.appendChild(result.fragment)
  return { container, sub: result.sub }
}

// Helper: flush microtasks (queueMicrotask runs after current synchronous code)
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('defineComponent', () => {
  it('returns a callable that produces a TemplateResult', () => {
    const MyComponent = defineComponent<{}>((_, __) => html`<p>hello</p>`)
    const result = MyComponent({})
    expect(result.fragment).toBeInstanceOf(DocumentFragment)
    expect(result.sub).toBeInstanceOf(Subscription)
    result.sub.unsubscribe()
  })

  it('renders DOM correctly', () => {
    const MyComponent = defineComponent<{}>(() => html`<div class="card"><span>content</span></div>`)
    const { container, sub } = mount(MyComponent({}))

    expect(container.querySelector('.card')).not.toBeNull()
    expect(container.querySelector('span')!.textContent).toBe('content')
    sub.unsubscribe()
  })

  it('supports reactive props via Observable', () => {
    interface Props { name$: Observable<string> }

    const Greeting = defineComponent<Props>((props) =>
      html`<h1>${props.name$}</h1>`,
    )

    const name$ = new BehaviorSubject('Alice')
    const { container, sub } = mount(Greeting({ name$ }))

    expect(container.querySelector('h1')!.textContent).toBe('Alice')
    name$.next('Bob')
    expect(container.querySelector('h1')!.textContent).toBe('Bob')
    sub.unsubscribe()
  })

  it('fires onMount callback after microtask', async () => {
    const mounted = vi.fn()

    const MyComponent = defineComponent<{}>((_, { onMount }) => {
      onMount(mounted)
      return html`<p>test</p>`
    })

    const { sub } = mount(MyComponent({}))
    // Not yet called synchronously
    expect(mounted).not.toHaveBeenCalled()

    await flushMicrotasks()
    expect(mounted).toHaveBeenCalledOnce()
    sub.unsubscribe()
  })

  it('calls onMount cleanup on destroy', async () => {
    const cleanup = vi.fn()

    const MyComponent = defineComponent<{}>((_, { onMount }) => {
      onMount(() => cleanup)
      return html`<p>test</p>`
    })

    const { sub } = mount(MyComponent({}))
    await flushMicrotasks()

    expect(cleanup).not.toHaveBeenCalled()
    sub.unsubscribe()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('fires onDestroy callback when unsubscribed', () => {
    const destroyed = vi.fn()

    const MyComponent = defineComponent<{}>((_, { onDestroy }) => {
      onDestroy(destroyed)
      return html`<p>test</p>`
    })

    const { sub } = mount(MyComponent({}))
    expect(destroyed).not.toHaveBeenCalled()

    sub.unsubscribe()
    expect(destroyed).toHaveBeenCalledOnce()
  })

  it('supports multiple lifecycle hooks', async () => {
    const calls: string[] = []

    const MyComponent = defineComponent<{}>((_, { onMount, onDestroy }) => {
      onMount(() => { calls.push('mount1') })
      onMount(() => { calls.push('mount2'); return () => calls.push('cleanup2') })
      onDestroy(() => calls.push('destroy1'))
      onDestroy(() => calls.push('destroy2'))
      return html`<p>test</p>`
    })

    const { sub } = mount(MyComponent({}))
    await flushMicrotasks()

    expect(calls).toEqual(['mount1', 'mount2'])

    sub.unsubscribe()
    expect(calls).toContain('destroy1')
    expect(calls).toContain('destroy2')
    expect(calls).toContain('cleanup2')
  })

  it('embeds in html template', () => {
    const Child = defineComponent<{}>(() => html`<span>child</span>`)
    const result = html`<div>${Child({})}</div>`
    const { container, sub } = mount(result)

    expect(container.querySelector('span')!.textContent).toBe('child')
    sub.unsubscribe()
  })

  it('works with list()', () => {
    interface Item { id: string; name: string }

    const ItemComponent = defineComponent<{ item$: Observable<Item> }>((props) =>
      html`<li>${props.item$.pipe(map(i => i.name))}</li>`,
    )

    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => ItemComponent({ item$ }),
    )}</ul>`
    const { container, sub } = mount(result)

    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0].textContent).toBe('Alice')
    expect(lis[1].textContent).toBe('Bob')

    // Update
    items$.next([
      { id: '1', name: 'Alice Updated' },
      { id: '2', name: 'Bob' },
    ])
    expect(container.querySelectorAll('li')[0].textContent).toBe('Alice Updated')

    sub.unsubscribe()
  })

  it('tears down component subscriptions when removed from list', async () => {
    interface Item { id: string; name: string }
    const destroyed: string[] = []

    const ItemComponent = defineComponent<{ item$: Observable<Item>; key: string }>(
      (props, { onDestroy }) => {
        onDestroy(() => destroyed.push(props.key))
        return html`<li>${props.item$.pipe(map(i => i.name))}</li>`
      },
    )

    const items$ = new BehaviorSubject<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])

    const result = html`<ul>${list(
      items$,
      i => i.id,
      (item$, key) => ItemComponent({ item$, key }),
    )}</ul>`
    const { container, sub } = mount(result)

    await flushMicrotasks()

    // Remove Bob
    items$.next([{ id: '1', name: 'Alice' }])
    expect(destroyed).toContain('2')
    expect(container.querySelectorAll('li').length).toBe(1)

    sub.unsubscribe()
  })

  it('supports nested components', () => {
    const Inner = defineComponent<{ text$: Observable<string> }>((props) =>
      html`<span>${props.text$}</span>`,
    )

    const Outer = defineComponent<{ text$: Observable<string> }>((props) =>
      html`<div>${Inner({ text$: props.text$ })}</div>`,
    )

    const text$ = new BehaviorSubject('hello')
    const { container, sub } = mount(Outer({ text$ }))

    expect(container.querySelector('span')!.textContent).toBe('hello')
    text$.next('world')
    expect(container.querySelector('span')!.textContent).toBe('world')
    sub.unsubscribe()
  })

  it('does not call onMount if component is destroyed before microtask', async () => {
    const mounted = vi.fn()

    const MyComponent = defineComponent<{}>((_, { onMount }) => {
      onMount(mounted)
      return html`<p>test</p>`
    })

    const result = MyComponent({})
    result.sub.unsubscribe() // destroy immediately before microtask fires

    await flushMicrotasks()
    expect(mounted).not.toHaveBeenCalled()
  })

  it('cleans up all template subscriptions on destroy', () => {
    const value$ = new BehaviorSubject('initial')

    const MyComponent = defineComponent<{}>(() =>
      html`<p>${value$}</p>`,
    )

    const { container, sub } = mount(MyComponent({}))
    expect(container.querySelector('p')!.textContent).toBe('initial')

    sub.unsubscribe()
    value$.next('updated')
    // Should not have changed after unsubscribe
    expect(container.querySelector('p')!.textContent).toBe('initial')
  })
})
