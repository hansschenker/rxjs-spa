import { MonoTypeOperatorFunction, Observable, shareReplay } from 'rxjs'

/**
 * remember() -> share the latest value to late subscribers.
 *
 * Semantics:
 * - First subscriber "turns it on" (connects to the source)
 * - The connection stays alive even if downstream subscribers come and go
 * - Late subscribers immediately receive the latest value (if any)
 *
 * This matches the classic "state remembers": scan(...) + remember()
 */
export function remember<T>(): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) => source.pipe(shareReplay({ bufferSize: 1, refCount: false }))
}

/**
 * rememberWhileSubscribed() -> replay latest *while there is at least one subscriber*.
 *
 * When the last subscriber unsubscribes, the connection is torn down.
 * A later subscriber will NOT necessarily get the previous cached value.
 */
export function rememberWhileSubscribed<T>(): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) => source.pipe(shareReplay({ bufferSize: 1, refCount: true }))
}
