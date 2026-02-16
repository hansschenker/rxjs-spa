import { Observable } from 'rxjs';
/**
 * textChanges(el)
 * Emits el.textContent whenever it changes (MutationObserver).
 * Cold: no observer until subscribed. Unsubscribe disconnects observer.
 */
export function textChanges(el) {
    return new Observable((subscriber) => {
        const emit = () => subscriber.next(el.textContent ?? '');
        emit();
        const mo = new MutationObserver(() => emit());
        mo.observe(el, { characterData: true, childList: true, subtree: true });
        return () => mo.disconnect();
    });
}
/**
 * attrChanges(el, name)
 * Emits el.getAttribute(name) whenever that attribute changes.
 */
export function attrChanges(el, name) {
    return new Observable((subscriber) => {
        const emit = () => subscriber.next(el.getAttribute(name));
        emit();
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === name) {
                    emit();
                    break;
                }
            }
        });
        mo.observe(el, { attributes: true, attributeFilter: [name] });
        return () => mo.disconnect();
    });
}
/**
 * classChanges(el)
 * Emits the className string whenever the element's class attribute changes.
 */
export function classChanges(el) {
    return attrChanges(el, 'class').pipe((source) => new Observable((subscriber) => {
        const sub = source.subscribe({
            next: (v) => subscriber.next(v ?? ''),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
        });
        return () => sub.unsubscribe();
    }));
}
/**
 * hasClass(el, className)
 * Emits a boolean whenever the element's classList changes.
 */
export function hasClass(el, className) {
    return classChanges(el).pipe((source) => new Observable((subscriber) => {
        const sub = source.subscribe({
            next: () => subscriber.next(el.classList.contains(className)),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
        });
        return () => sub.unsubscribe();
    }));
}
/**
 * valueChanges(input)
 * Emits input.value on each input/change event.
 * Cold: listener is installed on subscribe, removed on unsubscribe.
 */
export function valueChanges(input, options) {
    const evs = options?.events ?? ['input', 'change'];
    const emitInitial = options?.emitInitial ?? true;
    return new Observable((subscriber) => {
        const emit = () => subscriber.next(String(input.value));
        if (emitInitial)
            emit();
        const handler = () => emit();
        for (const t of evs)
            input.addEventListener(t, handler);
        return () => {
            for (const t of evs)
                input.removeEventListener(t, handler);
        };
    });
}
/**
 * checkedChanges(input[type=checkbox|radio])
 * Emits input.checked on each change event.
 */
export function checkedChanges(input, options) {
    const emitInitial = options?.emitInitial ?? true;
    return new Observable((subscriber) => {
        const emit = () => subscriber.next(!!input.checked);
        if (emitInitial)
            emit();
        const handler = () => emit();
        input.addEventListener('change', handler);
        return () => input.removeEventListener('change', handler);
    });
}
