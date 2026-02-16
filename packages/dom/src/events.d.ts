import { Observable } from 'rxjs';
/**
 * events(target, type) -> a cold Observable of DOM events.
 *
 * Nothing is listened to until you subscribe.
 * Unsubscribe removes the event listener.
 */
export declare function events<E extends Event>(target: EventTarget, type: string, options?: AddEventListenerOptions | boolean): Observable<E>;
