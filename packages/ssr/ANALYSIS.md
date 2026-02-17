# @rxjs-spa/ssr — Package Analysis

## Overview

`@rxjs-spa/ssr` is a server-side rendering module that converts reactive `@rxjs-spa/dom` templates into static HTML strings. It resolves all Observables to their first emitted value, recursively renders nested templates, conditionals, and lists, and produces fully escaped HTML suitable for initial page loads and SEO.

- **Version:** 0.0.1 (early stage)
- **Dependencies:** RxJS 7.8.2, `@rxjs-spa/dom` 0.1.0
- **Tests:** None yet (not included in monorepo test runner)
- **Source Size:** ~155 lines in a single module (`index.ts`)
- **Public API:** One function — `renderToString(template): Promise<string>`

---

## Architecture

```
Browser (Dynamic):
  html`<p>${value$}</p>`  →  TemplateResult  →  DOM Fragment + Subscription (reactive)

Server (Static):
  html`<p>${value$}</p>`  →  TemplateResult  →  renderToString()  →  HTML string (snapshot)
```

The SSR package bridges reactive templates (designed for the browser) into deterministic HTML strings by taking the **first value** from every Observable and recursively resolving all nested structures.

```
renderToString(template)
    │
    ├── Extract strings + values from TemplateResult
    ├── prepareTemplate(strings) → raw markup with __RX_N__ markers
    │
    ▼
Split markup by marker regex
    │
    ├── Text marker <!--__RX_N__-->  →  resolveValue(values[N])  →  <!--__RX_N__END-->
    └── Attr marker __RX_N__        →  resolveValue(values[N])  →  inline string
                                            │
                                            ▼
                                    resolveValue (recursive)
                                            │
                        ┌───────────────────┼───────────────────────┐
                        ▼                   ▼                       ▼
                   Observable          TemplateResult          Directive Object
                   firstValueFrom      renderToString          (conditional/list/
                   (take 1)            (recursive)              unsafeHtml)
                        │                   │                       │
                        ▼                   ▼                       ▼
                   resolveValue        HTML string             resolve condition/
                   (recursive)                                 items, then recurse
                        │
                        ▼
                   Primitive
                   escapeHtml(String(value))
```

---

## Public API

### `renderToString(template: TemplateResult): Promise<string>`

Converts a reactive template into a fully resolved HTML string.

```typescript
import { html, when, list } from '@rxjs-spa/dom'
import { renderToString } from '@rxjs-spa/ssr'
import { of } from 'rxjs'

const template = html`
  <h1>${of('Hello World')}</h1>
  <ul>
    ${list(
      of([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]),
      u => String(u.id),
      (item$, key) => html`<li>${item$.pipe(map(u => u.name))}</li>`,
    )}
  </ul>
`

const htmlString = await renderToString(template)
// <h1>Hello World</h1><ul><li>Alice</li><li>Bob</li></ul>
```

**Always async** — returns a `Promise<string>` because Observable resolution requires `firstValueFrom()`.

---

## Value Resolution

The internal `resolveValue()` function handles all interpolated values recursively, in this priority order:

| Value Type | Resolution |
|------------|------------|
| `Observable<T>` | `firstValueFrom(value.pipe(take(1)))` → recurse on emitted value; empty Observables → `''` |
| `Array` | `Promise.all(items.map(resolveValue))` → join without separator |
| `null` / `undefined` | `''` (empty string) |
| `TemplateResult` | Recursive `renderToString()` call |
| `UnsafeHtmlValue` (`__unsafeHtml: true`) | Resolve inner value (no escaping) |
| `ConditionalBinding` (`__conditional: true`) | Resolve `condition$`; if true → render `thenFn()`; if false → render `elseFn()` or `''` |
| `ListBinding` (`__list: true`) | Resolve `items$` → for each item: wrap in `of(item)`, call `templateFn(item$, key)`, render recursively → join |
| Primitive (string, number, boolean) | `escapeHtml(String(value))` |

---

## Marker-Based Template Resolution

Templates from `@rxjs-spa/dom` encode value positions as markers in the HTML markup:

- **Text context:** `<!--__RX_0__-->resolved value<!--__RX_0__END-->`
- **Attribute context:** `<div class="__RX_1__">` → `<div class="resolved value">`

The SSR renderer splits the markup by the regex `/(<!--__RX_\d+__-->|__RX_\d+__)/`, resolves each marker's corresponding value, and joins the parts back into a complete HTML string.

The `<!--__RX_N__END-->` markers are preserved in the output to support client-side hydration — the `@rxjs-spa/dom` `cleanSSR()` function uses these markers to identify and replace server-rendered content when reactive subscriptions take over.

---

## SSR Support in @rxjs-spa/dom

The `@rxjs-spa/dom` template engine explicitly supports SSR:

```typescript
// In dom/template.ts
if (typeof document === 'undefined' || globalThis.IS_SSR) {
  // Skip DOM tree walking; return raw markup for SSR
  return { templateEl: null, slots: [], paths: [], markup }
}
```

When running in Node.js (no `document`) or with the `IS_SSR` flag set, templates return raw markup instead of creating DOM fragments. The SSR package consumes this markup via `prepareTemplate(strings).markup`.

---

## Directive Handling

Directive objects are detected via duck-typing (structural property checks) rather than `instanceof` to avoid circular dependencies with `@rxjs-spa/dom` runtime code:

