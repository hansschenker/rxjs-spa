import { Observable } from 'rxjs'

/**
 * events(target, type) -> a cold Observable of DOM events.
 *
 * Nothing is listened to until you subscribe.
 * Unsubscribe removes the event listener.
 */
export function events<E extends Event>(
  target: EventTarget,
  type: string,
  options?: AddEventListenerOptions | boolean,
): Observable<E> {
  return new Observable<E>((subscriber) => {
    const handler = (e: Event) => subscriber.next(e as E)

    target.addEventListener(type, handler, options)

    return () => target.removeEventListener(type, handler, options)
  })
}
