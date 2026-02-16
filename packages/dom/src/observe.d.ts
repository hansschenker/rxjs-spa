import { Observable } from 'rxjs';
/**
 * textChanges(el)
 * Emits el.textContent whenever it changes (MutationObserver).
 * Cold: no observer until subscribed. Unsubscribe disconnects observer.
 */
export declare function textChanges(el: Element): Observable<string>;
/**
 * attrChanges(el, name)
 * Emits el.getAttribute(name) whenever that attribute changes.
 */
export declare function attrChanges(el: Element, name: string): Observable<string | null>;
/**
 * classChanges(el)
 * Emits the className string whenever the element's class attribute changes.
 */
export declare function classChanges(el: Element): Observable<string>;
/**
 * hasClass(el, className)
 * Emits a boolean whenever the element's classList changes.
 */
export declare function hasClass(el: Element, className: string): Observable<boolean>;
/**
 * valueChanges(input)
 * Emits input.value on each input/change event.
 * Cold: listener is installed on subscribe, removed on unsubscribe.
 */
export declare function valueChanges(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, options?: {
    events?: readonly string[];
    emitInitial?: boolean;
}): Observable<string>;
/**
 * checkedChanges(input[type=checkbox|radio])
 * Emits input.checked on each change event.
 */
export declare function checkedChanges(input: HTMLInputElement, options?: {
    emitInitial?: boolean;
}): Observable<boolean>;