```typescript
function isTemplateResult(v): boolean  // checks for strings + values arrays
function isUnsafeHtml(v): boolean      // checks for __unsafeHtml === true
function isConditional(v): boolean     // checks for __conditional === true
function isListBinding(v): boolean     // checks for __list === true
```

### Conditional Rendering

```typescript
html`${when(isLoggedIn$, () => html`<p>Welcome</p>`, () => html`<p>Login</p>`)}`
```

SSR resolves `condition$` to its first value, renders the matching branch, and discards the other. Animation configs are ignored.

### List Rendering

```typescript
html`${list(users$, u => u.id, (item$, key) => html`<li>${item$}</li>`)}`
```

SSR resolves `items$` to its first value (the array), wraps each item in `of(item)` to create a static Observable for the template function, renders each item's template recursively, and joins the results.

### Unsafe HTML

```typescript
html`${unsafeHtml(richContent$)}`
```

SSR resolves the inner value and inserts it without HTML escaping — the same opt-in raw HTML behavior as the client-side renderer.

---

## Security

**HTML escaping is on by default** for all primitive values:

```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
```

Only `unsafeHtml()` directive values bypass escaping (explicit opt-in). Event handlers (`@click`) and property bindings (`.value`) are silently discarded — they have no meaning in static HTML and are re-attached during client-side hydration.

---

## Design Decisions

### 1. First Value Only

All Observables are resolved via `firstValueFrom(obs.pipe(take(1)))`. SSR produces a static snapshot — there is no mechanism for streaming updates. This is the correct semantic: the server renders the initial state, and the client takes over with reactive subscriptions after hydration.

### 2. Silent Empty Observable Handling

Empty or erroring Observables resolve to `''` (empty string) via a try/catch around `firstValueFrom`. This prevents SSR from crashing due to uninitialized streams but may silently hide bugs.

### 3. Fully Async

The entire render is `async/await` based. Observables become Promises via `firstValueFrom`, nested templates recurse with `await renderToString()`, and arrays use `Promise.all`. There is no synchronous rendering path.

### 4. Duck-Typed Directive Detection

Type guards use structural property checks (`__conditional`, `__list`, `__unsafeHtml`) rather than importing classes from `@rxjs-spa/dom`. This avoids circular dependencies and keeps the SSR package decoupled from the DOM runtime.

### 5. Hydration Markers Preserved

SSR output includes `<!--__RX_N__-->` and `<!--__RX_N__END-->` comment markers. These allow the client-side hydration phase to identify server-rendered content boundaries and cleanly replace them with reactive subscriptions.

---

## SSR vs Client-Side Comparison

| Aspect | SSR (`renderToString`) | Client (`html` template) |
|--------|------------------------|--------------------------|
| Output | HTML string | DOM Fragment + Subscription |
| Async | Always (Promise) | Synchronous |
| Observables | First value only | All emissions (subscribed) |
| Events (`@click`) | Discarded | Bound and active |
| Animations | Ignored | Executed |
| Properties (`.value`) | Discarded | Set on DOM elements |
| Nature | Stateless snapshot | Stateful, reactive |
| Use case | Initial page load, SEO, social previews | Runtime interactivity |

---

## Known Limitations

1. **No streaming support** — must wait for all Observables to resolve before returning; not suitable for very slow data sources
2. **First value only** — long-running Observables with state changes won't capture updates beyond the initial emission
3. **Event handlers ignored** — `@click`, `@input`, etc. are silently discarded; hydration re-attaches them on the client
4. **Animations ignored** — `when()` and `list()` animation configs have no effect in SSR
5. **No test coverage** — the package has no `.test.ts` files and is excluded from the monorepo Vitest config
6. **Silent empty Observable behavior** — empty Observables become empty strings without any warning or error
7. **No Express/Fastify integration** — the package is a pure rendering function; server framework integration is left to the consumer

---

## Hydration Flow (Full Picture)

```
Server:
  1. Create template with html`...`
  2. renderToString(template) → HTML with <!--__RX_N__--> markers
  3. Send HTML to client

Client:
  1. Browser renders server HTML immediately (fast paint)
  2. JavaScript loads, creates same template with html`...`
  3. @rxjs-spa/dom's cleanSSR() finds <!--__RX_N__END--> markers
  4. Replaces static SSR content with live reactive subscriptions
  5. Events, animations, and dynamic updates now active
```

---

## File Map

```
packages/ssr/
  package.json        Package metadata (v0.0.1), deps (rxjs, @rxjs-spa/dom)
  src/
    index.ts          Full implementation (155 lines)
                      - renderToString() (public)
                      - resolveValue() (recursive value resolution)
                      - escapeHtml() (XSS prevention)
                      - 4 type guards (duck-typing)
```

---

## API Surface Summary

**Function:**
- `renderToString(template: TemplateResult): Promise<string>`

**No types, interfaces, or other exports.**

---

## Summary

`@rxjs-spa/ssr` is a compact ~155-line server-side rendering module that converts `@rxjs-spa/dom` reactive templates into static HTML strings. It resolves all Observables to their first emitted value via `firstValueFrom`, recursively handles nested templates, conditionals (`when()`), lists (`list()`), and unsafe HTML (`unsafeHtml()`), and escapes all primitive values by default for XSS prevention. The output preserves hydration markers (`<!--__RX_N__END-->`) so the client-side DOM package can cleanly replace server-rendered content with live reactive subscriptions. At version 0.0.1 with no tests, it is the youngest package in the monorepo — functional but not yet production-hardened.
