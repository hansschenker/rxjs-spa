import { BehaviorSubject, Subscription } from 'rxjs';
function isNil(v) {
    return v === null || v === undefined;
}
/**
 * text(el)(value$)
 * Writes each incoming value to el.textContent.
 */
export function text(el) {
    return (value$) => value$.subscribe((v) => {
        el.textContent = String(v);
    });
}
/**
 * innerHtml(el)(value$)
 * Writes each incoming value to el.innerHTML.
 *
 * **Warning:** This writes raw HTML — never pipe user-controlled data through
 * it. Use `safeHtml()` or `text()` for untrusted content.
 */
export function innerHtml(el) {
    return (value$) => value$.subscribe((v) => {
        ;
        el.innerHTML = v;
    });
}
export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/**
 * safeHtml(el)(value$)
 * Escapes HTML entities before writing to el.innerHTML.
 * Safe for rendering user-controlled content that may contain markup.
 */
export function safeHtml(el) {
    return (value$) => value$.subscribe((v) => {
        ;
        el.innerHTML = escapeHtml(v);
    });
}
/**
 * attr(el, name)(value$)
 * - string/number -> setAttribute(name, String(value))
 * - null/undefined -> removeAttribute(name)
 */
export function attr(el, name) {
    return (value$) => value$.subscribe((v) => {
        if (isNil(v))
            el.removeAttribute(name);
        else
            el.setAttribute(name, String(v));
    });
}
/**
 * prop(el, key)(value$)
 * Writes each incoming value to (el as any)[key].
 * Useful for `value`, `checked`, etc.
 */
export function prop(el, key) {
    return (value$) => value$.subscribe((v) => {
        ;
        el[key] = v;
    });
}
/**
 * style(el, name)(value$)
 * - string/number -> set style
 * - null/undefined -> remove style
 */
export function style(el, name) {
    return (value$) => value$.subscribe((v) => {
        if (isNil(v))
            el.style[name] = '';
        else
            el.style[name] = String(v);
    });
}
/**
 * classToggle(el, className)(on$)
 * Adds/removes a class on each boolean.
 */
export function classToggle(el, className) {
    return (on$) => on$.subscribe((on) => {
        el.classList.toggle(className, !!on);
    });
}
/**
 * dispatch(target)(value$)
 *
 * Turns an Observable into a sink that forwards values into a target with `next(...)`
 * (typically a Subject). Business rules live in upstream `map(...)` functions.
 */
export function dispatch(target) {
    return (value$) => value$.subscribe((v) => target.next(v));
}
/**
 * effect(...subs)
 * Combine multiple subscriptions/teardowns into one Subscription.
 */
export function effect(...items) {
    const s = new Subscription();
    for (const it of items) {
        s.add(typeof it === 'function' ? new Subscription(it) : it);
    }
    return s;
}
/**
 * mount(root, setup)
 *
 * Run setup once, return one Subscription representing the whole view lifecycle.
 */
export function mount(root, setup) {
    const s = new Subscription();
    const out = setup(root);
    if (Array.isArray(out)) {
        for (const it of out)
            s.add(typeof it === 'function' ? new Subscription(it) : it);
    }
    else {
        s.add(out);
    }
    return s;
}
/**
 * documentTitle(suffix?)(value$)
 * Sets `document.title` on each emission. If `suffix` is provided,
 * the title is formatted as `"value | suffix"`.
 */
export function documentTitle(suffix) {
    return (value$) => value$.subscribe((title) => {
        document.title = suffix ? `${title} | ${suffix}` : title;
    });
}
/**
 * metaContent(name)(value$)
 * Upserts a `<meta name="...">` tag in `<head>` with the given content.
 * Creates the element if it doesn't exist.
 */
