# @rxjs-spa/dom — Package Analysis

## Overview

`@rxjs-spa/dom` is a reactive DOM binding library built entirely on RxJS with zero additional dependencies. It provides a complete toolkit for building UIs declaratively — from low-level event streams and DOM sinks to a full tagged-template engine with conditional rendering, keyed lists, animations, and a lightweight component model.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2
- **Build:** Vite library mode (ES + CJS), `rxjs` kept external
- **Tests:** jsdom via Vitest — 100+ tests across 5 test files
- **Source Size:** ~1,700 lines across 7 source modules

---

## Architecture: Source / Sink Duality

The package is organized around two complementary concepts:

| Concept | Direction | Abstraction | Example |
|---------|-----------|-------------|---------|
| **Sources** | DOM → App | `Observable<T>` | `events(btn, 'click')`, `valueChanges(input)` |
| **Sinks** | App → DOM | `Subscription` | `text(el)(value$)`, `attr(el, 'href')(url$)` |

**Sources** produce cold Observables from DOM reads (events, mutations, input values).
**Sinks** consume Observables and write to the DOM, returning a `Subscription` for teardown.

This separation produces clean, composable pipelines where all lifecycle management is explicit via RxJS subscriptions.

---

## Module Breakdown

### 1. `events.ts` — DOM Event Source

Single export that converts any DOM event into a cold Observable:

```typescript
events<MouseEvent>(button, 'click').subscribe(e => ...)
events<KeyboardEvent>(input, 'keydown', { passive: true }).subscribe(e => ...)
```

- Listener added on subscribe, removed on unsubscribe
- Accepts standard `AddEventListenerOptions`
- Generic type parameter for typed event access

### 2. `observe.ts` — DOM Observation Sources

Six observable factories using `MutationObserver` and event listeners:

| Function | Emits | Mechanism |
|----------|-------|-----------|
| `textChanges(el)` | `string` | MutationObserver (characterData + childList) |
| `attrChanges(el, name)` | `string \| null` | MutationObserver (attributeFilter) |
| `classChanges(el)` | `string` | Built on `attrChanges` for `class` |
| `hasClass(el, className)` | `boolean` | Built on `classChanges` |
| `valueChanges(input, opts?)` | `string` | `input` + `change` events |
| `checkedChanges(input, opts?)` | `boolean` | `change` event |

All emit an initial value on subscribe and clean up observers/listeners on unsubscribe.

### 3. `sinks.ts` — DOM Write Operations

Curried sink functions that subscribe to an Observable and write each emission to the DOM:

**Text / HTML:**
- `text(el)` — writes to `textContent` (XSS-safe)
- `innerHtml(el)` — writes to `innerHTML` (raw)
- `safeHtml(el)` — escapes `& < > " '` before `innerHTML`

**Attributes / Properties / Styles:**
- `attr(el, name)` — `setAttribute` / `removeAttribute` on null
- `prop(el, key)` — direct property assignment
- `style(el, name)` — inline style set/remove
- `classToggle(el, className)` — `classList.toggle`

**Actions:**
- `dispatch(target)` — forwards values to a Subject (action dispatching)

**Document-Level:**
- `documentTitle(suffix?)` — sets `document.title` with optional suffix
- `metaContent(name)` — upserts `<meta>` tags

**Lifecycle Utilities:**
- `mount(root, setup)` — runs setup once, returns unified `Subscription`
- `effect(...items)` — combines multiple subscriptions into one

**List Rendering (3-Tier System):**

| Tier | Function | Per-Item Overhead | Use Case |
|------|----------|-------------------|----------|
| 1 | `renderList` | None | Static nodes, no internal state |
| 2 | `renderKeyedList` | One `Subscription` | Nodes with timers/listeners |
| 3 | `renderKeyedComponents` | `BehaviorSubject` + `Subscription` | Nodes with reactive internal state |

All three use keyed reconciliation — items are tracked by key, new items created, stale items removed, existing items reordered.

### 4. `template.ts` — Declarative Template Engine (~887 lines)

The largest module. Provides a tagged template literal system with reactive bindings:

```typescript
html`
  <p>${text$}</p>                         // text slot (auto-escaped)
  <a href=${url$}>link</a>                // attribute slot (reactive)
  <button @click=${handler}>Go</button>   // event slot
  <input .value=${value$} />              // property slot
  <div ?hidden=${isHidden$}>...</div>     // boolean attribute
  ${when(show$, thenFn, elseFn)}          // conditional rendering
  ${list(items$, keyFn, templateFn)}      // list rendering
  ${unsafeHtml(richContent$)}             // raw HTML (opt-in)
`
```

**Key features:**

- **Template caching:** Uses `WeakMap<TemplateStringsArray, PreparedTemplate>` — templates are parsed once per call site, then cloned on reuse
- **DOM walker paths:** Slot positions stored as `number[][]` (child indices from root) for fast binding
- **`LiveValue<T>`:** An `Observable<T>` with a `.snapshot()` method for synchronous access in event handlers
- **`when(condition$, thenFn, elseFn?, animation?)`:** Conditional rendering with optional enter/leave animations; uses AbortController for cancellation on rapid toggles
- **`list(items$, keyFn, templateFn, animation?)`:** Keyed list rendering where each item gets its own `BehaviorSubject<T>` — updates push new values without recreating subscriptions
- **`unsafeHtml(value)`:** Explicit opt-in for raw HTML content

