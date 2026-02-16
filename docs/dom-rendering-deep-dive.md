# @rxjs-spa/dom — DOM Rendering Deep Dive

A complete, step-by-step explanation of how `@rxjs-spa/dom` renders UI — from template string to live DOM. No virtual DOM, no diffing algorithm. Just RxJS subscriptions directly mutating targeted DOM nodes.

---

## Table of Contents

1. [Template Parsing — `html` Tagged Template](#step-1-template-parsing--html-tagged-template)
2. [Slot Binding — Connecting Observables to DOM](#step-2-slot-binding--connecting-observables-to-dom)
3. [Conditional Rendering — `when()`](#step-3-conditional-rendering--when)
4. [List Rendering — `list()`](#step-4-list-rendering--list)
5. [Sinks — Pushing Data to the DOM](#step-5-sinks--pushing-data-to-the-dom)
6. [Sources — Reading from the DOM](#step-6-sources--reading-from-the-dom)
7. [`mount()` — Unified Subscription Management](#step-7-mount--unified-subscription-management)
8. [`defineComponent()` — Lifecycle Hooks](#step-8-definecomponent--lifecycle-hooks)
9. [Animation System](#step-9-animation-system)
10. [Hydration (SSR to Client)](#step-10-hydration-ssr--client)
11. [Architecture Summary](#architecture-summary)

---

## Step 1: Template Parsing — `html` Tagged Template

When you write:

```typescript
const name$ = new BehaviorSubject('Alice')
const result = html`<h1>Hello ${name$}!</h1>`
```

The `html` function receives two things:

- **`strings`**: `["<h1>Hello ", "!</h1>"]` — the static parts
- **`values`**: `[name$]` — the dynamic interpolations

### 1a. Template Preparation (One-Time Parse + Cache)

`prepareTemplate(strings)` runs:

1. **Combines strings with markers.** Each interpolation slot gets a placeholder:
   - Text slots → `<!--__RX_0-->` (comment nodes)
   - Attribute slots → `__RX_0__`
   - Special prefixes are transformed:
     - `@click=` → `data-rx-event-click=`
     - `.value=` → `data-rx-prop-value=`
     - `?disabled=` → `data-rx-boolattr-disabled=`

2. **Creates a `<template>` element** from the combined markup. The browser parses the HTML natively.

3. **Walks the DOM tree** collecting slot info — each slot records:
   - **kind**: `text | attribute | event | property | boolean-attr`
   - **path**: array of child indices (e.g. `[0, 2, 1]` means "first child → third child → second child")
   - **index**: which interpolation value it maps to

4. **Caches the result** in a `WeakMap<TemplateStringsArray, PreparedTemplate>`. Same template literal identity = cache hit. Second call skips all parsing.

### 1b. Fragment Cloning

```typescript
const fragment = prepared.templateEl.content.cloneNode(true) as DocumentFragment
```

Clones the prepared `<template>`, giving you a fresh `DocumentFragment` with real DOM nodes — ready for slot binding.

### 1c. Template Caching Mechanism

```typescript
const cache = new WeakMap<TemplateStringsArray, PreparedTemplate>()

export function prepareTemplate(strings: TemplateStringsArray): PreparedTemplate {
  const hit = cache.get(strings)
  if (hit) return hit

  // ... parsing logic ...

  const prepared: PreparedTemplate = { templateEl, slots, paths }
  cache.set(strings, prepared)
  return prepared
}
```

**How caching works:**

- **Key** is the `strings` array object identity — two calls with the same template literal → same `strings` object → cache hit.
- **First call**: parse template, collect slots, cache the result.
- **Second call**: return cached `PreparedTemplate` immediately. No DOM parsing overhead.
- **Automatic cleanup**: `WeakMap` allows garbage collection. When a template is no longer referenced, the cache entry can be collected. No memory leaks.

```typescript
function makeTemplate(val: string) {
  return html`<p>${val}</p>` // Same strings object every time this function runs
}

const r1 = makeTemplate('a') // Parse, cache
const r2 = makeTemplate('b') // Cache hit! Reuse prepared template
const r3 = makeTemplate('c') // Cache hit! Reuse prepared template
```

---

## Step 2: Slot Binding — Connecting Observables to DOM

`bindSlots(fragment, prepared, values)` iterates each detected slot and wires it up.

### Text Slots — Six Cases

The comment node `<!--__RX_0-->` is the **anchor**. It stays in the DOM permanently so the framework always knows _where_ to insert/update content.

```
anchor (comment) → [inserted content] → next sibling
```

On each new emission: tear down previous nodes → insert new content after anchor. The anchor never moves.

| Value Type                  | Behavior                                                                 |
| --------------------------- | ------------------------------------------------------------------------ |
| **Static primitive** (`"hello"`, `42`) | Replace comment with a `TextNode`                              |
| **Observable** (`name$`)    | Subscribe; insert text node after anchor on each emission; remove previous nodes before inserting new ones |
| **Nested `TemplateResult`** | Replace comment with the fragment; merge the inner subscription          |
| **`when()` conditional**    | Delegate to `bindConditional()`                                          |
| **`list()` binding**        | Delegate to `bindList()`                                                 |
| **`unsafeHtml()`**          | Create a `<span>`, set `innerHTML` without escaping                      |

### Attribute Slots

```typescript
// Observable → subscribe and update on each emission
el.setAttribute(name, String(value))
// null/undefined → remove the attribute entirely
el.removeAttribute(name)
```

### Event Slots (`@click`)

```typescript
el.addEventListener(eventName, handler)
// On unsubscribe:
el.removeEventListener(eventName, handler)
```

### Property Slots (`.value`)

```typescript
;(el as any)[propName] = value // e.g. input.value = 'text'
```

### Boolean Attribute Slots (`?disabled`)

```typescript
truthy → el.setAttribute(name, '')   // <input disabled>
falsy  → el.removeAttribute(name)    // <input>
```

---

## Step 3: Conditional Rendering — `when()`

```typescript
when(
  isLoggedIn$,
  () => html`<p>Welcome!</p>`,
  () => html`<p>Please log in</p>`,
  { enter: fadeIn(300), leave: fadeOut(300) },
)
```

### Internal Flow (`bindConditional`)

**State tracked:**

- `currentNodes` — DOM nodes for the currently visible branch
- `currentSub` — subscription managing inner template bindings
- `leaveController` — `AbortController` to cancel in-flight leave animations

**Condition changes:**

1. Subscribes to `condition$.pipe(distinctUntilChanged())` — prevents duplicate work for the same boolean value.

2. **On `true`:**
   - Tears down current branch (unsubscribe inner template, remove nodes)
   - Calls `thenFn()` → gets a new `TemplateResult`
   - Inserts fragment nodes after the anchor
   - Runs `enter` animation (fire-and-forget)

3. **On `false`:**
   - If a `leave` animation exists:
     - Creates an `AbortController`
     - Runs `leave(element)` → returns `Promise`
     - On resolve: unsubscribe inner template, remove nodes
     - If condition flips again before animation ends → `abort()` cancels cleanup
   - No animation → immediate teardown
   - Mounts `elseFn()` branch if provided

4. **Rapid toggling protection:** The `AbortController` pattern means if a user flips `true→false→true` faster than the leave animation, the old removal is cancelled and the new branch replaces it cleanly.

---

## Step 4: List Rendering — `list()`

```typescript
list(
  users$,
  (user) => user.id, // key function
  (user$, key) =>
    html`
      // template (receives Observable, not value!)
      <tr>
        <td>${user$.pipe(map((u) => u.name))}</td>
      </tr>
    `,
  { enter: fadeIn(), leave: fadeOut() },
)
```

### Internal Flow (`bindList`)

**Container setup:**

```typescript
const containerEl = document.createElement('div')
containerEl.style.display = 'contents' // Invisible wrapper, flexbox/grid-safe
```

Uses `display: contents` to make the wrapper invisible. Nodes inside render as if they're direct children of the parent — flexbox/grid layouts treat them as direct children, not wrapped.

**On each `items$` emission, four phases run:**

### Phase 1: Create or Update

For each item in the new array:

```
Is this key currently leaving (mid-animation)?
  YES → Abort the leave, restore the view, push new value
  NO  → Does a view for this key already exist?
          YES → view.input.next(item)    // UPDATE: just push new value
          NO  → Create BehaviorSubject    // CREATE: new item
                Call templateFn(input.asObservable(), key)
                Store { nodes, sub, input }
```

**This is the critical innovation:** Each item gets a `BehaviorSubject<T>`. The template function receives `item$: Observable<T>`, not the raw item. When the item updates, only `input.next(newValue)` fires — the template DOM is **never recreated**. All internal subscriptions (derived streams, local state) survive across updates.

```typescript
// CREATE: First time seeing this key
const input = new BehaviorSubject<unknown>(item)
const result = binding.templateFn(input.asObservable(), key)
// Template created once, receives an Observable

// UPDATE: Key already exists with new data
view.input.next(item) // All downstream subscriptions receive the new value
// Template is NOT recreated. State inside the template persists!
```

### Phase 2: Remove Disappeared Items

```typescript
for (const [key, view] of views) {
  if (!nextKeys.has(key)) {
    // Key no longer in array
    if (leave animation exists) {
      run leave animation → then: unsubscribe, complete BehaviorSubject, remove nodes
    } else {
      immediate: unsubscribe, complete, remove
    }
  }
}
```

**Restoration on re-appearance:**

```typescript
const leaving = leavingViews.get(key)
if (leaving) {
  leaving.controller.abort() // Cancel leave animation
  leavingViews.delete(key) // Move back to active views
  views.set(key, leaving.view)
  leaving.view.input.next(item) // Update with new value
}
```

If an item is removed (starts leave animation) but then re-appears before the animation finishes — the leave is aborted, the view is restored, and the new value is pushed.

### Phase 3: Reorder DOM

```typescript
for (let i = 0; i < items.length; i++) {
  const key = binding.keyFn(items[i], i)
  const view = views.get(key)!
  for (const n of view.nodes) {
    containerEl.appendChild(n) // appendChild MOVES existing nodes
  }
}
```

`appendChild()` on a node already in the DOM **moves** it — it doesn't duplicate. Iterating in array order naturally reorders everything.

### Phase 4: Enter Animations

```typescript
for (const key of newKeys) {
  // Only newly created items
  const view = views.get(key)
  if (view) {
    const el = findFirstElement(view.nodes)
    if (el) binding.enter(el)
  }
}
```

---

## Step 5: Sinks — Pushing Data to the DOM

Sinks follow a **higher-order function** pattern:

```typescript
// Step 1: Bind to a target element + property
const updateText = text(myElement)

// Step 2: Connect an Observable → returns Subscription
const sub = updateText(name$)

// Each emission: myElement.textContent = value
```

### All Available Sinks

| Sink                    | DOM API Used                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `text(el)`              | `el.textContent = value`                                              |
| `html(el)`              | `el.innerHTML = value` (raw, no escaping)                             |
| `safeHtml(el)`          | `el.innerHTML = escapeHtml(value)` (XSS-safe)                        |
| `attr(el, name)`        | `el.setAttribute(name, value)` / `removeAttribute`                    |
| `prop(el, key)`         | `el[key] = value`                                                     |
| `style(el, name)`       | `el.style[name] = value`                                              |
| `classToggle(el, cls)`  | `el.classList.toggle(cls, boolean)`                                   |
| `dispatch(subject)`     | `subject.next(value)`                                                 |
| `documentTitle(suffix?)`| `document.title = suffix ? \`${value} \| ${suffix}\` : value`        |
| `metaContent(name)`     | Upserts `<meta name="..." content="value">` in `<head>`              |

### XSS Protection

```typescript
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

- `safeHtml()` escapes all HTML entities before setting `innerHTML`
- Text interpolation in templates is auto-escaped by default
- `unsafeHtml()` must be used explicitly for raw HTML — an intentional escape hatch

---

## Step 6: Sources — Reading from the DOM

Sources are **cold Observables** — nothing happens until you subscribe. All sources emit the initial value immediately (like `BehaviorSubject`), then react to changes.

| Source                       | Mechanism                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `events(el, 'click')`       | `addEventListener` / `removeEventListener`                       |
| `valueChanges(input)`       | Listens to `input` + `change` events; emits initial value        |
| `checkedChanges(checkbox)`  | Listens to `change` event; emits `boolean`                       |
| `textChanges(el)`           | `MutationObserver` on `characterData` + `childList`              |
| `attrChanges(el, name)`     | `MutationObserver` with `attributeFilter`                        |
| `hasClass(el, cls)`         | Built on `attrChanges('class')` → `classList.contains()`         |

### Example: `events()` Implementation

```typescript
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
```

- **Cold Observable**: nothing happens until subscribe
- **On subscribe**: adds event listener
- **On unsubscribe**: removes event listener

### Example: `valueChanges()` Implementation

```typescript
export function valueChanges(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  options?: { events?: readonly string[]; emitInitial?: boolean },
): Observable<string> {
  const evs = options?.events ?? ['input', 'change']
  const emitInitial = options?.emitInitial ?? true

  return new Observable<string>((subscriber) => {
    const emit = () => subscriber.next(String(input.value))
    if (emitInitial) emit() // BehaviorSubject-like: emit current value immediately

    const handler = () => emit()
    for (const t of evs) input.addEventListener(t, handler)

    return () => {
      for (const t of evs) input.removeEventListener(t, handler)
    }
  })
}
```

### Example: `textChanges()` Implementation

```typescript
export function textChanges(el: Element): Observable<string> {
  return new Observable<string>((subscriber) => {
    const emit = () => subscriber.next(el.textContent ?? '')
    emit()

    const mo = new MutationObserver(() => emit())
    mo.observe(el, { characterData: true, childList: true, subtree: true })

    return () => mo.disconnect()
  })
}
```

---

## Step 7: `mount()` — Unified Subscription Management

```typescript
const sub = mount(container, (root) => [
  text(root.querySelector('.name')!)(name$),
  attr(root.querySelector('.link')!, 'href')(url$),
  classToggle(root.querySelector('.card')!, 'active')(isActive$),
  events(root.querySelector('.btn')!, 'click').subscribe(() => doSomething()),
])

// Later: one call tears everything down
sub.unsubscribe()
```

### Implementation

```typescript
export function mount(
  root: Element,
  setup: (root: Element) => Subscription | Array<Subscription | Unsub>,
): Subscription {
  const s = new Subscription()
  const out = setup(root)
  if (Array.isArray(out)) {
    for (const it of out) s.add(typeof it === 'function' ? new Subscription(it) : it)
  } else {
    s.add(out)
  }
  return s
}
```

- Runs `setup()` once
- Collects all returned subscriptions and cleanup functions
- Returns a unified `Subscription`
- Unsubscribing cascades to everything

---

## Step 8: `defineComponent()` — Lifecycle Hooks

```typescript
const UserCard = defineComponent<Props>((props, { onMount, onDestroy }) => {
  onMount(() => {
    console.log('In the DOM now!')
    return () => console.log('Mount cleanup!') // optional cleanup
  })

  onDestroy(() => console.log('Component destroyed!'))

  return html`<div>${props.name$}</div>`
})
```

### Lifecycle Sequence

```
1. setup() runs synchronously
   ├── registers onMount/onDestroy callbacks
   └── returns TemplateResult

2. You insert fragment into DOM

3. queueMicrotask fires → onMount callbacks run (element is in DOM)
   └── return value from onMount → registered as onDestroy

4. sub.unsubscribe() → onDestroy callbacks run
```

`queueMicrotask` ensures `onMount` runs after the current synchronous code (where you insert the fragment) but before any macrotask — so the element is **guaranteed to be in the DOM**.

### Implementation

```typescript
export function defineComponent<P>(
  setup: (props: P, lifecycle: Lifecycle) => TemplateResult,
): ComponentDef<P> {
  return (props: P): TemplateResult => {
    const mountCallbacks: Array<() => void | (() => void)> = []
    const destroyCallbacks: Array<() => void> = []

    const lifecycle: Lifecycle = {
      onMount(fn) {
        mountCallbacks.push(fn)
      },
      onDestroy(fn) {
        destroyCallbacks.push(fn)
      },
    }

    // Run setup once — creates the template with all bindings
    const result = setup(props, lifecycle)

    // Composite subscription: template bindings + lifecycle teardown
    const compositeSub = new Subscription()
    compositeSub.add(result.sub)

    // Schedule onMount callbacks via microtask (so the fragment has been
    // inserted into the DOM by the time they run)
    queueMicrotask(() => {
      if (compositeSub.closed) return
      for (const fn of mountCallbacks) {
        const cleanup = fn()
        if (typeof cleanup === 'function') {
          destroyCallbacks.push(cleanup)
        }
      }
    })

    // Wire onDestroy callbacks to run on unsubscribe
    compositeSub.add(() => {
      for (const fn of destroyCallbacks) {
        fn()
      }
    })

    return {
      fragment: result.fragment,
      sub: compositeSub,
      strings: result.strings,
      values: result.values,
    }
  }
}
```

---

## Step 9: Animation System

Three layers, all returning `AnimateFn = (el: Element) => Promise<void>`:

### Layer 1: Web Animations API (Preferred)

```typescript
webAnimate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 })
```

Calls `el.animate()` natively. Resolves on `onfinish` / `oncancel`.

```typescript
export function webAnimate(
  keyframes: Keyframe[],
  options?: KeyframeAnimationOptions,
): AnimateFn {
  return (el: Element) =>
    new Promise<void>((resolve) => {
      const anim = el.animate(keyframes, options)
      anim.onfinish = () => resolve()
      anim.oncancel = () => resolve()
    })
}
```

### Layer 2: CSS Transitions

```typescript
cssTransition({ from: 'hidden', active: 'fade-in' })
```

Step-by-step:

1. Add `from` class (e.g., `opacity: 0`)
2. Force reflow with `offsetHeight` (tells browser to apply styles)
3. Remove `from` class
4. Add `active` class (has `transition: opacity 300ms ease-out; opacity: 1;`)
5. Wait for `transitionend`
6. Remove `active` class
7. Optionally add `to` class for final state

```typescript
export function cssTransition(config: {
  from: string
  active: string
  to?: string
  duration?: number
}): AnimateFn {
  return (el: Element) => {
    el.classList.add(config.from)
    void (el as HTMLElement).offsetHeight // Force reflow
    el.classList.remove(config.from)
    el.classList.add(config.active)

    return waitForTransition(el, config.duration ?? 5000).then(() => {
      el.classList.remove(config.active)
      if (config.to) el.classList.add(config.to)
    })
  }
}
```

### Layer 3: CSS Keyframes

```typescript
cssKeyframes('bounce-in', 500)
```

Add class → wait for `animationend` → remove class.

### Built-in Presets

All built on `webAnimate()`:

- `fadeIn(duration?)` / `fadeOut(duration?)`
- `slideIn(direction?, duration?)` / `slideOut(direction?, duration?)` — direction: `'left' | 'right' | 'up' | 'down'`
- `scaleIn(duration?)` / `scaleOut(duration?)`

```typescript
export function fadeIn(duration = 300): AnimateFn {
  return webAnimate([{ opacity: 0 }, { opacity: 1 }], {
    duration,
    easing: 'ease-out',
    fill: 'forwards',
  })
}

export function slideIn(
  direction: 'left' | 'right' | 'up' | 'down' = 'left',
  duration = 300,
): AnimateFn {
  const { x, y } = slideOffsets[direction]
  return webAnimate(
    [
      { opacity: 0, transform: `translate(${x}, ${y})` },
      { opacity: 1, transform: 'translate(0, 0)' },
    ],
    { duration, easing: 'ease-out', fill: 'forwards' },
  )
}
```

### Timeout Fallback

Both `waitForTransition()` and `waitForAnimation()` include a timeout (default 5s) so animations never hang the app if `transitionend` doesn't fire:

```typescript
export function waitForTransition(el: Element, timeout = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false
    const done = () => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }
    el.addEventListener('transitionend', function handler(e: Event) {
      if ((e as TransitionEvent).target !== el) return
      el.removeEventListener('transitionend', handler)
      done()
    })
    setTimeout(done, timeout) // Fallback: resolve after timeout
  })
}
```

---

## Step 10: Hydration (SSR → Client)

```typescript
// Server: renderToString() produces HTML with SSR markers
// Client:
const template = html`<h1>${name$}</h1>` // Same template
const hydrated = hydrate(document.querySelector('#app')!, template)
```

### Flow

1. **Server renders** HTML with markers: `<!--__RX_0__START-->content<!--__RX_0__END-->`
2. **Client calls** `hydrate()` → runs `bindSlots()` with `hydrate=true`
3. **On first Observable emission**, `cleanSSR()` removes server-rendered nodes between markers
4. **Live bindings take over** — framework "attaches" to existing DOM without re-rendering

```typescript
export function hydrate(root: Node, template: TemplateResult): TemplateResult {
  const prepared = prepareTemplate(template.strings)
  const fragment = root as DocumentFragment

  const sub = bindSlots(fragment, prepared, template.values, true)
  return { fragment, sub, strings: template.strings, values: template.values }
}
```

---

## Architecture Summary

```
html`...${obs$}...`
    │
    ├─ prepareTemplate()          WeakMap cache: parse once per template
    │     └─ slots[] + paths[]    Where each interpolation lands
    │
    ├─ cloneNode(true)            Fresh DOM fragment
    │
    └─ bindSlots()                Connect values to DOM
          │
          ├─ text slot            Comment anchor + Observable subscription
          ├─ attribute slot       setAttribute / removeAttribute
          ├─ event slot           addEventListener / removeEventListener
          ├─ property slot        el[prop] = value
          ├─ boolean-attr slot    setAttribute('') / removeAttribute
          ├─ when() conditional   Mount/unmount branches + animations
          └─ list() keyed         Per-item BehaviorSubject + reconciliation
                │
                └─ On update: input.next(newValue)  ← Template NOT recreated
                   On remove: unsubscribe + animate out + remove nodes
                   On reorder: appendChild moves existing nodes
```

### Subscription Lifecycle & Cleanup

When you call `templateResult.sub.unsubscribe()`:

1. **All Observable subscriptions end** — stops listening to value streams
2. **Event listeners removed** — clicks no longer fire
3. **MutationObservers disconnected** — stop tracking changes
4. **Conditional nodes removed** — cleans up DOM
5. **List item subscriptions unsubscribed** — cleans up all item views
6. **Lifecycle callbacks fired** — `onDestroy` hooks run
7. **Component cleanup runs** — component teardown completes

### Key Design Principles

- **No virtual DOM.** Direct DOM manipulation. Every Observable subscription maps to a DOM mutation. Changes are immediate, no diff/patch cycle.
- **Reactive by design.** Everything is an Observable. Sinks and sources compose naturally. No state outside the Observable graph.
- **Per-item state with key-based reconciliation.** `list()` maintains per-item `BehaviorSubject`s. Updates don't recreate templates. Internal state survives across updates.
- **Template caching via `WeakMap`.** Parse once per template literal identity. No reparsing on reuse.
- **XSS-safe by default.** Template text interpolation is auto-escaped. `safeHtml()` escapes entities. `unsafeHtml()` is an explicit escape hatch.
- **Explicit cleanup.** All subscriptions are explicit. Unsubscribe tears down everything. No memory leaks if you unsubscribe.
- **Each Observable maps 1:1 to a specific DOM operation.** Unsubscribe and everything cleans up.
