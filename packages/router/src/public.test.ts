import { describe, it, expect } from 'vitest'
import { Subject, take } from 'rxjs'
import { remember } from './public'

describe('remember', () => {
  it('replays the latest value to late subscribers', () => {
    const s = new Subject<number>()
    const shared$ = s.pipe(remember())

    const a: number[] = []
    const b: number[] = []

    // subscriber A consumes two values then unsubscribes
    shared$.pipe(take(2)).subscribe(v => a.push(v))
    s.next(1)
    s.next(2)

    // late subscriber should immediately get latest (2)
    shared$.pipe(take(1)).subscribe(v => b.push(v))

    // end the source to avoid dangling subscriptions in tests
    s.complete()

    expect(a).toEqual([1, 2])
    expect(b).toEqual([2])
  })
})
