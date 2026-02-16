import { BehaviorSubject, isObservable, Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { findFirstElement } from './animation';
// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
function isTemplateResult(v) {
    return (v !== null &&
        typeof v === 'object' &&
        'fragment' in v &&
        'sub' in v &&
        'fragment' in v &&
        'sub' in v &&
        (v.fragment instanceof DocumentFragment || v.fragment === null));
}
function isUnsafeHtml(v) {
    return v !== null && typeof v === 'object' && v.__unsafeHtml === true;
}
function isConditional(v) {
    return v !== null && typeof v === 'object' && v.__conditional === true;
}
function isListBinding(v) {
    return v !== null && typeof v === 'object' && v.__list === true;
}
// ---------------------------------------------------------------------------
// Slot detection
// ---------------------------------------------------------------------------
const MARKER_PREFIX = '__RX_';
const COMMENT_PREFIX = '<!--__RX_';
// Fallback for Node constants if running in SSR without full DOM mock
const NodeType = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
};
const cache = new WeakMap();
// ---------------------------------------------------------------------------
// Preparation: parse template string once, cache for reuse
// ---------------------------------------------------------------------------
export function prepareTemplate(strings) {
    const hit = cache.get(strings);
    if (hit)
        return hit;
    // Build the combined HTML with markers.
    // For text slots: use <!--__RX_N--> comment markers.
    // We need to detect attribute context to use __RX_N instead.
    let markup = '';
    const slotContexts = [];
    for (let i = 0; i < strings.length; i++) {
        markup += strings[i];
        if (i < strings.length - 1) {
            // Determine if we're inside an attribute value by checking if the last
            // static chunk ends with `attr="...` or `attr='...` without closing.
            const context = detectContext(markup);
            slotContexts.push(context);
            if (context === 'attr') {
                markup += `${MARKER_PREFIX}${i}__`;
            }
            else {
                markup += `${COMMENT_PREFIX}${i}__-->`;
            }
        }
    }
    // Pre-process special attribute prefixes (@event, .prop, ?bool) into data attributes
    // so the HTML parser doesn't mangle them.
    markup = markup.replace(/\s@([a-zA-Z]+)=/g, (_, name) => ` data-rx-event-${name}=`);
    markup = markup.replace(/\s\.([a-zA-Z]+)=/g, (_, name) => ` data-rx-prop-${name}=`);
    markup = markup.replace(/\s\?([a-zA-Z]+)=/g, (_, name) => ` data-rx-boolattr-${name}=`);
    // SSR Support: If no document or explicit SSR flag, return a virtual representation
    if (typeof document === 'undefined' || globalThis.IS_SSR) {
        const prepared = {
            templateEl: null, // Not used in SSR
            slots: [], // Not needed for string concatenation
            paths: [], // Not needed for string concatenation
            markup, // [NEW] Raw markup for SSR
        };
        cache.set(strings, prepared);
        return prepared;
    }
    const templateEl = document.createElement('template');
    templateEl.innerHTML = markup;
    // Walk the DOM to find slots and record their paths
    const slots = [];
    const paths = [];
    walkAndCollect(templateEl.content, [], slotContexts, slots, paths);
    const prepared = { templateEl, slots, paths };
    cache.set(strings, prepared);
    return prepared;
}
/**
 * Detect whether we're currently inside an HTML attribute value.
 * Simple heuristic: count unescaped quotes after the last `<` tag opening.
 */
