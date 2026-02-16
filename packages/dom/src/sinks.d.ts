import type { Observable } from 'rxjs';
import { Subscription } from 'rxjs';
type Unsub = () => void;
/**
 * text(el)(value$)
 * Writes each incoming value to el.textContent.
 */
export declare function text(el: Element): (value$: Observable<string | number>) => Subscription;
/**
 * innerHtml(el)(value$)
 * Writes each incoming value to el.innerHTML.
 *
 * **Warning:** This writes raw HTML — never pipe user-controlled data through
 * it. Use `safeHtml()` or `text()` for untrusted content.
 */
export declare function innerHtml(el: Element): (value$: Observable<string>) => Subscription;
export declare function escapeHtml(str: string): string;
/**
 * safeHtml(el)(value$)
 * Escapes HTML entities before writing to el.innerHTML.
 * Safe for rendering user-controlled content that may contain markup.
 */
export declare function safeHtml(el: Element): (value$: Observable<string>) => Subscription;
/**
 * attr(el, name)(value$)
 * - string/number -> setAttribute(name, String(value))
 * - null/undefined -> removeAttribute(name)
 */
export declare function attr(el: Element, name: string): (value$: Observable<string | number | null | undefined>) => Subscription;
/**
 * prop(el, key)(value$)
 * Writes each incoming value to (el as any)[key].
 * Useful for `value`, `checked`, etc.
 */
export declare function prop<T extends object, K extends keyof T>(el: T, key: K): (value$: Observable<T[K]>) => Subscription;
/**
 * style(el, name)(value$)
 * - string/number -> set style
 * - null/undefined -> remove style
 */
export declare function style(el: HTMLElement, name: keyof CSSStyleDeclaration): (value$: Observable<string | number | null | undefined>) => Subscription;
/**
 * classToggle(el, className)(on$)
 * Adds/removes a class on each boolean.
 */
export declare function classToggle(el: Element, className: string): (on$: Observable<boolean>) => Subscription;
/**
 * dispatch(target)(value$)
 *
 * Turns an Observable into a sink that forwards values into a target with `next(...)`
 * (typically a Subject). Business rules live in upstream `map(...)` functions.
 */
export declare function dispatch<T>(target: {
    next: (value: T) => void;
}): (value$: Observable<T>) => Subscription;
/**
 * effect(...subs)
 * Combine multiple subscriptions/teardowns into one Subscription.
 */
export declare function effect(...items: Array<Subscription | Unsub>): Subscription;
/**
 * mount(root, setup)
 *
 * Run setup once, return one Subscription representing the whole view lifecycle.
 */
export declare function mount(root: Element, setup: (root: Element) => Subscription | Array<Subscription | Unsub>): Subscription;
/**
 * documentTitle(suffix?)(value$)
 * Sets `document.title` on each emission. If `suffix` is provided,
 * the title is formatted as `"value | suffix"`.
 */
export declare function documentTitle(suffix?: string): (value$: Observable<string>) => Subscription;
/**
 * metaContent(name)(value$)
 * Upserts a `<meta name="...">` tag in `<head>` with the given content.
 * Creates the element if it doesn't exist.
 */
export declare function metaContent(name: string): (value$: Observable<string>) => Subscription;
export type KeyFn<T> = (item: T, index: number) => string;
export type CreateFn<T> = (item: T, index: number) => Node;
export type UpdateFn<T> = (node: Node, item: T, index: number) => void;
/**
 * renderList(container, keyFn, createNode, updateNode?)(items$)
 *
 * Emits arrays. The DOM is kept in sync by key.
 */
export declare function renderList<T>(container: Element, keyFn: KeyFn<T>, createNode: CreateFn<T>, updateNode?: UpdateFn<T>): (items$: Observable<readonly T[]>) => Subscription;
export type KeyedView = {
    node: Node;
    sub: Subscription;
};
export type CreateViewFn<T> = (item: T, index: number) => {
    node: Node;
    sub?: Subscription | Unsub;
};
export type UpdateViewFn<T> = (view: KeyedView, item: T, index: number) => void;
/**
 * renderKeyedList(container, keyFn, createView, updateView?)(items$)
 *
 * Like renderList, but each item can have its own Subscription lifecycle.
 * When an item disappears (by key), its subscription is unsubscribed.
 */
export declare function renderKeyedList<T>(container: Element, keyFn: KeyFn<T>, createView: CreateViewFn<T>, updateView?: UpdateViewFn<T>): (items$: Observable<readonly T[]>) => Subscription;
export type ComponentCtx<A> = {
    /** Send actions upstream (usually into a Subject<Action>) */
    dispatch: (action: A) => void;
};
export type ComponentFactory<T, A> = (item$: Observable<T>, ctx: ComponentCtx<A>, key: string) => {
    node: Node;
    sub?: Subscription | Unsub;
};
/**
 * renderKeyedComponents(container, keyFn, factory, actions)(items$)
 *
 * Each keyed item becomes a mini component:
 * - it gets its own `item$` stream (BehaviorSubject) that updates over time
 * - it can create internal event streams once, and keep them alive across updates
 * - it can dispatch multiple action types upstream
 * - when removed, its subscription is unsubscribed and its `item$` completes
 */
export declare function renderKeyedComponents<T, A>(container: Element, keyFn: KeyFn<T>, factory: ComponentFactory<T, A>, actions: {
    next: (action: A) => void;
}): (items$: Observable<readonly T[]>) => Subscription;
export {};
