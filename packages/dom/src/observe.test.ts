import { describe, it, expect } from 'vitest'
import { attrChanges, classChanges, hasClass, textChanges, valueChanges, checkedChanges } from './observe'

// jsdom runs MutationObserver callbacks as microtasks — flush with a Promise tick.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('@rxjs-spa/dom sources', () => {
  it('textChanges emits initial + updates', async () => {
    const el = document.createElement('span')
    el.textContent = 'a'

    const got: string[] = []
    const sub = textChanges(el).subscribe(v => got.push(v))

    el.textContent = 'b'
    await tick()

    expect(got[0]).toBe('a')
    expect(got[got.length - 1]).toBe('b')

    sub.unsubscribe()
  })

  it('attrChanges emits initial + updates', async () => {
    const el = document.createElement('a')
    el.setAttribute('href', 'x')

    const got: Array<string | null> = []
    const sub = attrChanges(el, 'href').subscribe(v => got.push(v))

    el.setAttribute('href', 'y')
    await tick()

    expect(got[0]).toBe('x')
    expect(got[got.length - 1]).toBe('y')

    sub.unsubscribe()
  })

  it('classChanges / hasClass track class membership', async () => {
    const el = document.createElement('div')
    const flags: boolean[] = []
    const sub = hasClass(el, 'active').subscribe(v => flags.push(v))

    el.classList.add('active')
    await tick()
    el.classList.remove('active')
    await tick()

    expect(flags[0]).toBe(false)
    expect(flags.includes(true)).toBe(true)
    expect(flags[flags.length - 1]).toBe(false)

    sub.unsubscribe()
  })

  it('valueChanges emits initial + input events', () => {
    const input = document.createElement('input')
    input.value = 'a'

    const got: string[] = []
    const sub = valueChanges(input).subscribe(v => got.push(v))

    input.value = 'b'
    input.dispatchEvent(new Event('input'))
    expect(got[0]).toBe('a')
    expect(got[got.length - 1]).toBe('b')

    sub.unsubscribe()
  })

  it('checkedChanges emits initial + change events', () => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = false

    const got: boolean[] = []
    const sub = checkedChanges(input).subscribe(v => got.push(v))

    input.checked = true
    input.dispatchEvent(new Event('change'))
    expect(got[0]).toBe(false)
    expect(got[got.length - 1]).toBe(true)

    sub.unsubscribe()
  })
})