### 5. `component.ts` — Component Definitions

Lightweight function-based component model:

```typescript
const Card = defineComponent<{ user$: Observable<User> }>((props, { onMount, onDestroy }) => {
  onMount(() => {
    console.log('mounted')
    return () => console.log('cleanup')  // optional cleanup
  })
  onDestroy(() => console.log('destroyed'))
  return html`<div>...</div>`
})

// Usage in template:
html`<div>${Card({ user$ })}</div>`
```

- `onMount` fires via `queueMicrotask` (after DOM insertion)
- `onDestroy` fires on subscription teardown
- No class hierarchy, no decorators — plain functions

### 6. `animation.ts` — Animation Primitives

Strategy-agnostic animation system built around a single interface:

```typescript
type AnimateFn = (el: Element) => Promise<void>
```

**Low-level helpers:**
- `waitForTransition(el, timeout?)` — resolves on `transitionend`
- `waitForAnimation(el, timeout?)` — resolves on `animationend`

**Factories:**
- `cssTransition({ from, active, to })` — CSS class orchestration (add from → force reflow → swap to active → wait → cleanup)
- `cssKeyframes(className, duration?)` — CSS @keyframes trigger
- `webAnimate(keyframes, options?)` — Web Animations API wrapper

**Built-in presets (zero CSS required):**
- `fadeIn` / `fadeOut`
- `slideIn(direction)` / `slideOut(direction)`
- `scaleIn` / `scaleOut`

Animations integrate with `when()` and `list()` for enter/leave transitions. Rapid toggling is handled via `AbortController` cancellation.

---

## Key Design Decisions

### 1. No Virtual DOM
Reactive bindings write directly to the DOM via subscriptions. There is no diffing or reconciliation algorithm — the subscription model handles updates predictably.

### 2. Explicit Subscription Lifecycle
Every binding returns a `Subscription`. Teardown is manual and composable via `mount()` and `effect()`. This aligns with RxJS idioms and prevents hidden memory leaks.

### 3. Template Caching via WeakMap
Tagged template strings have identity equality per call site in JavaScript. The engine exploits this to parse HTML once and clone the cached `<template>` element on subsequent calls — O(1) re-renders.

### 4. XSS-Safe by Default
Text interpolation uses `textContent` (no parsing). Raw HTML requires explicit `unsafeHtml()` opt-in. `safeHtml()` sink escapes entities before writing to `innerHTML`.

### 5. Three-Tier List Rendering
Developers choose the appropriate tier based on per-item complexity:
- **Tier 1:** No overhead — static nodes
- **Tier 2:** Per-item `Subscription` — nodes with side effects
- **Tier 3:** Per-item `BehaviorSubject` — fully reactive items

---

## Test Coverage

| Test File | Tests | Covers |
|-----------|-------|--------|
| `observe.test.ts` | 6 | All 6 observation sources |
| `public.test.ts` | 13+ | All sinks, list rendering (3 tiers), XSS prevention |
| `template.test.ts` | 47+ | All slot types, conditionals, lists, nesting, caching, teardown |
| `component.test.ts` | 13+ | Props, lifecycle hooks, nesting in lists |
| `animation.test.ts` | 30+ | All factories, presets, cancellation, integration with when/list |

**Total: 100+ tests** covering the full API surface including edge cases.

---

## Known Limitations

1. **Context detection heuristic:** Attribute vs. text slot detection uses string scanning rather than a proper state-machine parser — fragile for edge cases (attributes containing `>`, nested templates)
2. **Whitespace sensitivity:** The DOM walker counts all child nodes including whitespace text nodes, which can shift slot paths — forces single-line HTML in some cases
3. **`display: contents` wrapper:** List bindings use a wrapper `<div style="display:contents">` which can break CSS `:nth-child` selectors
4. **No error boundaries:** An Observable error in a template slot kills the entire template subscription with no per-slot recovery
5. **No `distinctUntilChanged` on sinks:** Every emission writes to the DOM even if the value hasn't changed
6. **SSR partially scaffolded:** `prepareTemplate` returns markup and `hydrate()` exists but is unused — the framework is client-only in practice

---

## File Map

```
packages/dom/
  package.json              Package metadata, peer deps, conditional exports
  vite.config.ts            Vite library build (ES + CJS)
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config
  tsconfig.build.json       Declaration emission config
  src/
    index.ts                Entry point (re-exports public.ts)
    public.ts               Public API aggregator
    events.ts               DOM event → Observable factory
    observe.ts              MutationObserver-based sources (6 functions)
    sinks.ts                DOM write sinks + list rendering (363 lines)
    template.ts             Tagged template engine (~887 lines)
    component.ts            defineComponent factory (116 lines)
    animation.ts            Animation primitives & presets (271 lines)
    observe.test.ts         Source tests
    public.test.ts          Sink tests
    template.test.ts        Template tests
    component.test.ts       Component tests
    animation.test.ts       Animation tests
```

---

## Summary

`@rxjs-spa/dom` is a well-structured, focused DOM binding library that achieves reactive UI rendering without a Virtual DOM, framework runtime, or external dependencies beyond RxJS. Its source/sink duality produces clean, composable APIs where every binding is an explicit subscription with predictable teardown. The template engine adds a declarative layer with caching, conditional/list primitives, and pluggable animations — all while keeping the core small (~1,700 lines of source).
