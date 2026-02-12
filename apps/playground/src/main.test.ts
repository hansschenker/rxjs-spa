import { describe, it, expect } from 'vitest'
import { map, scan, startWith } from 'rxjs'
import { remember } from '@rxjs-spa/core'
import { events, text } from '@rxjs-spa/dom'

describe('playground counter pipeline', () => {
  it('accumulates increments and renders', () => {
    const button = document.createElement('button')
    const out = document.createElement('span')

    const click$ = events<MouseEvent>(button, 'click').pipe(map(() => 1))
    const count$ = click$.pipe(
      startWith(0),
      scan((acc, n) => acc + n, 0),
      remember(),
    )

    const sub = text(out)(count$)

    button.click()
    button.click()
    expect(out.textContent).toBe('2')

    sub.unsubscribe()
  })
})
