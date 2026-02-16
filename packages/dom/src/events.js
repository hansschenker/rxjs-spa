import { Observable } from 'rxjs';
/**
 * events(target, type) -> a cold Observable of DOM events.
 *
 * Nothing is listened to until you subscribe.
 * Unsubscribe removes the event listener.
 */
export function events(target, type, options) {
    return new Observable((subscriber) => {
        const handler = (e) => subscriber.next(e);
        target.addEventListener(type, handler, options);
        return () => target.removeEventListener(type, handler, options);
    });
}
