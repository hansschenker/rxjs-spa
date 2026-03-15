import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export const text$ = <T>(source$: Observable<T>, toText: (v: T) => string = (v) => {
  if (v == null) return ''
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}) => source$.pipe(map(toText))

export const pick$ = <T, K extends keyof T>(key: K) =>
  (source$: Observable<T>) => source$.pipe(map(v => v?.[key]))

export const pick2$ = <T, K1 extends keyof T, K2 extends keyof NonNullable<T[K1]>>(k1: K1, k2: K2) =>
  (source$: Observable<T>) => source$.pipe(map(v => (v?.[k1] as any)?.[k2]))