function detectContext(markup) {
    // Find the last opening tag that hasn't been closed
    const lastOpenBracket = markup.lastIndexOf('<');
    if (lastOpenBracket === -1)
        return 'text';
    const afterOpen = markup.slice(lastOpenBracket);
    // If we find a closing '>' after the last '<', we're in text context
    if (afterOpen.includes('>'))
        return 'text';
    // We're inside a tag. Check if we're in an attribute value by
    // looking for an '=' followed by an odd number of quotes
    const eqIndex = afterOpen.lastIndexOf('=');
    if (eqIndex === -1)
        return 'text';
    const afterEq = afterOpen.slice(eqIndex + 1).trimStart();
    if (afterEq.startsWith('"') || afterEq.startsWith("'")) {
        const quote = afterEq[0];
        // Count occurrences of the quote after the opening one
        const rest = afterEq.slice(1);
        const count = (rest.match(new RegExp(quote === '"' ? '"' : "'", 'g')) || []).length;
        // Odd count means the attribute is closed, even means we're still inside
        return count % 2 === 0 ? 'attr' : 'text';
    }
    // Unquoted attribute value
    return 'attr';
}
function walkAndCollect(node, path, slotContexts, slots, paths) {
    if (node.nodeType === (typeof Node !== 'undefined' ? Node.COMMENT_NODE : NodeType.COMMENT_NODE)) {
        const text = node.textContent || '';
        const match = text.match(/^__RX_(\d+)__$/);
        if (match) {
            const index = parseInt(match[1], 10);
            slots.push({ kind: 'text', index });
            paths.push([...path]);
        }
        return;
    }
    if (node.nodeType === (typeof Node !== 'undefined' ? Node.ELEMENT_NODE : NodeType.ELEMENT_NODE)) {
        const el = node;
        // Check attributes for markers
        const attrsToRemove = [];
        for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            const name = attr.name;
            const value = attr.value;
            // Check if value contains a marker
            const markerMatch = value.match(new RegExp(`${MARKER_PREFIX}(\\d+)__`));
            if (!markerMatch)
                continue;
            const index = parseInt(markerMatch[1], 10);
            if (name.startsWith('data-rx-event-')) {
                const eventName = name.slice('data-rx-event-'.length);
                slots.push({ kind: 'event', index, attrName: eventName });
                paths.push([...path]);
                attrsToRemove.push(name);
            }
            else if (name.startsWith('data-rx-prop-')) {
                const propName = name.slice('data-rx-prop-'.length);
                slots.push({ kind: 'property', index, attrName: propName });
                paths.push([...path]);
                attrsToRemove.push(name);
            }
            else if (name.startsWith('data-rx-boolattr-')) {
                const boolName = name.slice('data-rx-boolattr-'.length);
                slots.push({ kind: 'boolean-attr', index, attrName: boolName });
                paths.push([...path]);
                attrsToRemove.push(name);
            }
            else {
                slots.push({ kind: 'attribute', index, attrName: name });
                paths.push([...path]);
                attrsToRemove.push(name);
            }
        }
        for (const a of attrsToRemove) {
            el.removeAttribute(a);
        }
    }
    // Recurse into children
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
        walkAndCollect(children[i], [...path, i], slotContexts, slots, paths);
    }
}
// ---------------------------------------------------------------------------
// Clone and bind: create a live fragment from a prepared template
// ---------------------------------------------------------------------------
export function hydrate(root, template) {
    const prepared = prepareTemplate(template.strings);
    const fragment = root; // Treat root as fragment for path resolution
    // Note: hydration assumes the root structure matches the template structure.
    const sub = bindSlots(fragment, prepared, template.values, true);
    return { fragment, sub, strings: template.strings, values: template.values };
}
function resolveNode(root, path) {
    let node = root;
    for (const idx of path) {
        node = node.childNodes[idx];
    }
    return node;
}
function bindSlots(fragment, prepared, values, hydrate = false) {
    const sub = new Subscription();
    for (let i = 0; i < prepared.slots.length; i++) {
        const slot = prepared.slots[i];
        const path = prepared.paths[i];
        const value = values[slot.index];
        const node = resolveNode(fragment, path);
        switch (slot.kind) {
            case 'text':
                bindTextSlot(node, value, sub, hydrate ? slot.index : undefined);
                break;
            case 'attribute':
                // Attributes don't need hydration cleanup (we just update them)
                bindAttributeSlot(node, slot.attrName, value, sub);
                break;
            case 'event':
                bindEventSlot(node, slot.attrName, value, sub);
                break;
            case 'property':
                bindPropertySlot(node, slot.attrName, value, sub);
                break;
            case 'boolean-attr':
                bindBooleanAttrSlot(node, slot.attrName, value, sub);
                break;
        }
    }
    return sub;
}
function bindTextSlot(commentNode, value, sub, hydrateIndex) {
    const parent = commentNode.parentNode;
    if (!parent)
        return;
    // Helper: Find and remove SSR nodes
    const cleanSSR = () => {
        if (hydrateIndex === undefined)
            return;
        const endMarkerRegex = new RegExp(`^__RX_${hydrateIndex}__END$`);
        let next = commentNode.nextSibling;
        const nodesToRemove = [];
        while (next) {
            if (next.nodeType === (typeof Node !== 'undefined' ? Node.COMMENT_NODE : NodeType.COMMENT_NODE)) {
                if (endMarkerRegex.test(next.textContent || '')) {
                    nodesToRemove.push(next);
                    break;
                }
            }
            nodesToRemove.push(next);
            next = next.nextSibling;
        }
        nodesToRemove.forEach(n => parent.removeChild(n));
    };
    // 1. Conditional
    if (isConditional(value)) {
        if (hydrateIndex !== undefined)
            cleanSSR();
        bindConditional(commentNode, value, sub);
    }
    // 2. List
    else if (isListBinding(value)) {
        if (hydrateIndex !== undefined)
            cleanSSR();
        bindList(commentNode, value, sub);
    }
    // 3. Nested TemplateResult (Static)
    else if (isTemplateResult(value)) {
        if (hydrateIndex !== undefined)
            cleanSSR();
        parent.replaceChild(value.fragment, commentNode);
        sub.add(value.sub);
    }
    // 4. Unsafe HTML
    else if (isUnsafeHtml(value)) {
        if (hydrateIndex !== undefined)
            cleanSSR();
        const wrapper = document.createElement('span');
        parent.replaceChild(wrapper, commentNode);
        if (isObservable(value.value)) {
            sub.add(value.value.subscribe((v) => {
                wrapper.innerHTML = v;
            }));
        }
        else {
            wrapper.innerHTML = value.value;
        }
    }
    // 5. Observable (Dynamic Content)
    else if (isObservable(value)) {
        // Robust Strategy: Keep the comment node as a stable anchor
        // Insert new content AFTER the anchor.
        // Defer SSR cleanup until first emission.
        const anchor = commentNode;
        let hasHydrated = false;
        let childSub = null;
        let childNodes = [];
        sub.add(value.subscribe((v) => {
            // 1. Snapshot valid parent
            const p = anchor.parentNode;
            if (!p)
                return;
            // 2. SSR Cleanup (Once)
            if (!hasHydrated && hydrateIndex !== undefined) {
                cleanSSR();
                hasHydrated = true;
            }
            // 3. Teardown previous content
            if (childSub) {
                childSub.unsubscribe();
                childSub = null;
            }
            if (childNodes.length > 0) {
                childNodes.forEach(n => n.parentNode?.removeChild(n));
                childNodes = [];
            }
            // 4. Render New Content
            const nextSibling = anchor.nextSibling;
            if (isTemplateResult(v)) {
                // Nested Template
                childSub = v.sub;
                // Fragment empties on insert
                childNodes = Array.from(v.fragment.childNodes);
                p.insertBefore(v.fragment, nextSibling);
            }
            else {
                // Primitive
                const text = document.createTextNode(String(v ?? ''));
                childNodes = [text];
                p.insertBefore(text, nextSibling);
            }
        }));
    }
    // 6. Static Primitive
    else {
        if (hydrateIndex !== undefined)
            cleanSSR();
        const textNode = document.createTextNode(String(value ?? ''));
        parent.replaceChild(textNode, commentNode);
    }
}
function bindConditional(anchor, binding, sub) {
    const parent = anchor.parentNode;
    let currentNodes = [];
    let currentSub = null;
    let leaveController = null;
    function teardownCurrent() {
        if (currentSub) {
            currentSub.unsubscribe();
            currentSub = null;
        }
        for (const n of currentNodes) {
            if (n.parentNode)
                n.parentNode.removeChild(n);
        }
        currentNodes = [];
    }
    function insertAndEnter(fn) {
        const result = fn();
        currentSub = result.sub;
        sub.add(currentSub);
        const nodes = Array.from(result.fragment.childNodes);
        const ref = anchor.nextSibling;
        for (const n of nodes) {
            parent.insertBefore(n, ref);
        }
        currentNodes = nodes;
        // Run enter animation (fire-and-forget)
        if (binding.enter) {
            const el = findFirstElement(nodes);
            if (el)
                binding.enter(el);
        }
    }
    sub.add(binding.condition$.pipe(distinctUntilChanged()).subscribe((show) => {
        // Cancel any in-progress leave animation
        if (leaveController) {
            leaveController.abort();
            leaveController = null;
        }
        if (!show && binding.leave && currentNodes.length > 0) {
            // Run leave animation, then tear down
            const nodesToRemove = currentNodes;
            const subToClean = currentSub;
            const controller = new AbortController();
            leaveController = controller;
            // Clear references so next show=true starts fresh
            currentNodes = [];
            currentSub = null;
            const el = findFirstElement(nodesToRemove);
            if (el) {
                binding.leave(el).then(() => {
                    if (controller.signal.aborted)
                        return;
                    leaveController = null;
                    if (subToClean)
                        subToClean.unsubscribe();
                    for (const n of nodesToRemove) {
                        if (n.parentNode)
                            n.parentNode.removeChild(n);
                    }
                });
            }
            else {
                // No element to animate — tear down immediately
                if (subToClean)
                    subToClean.unsubscribe();
                for (const n of nodesToRemove) {
                    if (n.parentNode)
                        n.parentNode.removeChild(n);
                }
                leaveController = null;
            }
            // Mount the else branch if present
            if (binding.elseFn) {
                insertAndEnter(binding.elseFn);
            }
        }
        else {
            // No leave animation needed — tear down immediately
            teardownCurrent();
            const fn = show ? binding.thenFn : binding.elseFn;
            if (fn) {
                insertAndEnter(fn);
            }
        }
    }));
    // Teardown removes nodes
    sub.add(() => {
        if (leaveController)
            leaveController.abort();
        for (const n of currentNodes) {
            if (n.parentNode)
                n.parentNode.removeChild(n);
        }
    });
}
function bindList(anchor, binding, sub) {
    const parent = anchor.parentNode;
    const containerEl = document.createElement('div');
    containerEl.style.display = 'contents';
    parent.replaceChild(containerEl, anchor);
    const views = new Map();
    // Views currently animating out — can be restored if the key re-appears
    const leavingViews = new Map();
    sub.add(binding.items$.subscribe((items) => {
        const nextKeys = new Set();
        const newKeys = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const key = binding.keyFn(item, i);
            nextKeys.add(key);
            // Cancel pending leave and restore view if item re-appears
            const leaving = leavingViews.get(key);
            if (leaving) {
                leaving.controller.abort();
                leavingViews.delete(key);
                // Restore the view back into the active map
                views.set(key, leaving.view);
                leaving.view.input.next(item);
                continue;
            }
            let view = views.get(key);
            if (!view) {
                const input = new BehaviorSubject(item);
                const result = binding.templateFn(input.asObservable(), key);
                const nodes = Array.from(result.fragment.childNodes);
                view = { nodes, sub: result.sub, input };
                views.set(key, view);
                sub.add(result.sub);
                newKeys.push(key);
            }
            else {
                view.input.next(item);
            }
        }
        // Remove disappeared items
        for (const [key, view] of views) {
            if (!nextKeys.has(key)) {
                views.delete(key);
                if (binding.leave) {
                    // Animate leave, then remove
                    const controller = new AbortController();
                    leavingViews.set(key, { view, controller });
                    const el = findFirstElement(view.nodes);
                    if (el) {
                        binding.leave(el).then(() => {
                            if (controller.signal.aborted)
                                return;
                            leavingViews.delete(key);
                            view.sub.unsubscribe();
                            view.input.complete();
                            for (const n of view.nodes) {
                                if (n.parentNode)
                                    n.parentNode.removeChild(n);
                            }
                        });
                    }
                    else {
                        leavingViews.delete(key);
                        view.sub.unsubscribe();
                        view.input.complete();
                        for (const n of view.nodes) {
                            if (n.parentNode)
                                n.parentNode.removeChild(n);
                        }
                    }
                }
                else {
                    view.sub.unsubscribe();
                    view.input.complete();
                    for (const n of view.nodes) {
                        if (n.parentNode)
                            n.parentNode.removeChild(n);
                    }
                }
            }
        }
        // Reorder into container
        for (let i = 0; i < items.length; i++) {
            const key = binding.keyFn(items[i], i);
            const view = views.get(key);
            for (const n of view.nodes) {
                containerEl.appendChild(n);
            }
        }
        // Run enter animations on newly created items (fire-and-forget)
        if (binding.enter) {
            for (const key of newKeys) {
                const view = views.get(key);
                if (view) {
                    const el = findFirstElement(view.nodes);
                    if (el)
                        binding.enter(el);
                }
            }
        }
    }));
}
function bindAttributeSlot(el, name, value, sub) {
    if (isObservable(value)) {
        sub.add(value.subscribe((v) => {
            if (v === null || v === undefined) {
                el.removeAttribute(name);
            }
            else {
                el.setAttribute(name, String(v));
            }
        }));
    }
    else {
        if (value === null || value === undefined) {
            el.removeAttribute(name);
        }
        else {
            el.setAttribute(name, String(value));
        }
    }
}
function bindEventSlot(el, eventName, value, sub) {
    if (typeof value === 'function') {
        const handler = value;
        el.addEventListener(eventName, handler);
        sub.add(() => el.removeEventListener(eventName, handler));
    }
}
function bindPropertySlot(el, propName, value, sub) {
    if (isObservable(value)) {
        sub.add(value.subscribe((v) => {
            ;
            el[propName] = v;
        }));
    }
    else {
        ;
        el[propName] = value;
    }
}
function bindBooleanAttrSlot(el, name, value, sub) {
    if (isObservable(value)) {
        sub.add(value.subscribe((v) => {
            if (v)
                el.setAttribute(name, '');
            else
                el.removeAttribute(name);
        }));
    }
    else {
        if (value)
            el.setAttribute(name, '');
        else
            el.removeAttribute(name);
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
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
export function html(strings, ...values) {
    const prepared = prepareTemplate(strings);
    if (typeof document === 'undefined' || globalThis.IS_SSR) {
        // fast path for SSR - no DOM creation
        return {
            fragment: null,
            sub: new Subscription(),
            strings,
            values
        };
    }
    const fragment = prepared.templateEl.content.cloneNode(true);
    const sub = bindSlots(fragment, prepared, values);
    return { fragment, sub, strings, values };
}
/**
 * unsafeHtml(value)
 *
 * Mark a string or Observable<string> as raw HTML that should NOT be escaped.
 * Use only for trusted content.
 *
 * @example
 *   html`<div>${unsafeHtml(richContent$)}</div>`
 */
export function unsafeHtml(value) {
    return { __unsafeHtml: true, value };
}
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
export function when(condition$, thenFn, elseFn, animation) {
    return {
        __conditional: true,
        condition$,
        thenFn,
        elseFn,
        enter: animation?.enter,
        leave: animation?.leave,
    };
}
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
export function list(items$, keyFn, templateFn, animation) {
    return {
        __list: true,
        items$,
        keyFn,
        templateFn,
        enter: animation?.enter,
        leave: animation?.leave,
    };
}