export function metaContent(name) {
    return (value$) => value$.subscribe((content) => {
        let el = document.querySelector(`meta[name="${name}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('name', name);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content);
    });
}
/**
 * renderList(container, keyFn, createNode, updateNode?)(items$)
 *
 * Emits arrays. The DOM is kept in sync by key.
 */
export function renderList(container, keyFn, createNode, updateNode) {
    const nodes = new Map();
    return (items$) => items$.subscribe((items) => {
        const nextKeys = new Set();
        const nextNodes = [];
        items.forEach((item, i) => {
            const key = keyFn(item, i);
            nextKeys.add(key);
            let node = nodes.get(key);
            if (!node) {
                node = createNode(item, i);
                nodes.set(key, node);
            }
            else if (updateNode) {
                updateNode(node, item, i);
            }
            nextNodes.push(node);
        });
        for (const [key, node] of nodes) {
            if (!nextKeys.has(key)) {
                nodes.delete(key);
                if (node.parentNode === container)
                    container.removeChild(node);
            }
        }
        const frag = document.createDocumentFragment();
        for (const node of nextNodes)
            frag.appendChild(node);
        container.replaceChildren(frag);
    });
}
function toSubscription(x) {
    if (!x)
        return new Subscription();
    return typeof x === 'function' ? new Subscription(x) : x;
}
/**
 * renderKeyedList(container, keyFn, createView, updateView?)(items$)
 *
 * Like renderList, but each item can have its own Subscription lifecycle.
 * When an item disappears (by key), its subscription is unsubscribed.
 */
export function renderKeyedList(container, keyFn, createView, updateView) {
    const views = new Map();
    return (items$) => items$.subscribe((items) => {
        const nextKeys = new Set();
        const nextNodes = [];
        items.forEach((item, i) => {
            const key = keyFn(item, i);
            nextKeys.add(key);
            let view = views.get(key);
            if (!view) {
                const created = createView(item, i);
                view = { node: created.node, sub: toSubscription(created.sub) };
                views.set(key, view);
            }
            else if (updateView) {
                updateView(view, item, i);
            }
            nextNodes.push(view.node);
        });
        for (const [key, view] of views) {
            if (!nextKeys.has(key)) {
                views.delete(key);
                view.sub.unsubscribe();
                if (view.node.parentNode === container)
                    container.removeChild(view.node);
            }
        }
        const frag = document.createDocumentFragment();
        for (const node of nextNodes)
            frag.appendChild(node);
        container.replaceChildren(frag);
    });
}
/**
 * renderKeyedComponents(container, keyFn, factory, actions)(items$)
 *
 * Each keyed item becomes a mini component:
 * - it gets its own `item$` stream (BehaviorSubject) that updates over time
 * - it can create internal event streams once, and keep them alive across updates
 * - it can dispatch multiple action types upstream
 * - when removed, its subscription is unsubscribed and its `item$` completes
 */
export function renderKeyedComponents(container, keyFn, factory, actions) {
    const views = new Map();
    const ctx = {
        dispatch: (a) => actions.next(a),
    };
    return (items$) => items$.subscribe((items) => {
        const nextKeys = new Set();
        const nextNodes = [];
        items.forEach((item, i) => {
            const key = keyFn(item, i);
            nextKeys.add(key);
            let view = views.get(key);
            if (!view) {
                const input = new BehaviorSubject(item);
                const created = factory(input.asObservable(), ctx, key);
                view = { node: created.node, sub: toSubscription(created.sub), input };
                views.set(key, view);
            }
            else {
                // push updated item into the per-item stream, without recreating subscriptions
                view.input.next(item);
            }
            nextNodes.push(view.node);
        });
        // remove disappeared
        for (const [key, view] of views) {
            if (!nextKeys.has(key)) {
                views.delete(key);
                view.sub.unsubscribe();
                view.input.complete();
                if (view.node.parentNode === container)
                    container.removeChild(view.node);
            }
        }
        // order nodes
        const frag = document.createDocumentFragment();
        for (const node of nextNodes)
            frag.appendChild(node);
        container.replaceChildren(frag);
    });
}
