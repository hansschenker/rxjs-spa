import { Observable, Subscription } from 'rxjs';
import type { AnimateFn, AnimationConfig } from './animation';
/** Result of a tagged template literal call. */
export interface TemplateResult {
    /** The DOM fragment ready to insert into the document. */
    fragment: DocumentFragment;
    /** Subscription managing all internal bindings. Unsubscribe to tear down. */
    sub: Subscription;
    /** Original strings (for SSR). */
    strings: TemplateStringsArray;
    /** Original values (for SSR). */
    values: unknown[];
}
/** Marks a value as raw HTML (no escaping). */
export interface UnsafeHtmlValue {
    __unsafeHtml: true;
    value: Observable<string> | string;
}
/** Conditional binding created by `when()`. */
export interface ConditionalBinding {
    __conditional: true;
    condition$: Observable<boolean>;
    thenFn: () => TemplateResult;
    elseFn?: () => TemplateResult;
    enter?: AnimateFn;
    leave?: AnimateFn;
}
/** List binding created by `list()`. */
export interface ListBinding<T = unknown> {
    __list: true;
    items$: Observable<readonly T[]>;
    keyFn: (item: T, index: number) => string;
    templateFn: (item$: Observable<T>, key: string) => TemplateResult;
    enter?: AnimateFn;
    leave?: AnimateFn;
}
type SlotKind = 'text' | 'attribute' | 'event' | 'property' | 'boolean-attr';
interface SlotInfo {
    kind: SlotKind;
    index: number;
    /** For attribute/event/property/boolean-attr — the cleaned attribute name. */
    attrName?: string;
}
export interface PreparedTemplate {
    /** The <template> element whose content can be cloned. */
    templateEl: HTMLTemplateElement;
    /** Slot metadata collected during preparation. */
    slots: SlotInfo[];
    /** Walker path to each slot's node (as child-index chain from root). */
    paths: number[][];
    /** Raw markup (used for SSR). */
    markup?: string;
}
export declare function prepareTemplate(strings: TemplateStringsArray): PreparedTemplate;
export declare function hydrate(root: Node, template: TemplateResult): TemplateResult;
/**
 * html`...`
 *
 * Tagged template literal for reactive DOM construction.
 *
 * **Text interpolation** — auto-escaped, auto-subscribed if Observable:
 * ```ts
 * html`<p>${name$}</p>`
 * ```
 *
 * **Attribute binding** — static or reactive:
 * ```ts
 * html`<a href=${url$}>link</a>`
 * ```
 *
 * **Event binding** — `@eventname`:
 * ```ts
 * html`<button @click=${() => dispatch({ type: 'SAVE' })}>Save</button>`
 * ```
 *
 * **Property binding** — `.propname`:
 * ```ts
 * html`<input .value=${value$} />`
 * ```
 *
 * **Boolean attribute** — `?attrname`:
 * ```ts
 * html`<div ?hidden=${isHidden$}>Secret</div>`
 * ```
 *
 * **Conditional rendering**:
 * ```ts
 * html`${when(show$, () => html`<p>Visible</p>`)}`
 * ```
 *
 * **List rendering**:
 * ```ts
 * html`${list(items$, i => i.id, (item$, key) => html`<li>${item$}</li>`)}`
 * ```
 */
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;
/**
 * unsafeHtml(value)
 *
 * Mark a string or Observable<string> as raw HTML that should NOT be escaped.
 * Use only for trusted content.
 *
 * @example
 *   html`<div>${unsafeHtml(richContent$)}</div>`
 */
export declare function unsafeHtml(value: Observable<string> | string): UnsafeHtmlValue;
/**
 * when(condition$, thenFn, elseFn?)
 *
 * Conditional rendering. Mounts/unmounts a template based on a boolean Observable.
 * The inner template is created lazily and torn down when the condition flips.
 *
 * @example
 *   html`
 *     ${when(
 *       isLoggedIn$,
 *       () => html`<p>Welcome back!</p>`,
 *       () => html`<p>Please log in.</p>`,
 *     )}
 *   `
 */
export declare function when(condition$: Observable<boolean>, thenFn: () => TemplateResult, elseFn?: () => TemplateResult, animation?: AnimationConfig): ConditionalBinding;
/**
 * list(items$, keyFn, templateFn)
 *
 * Keyed list rendering. Each item gets its own `BehaviorSubject<T>` that
 * updates without recreating the template. Templates are created once per key
 * and destroyed when the item disappears.
 *
 * @example
 *   html`
 *     <ul>
 *       ${list(
 *         users$,
 *         u => String(u.id),
 *         (user$, key) => html`<li>${user$.pipe(map(u => u.name))}</li>`,
 *       )}
 *     </ul>
 *   `
 */
export declare function list<T>(items$: Observable<readonly T[]>, keyFn: (item: T, index: number) => string, templateFn: (item$: Observable<T>, key: string) => TemplateResult, animation?: AnimationConfig): ListBinding<T>;
export {};
