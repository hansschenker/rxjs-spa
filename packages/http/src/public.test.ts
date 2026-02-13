import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { firstValueFrom, of, throwError } from 'rxjs'
import { AjaxError } from 'rxjs/ajax'
import {
  toRemoteData,
  isLoading,
  isSuccess,
  isError,
  idle,
  loading,
  success,
  failure,
} from './public'

describe('RemoteData helpers', () => {
  it('idle / loading / success / failure constructors', () => {
    expect(idle().status).toBe('idle')
    expect(loading().status).toBe('loading')
    expect(success(42).status).toBe('success')
    expect((success(42) as Extract<ReturnType<typeof success>, { status: 'success' }>).data).toBe(42)
    expect(failure('oops').status).toBe('error')
    expect((failure('oops') as Extract<ReturnType<typeof failure>, { status: 'error' }>).error).toBe('oops')
  })

  it('type guards', () => {
    expect(isLoading(loading())).toBe(true)
    expect(isSuccess(success(1))).toBe(true)
    expect(isError(failure('x'))).toBe(true)
    expect(isLoading(success(1))).toBe(false)
  })
})

describe('toRemoteData()', () => {
  it('emits loading then success', async () => {
    const emitted: string[] = []
    const source$ = of(42)

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => emitted.push(rd.status),
        complete: resolve,
      })
    })

    expect(emitted).toEqual(['loading', 'success'])
  })

  it('emits loading then error on failure', async () => {
    const emitted: string[] = []
    const source$ = throwError(() => new Error('boom'))

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => emitted.push(rd.status),
        complete: resolve,
      })
    })

    expect(emitted).toEqual(['loading', 'error'])
  })

  it('error RemoteData carries the message', async () => {
    const source$ = throwError(() => new Error('network failure'))
    const values: Array<{ status: string; error?: string }> = []

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => values.push(rd as { status: string; error?: string }),
        complete: resolve,
      })
    })

    const errRd = values.find((v) => v.status === 'error')
    expect(errRd?.error).toBe('network failure')
  })

  it('success RemoteData carries the data', async () => {
    const source$ = of([1, 2, 3])
    const values: Array<{ status: string; data?: number[] }> = []

    await new Promise<void>((resolve) => {
      source$.pipe(toRemoteData()).subscribe({
        next: (rd) => values.push(rd as { status: string; data?: number[] }),
        complete: resolve,
      })
    })

    const successRd = values.find((v) => v.status === 'success')
    expect(successRd?.data).toEqual([1, 2, 3])
  })
})
