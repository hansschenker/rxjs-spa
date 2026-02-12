import { describe, it, expect } from 'vitest'
import { Subject, map, Subscription } from 'rxjs'
import {
  attr,
  classToggle,
  dispatch,
  events,
  mount,
  prop,
  renderKeyedComponents,
  renderKeyedList,
  renderList,
  text,
} from './public'

describe('@rxjs-spa/dom sinks', () => {
  it('text() writes incoming values to textContent', () => {
    const el = document.createElement('span')
    const s = new Subject<number>()

    const sub = text(el)(s)
    s.next(1)
    s.next(2)
    expect(el.textContent).toBe('2')

    sub.unsubscribe()
    s.next(3)
    expect(el.textContent).toBe('2')
  })

  it('attr() sets/removes attributes', () => {
    const el = document.createElement('a')
    const s = new Subject<string | null>()

    const sub = attr(el, 'href')(s)
    s.next('https://example.com')
    expect(el.getAttribute('href')).toBe('https://example.com')

    s.next(null)
    expect(el.hasAttribute('href')).toBe(false)

    sub.unsubscribe()
  })

  it('classToggle() toggles a class', () => {
    const el = document.createElement('div')
    const s = new Subject<boolean>()

    const sub = classToggle(el, 'active')(s)
    s.next(true)
    expect(el.classList.contains('active')).toBe(true)

    s.next(false)
    expect(el.classList.contains('active')).toBe(false)

    sub.unsubscribe()
  })

  it('prop() writes to DOM properties (e.g. input.value)', () => {
    const input = document.createElement('input')
    const s = new Subject<string>()

    const sub = prop(input, 'value')(s)
    s.next('hello')
    expect(input.value).toBe('hello')

    sub.unsubscribe()
  })

  it('renderList() keeps container children in sync by key', () => {
    const ul = document.createElement('ul')
    const s = new Subject<readonly string[]>()

    const sub = renderList(
      ul,
      (item) => item,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item
        return li
      },
    )(s)

    s.next(['a', 'b', 'c'])
    expect([...ul.querySelectorAll('li')].map((x) => x.textContent)).toEqual(['a', 'b', 'c'])

    s.next(['c', 'a', 'd'])
    expect([...ul.querySelectorAll('li')].map((x) => x.textContent)).toEqual(['c', 'a', 'd'])

    sub.unsubscribe()
  })

  it('renderKeyedList() unsubscribes per-item subscriptions when items are removed', () => {
    type Item = { id: string; label: string }
    const ul = document.createElement('ul')
    const items$ = new Subject<readonly Item[]>()

    const disposed: string[] = []

    const sub = renderKeyedList<Item>(
      ul,
      (x) => x.id,
      (x) => {
        const li = document.createElement('li')
        li.textContent = x.label
        return { node: li, sub: () => disposed.push(x.id) }
      },
    )(items$)

    items$.next([{ id: 'a', label: 'A' }])
    items$.next([])
    expect(disposed).toEqual(['a'])

    sub.unsubscribe()
  })

  it('renderKeyedComponents() updates item$ without recreating internal streams', () => {
    type Item = { id: string; label: string }
    type Action = { type: 'remove'; id: string }

    const ul = document.createElement('ul')
    const items$ = new Subject<readonly Item[]>()
    const actions$ = new Subject<Action>()

    const created: string[] = []
    const removed: string[] = []

    actions$.subscribe((a) => removed.push(a.id))

    const sub = renderKeyedComponents<Item, Action>(
      ul,
      (x) => x.id,
      (item$, { dispatch }, id) => {
        created.push(id)

        const li = document.createElement('li')
        const label = document.createElement('span')
        const remove = document.createElement('button')
        remove.textContent = 'remove'
        li.append(label, remove)

        // render label from item$ (this subscription must stay alive across updates)
        const s = new Subscription()
        s.add(text(label)(item$.pipe(map((x) => x.label))))

        // internal event stream: remove button -> dispatch
        const remove$ = events<MouseEvent>(remove, 'click').pipe(map(() => ({ type: 'remove' as const, id })))
        s.add(dispatch({ next: dispatch })(remove$))

        return { node: li, sub: s }
      },
      actions$,
    )(items$)

    // create component
    items$.next([{ id: 'a', label: 'A1' }])
    expect(created).toEqual(['a'])
    expect((ul.querySelector('span') as HTMLSpanElement).textContent).toBe('A1')

    // update same key -> should not create again, but label should change
    items$.next([{ id: 'a', label: 'A2' }])
    expect(created).toEqual(['a'])
    expect((ul.querySelector('span') as HTMLSpanElement).textContent).toBe('A2')

    // internal event stream still works
    ;(ul.querySelector('button') as HTMLButtonElement).click()
    expect(removed).toEqual(['a'])

    // remove item -> unsubscribes + removes node
    items$.next([])
    expect(ul.querySelector('li')).toBeNull()

    sub.unsubscribe()
  })

  it('mount() composes multiple sinks into one view Subscription', () => {
    const root = document.createElement('div')
    const a = document.createElement('span')
    const b = document.createElement('span')
    root.append(a, b)

    const a$ = new Subject<number>()
    const b$ = new Subject<number>()

    const view = mount(root, () => [
      text(a)(a$),
      text(b)(b$),
      () => root.setAttribute('data-unmounted', 'yes'),
    ])

    a$.next(1)
    b$.next(2)
    expect(a.textContent).toBe('1')
    expect(b.textContent).toBe('2')

    view.unsubscribe()
    expect(root.getAttribute('data-unmounted')).toBe('yes')
  })
})
