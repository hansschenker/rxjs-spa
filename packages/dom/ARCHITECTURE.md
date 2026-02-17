# Architectural Evaluation of `@rxjs-spa/dom`

**Verdict: Strong, focused design with clear strengths and a few structural tension points.**

---

## Strengths

### 1. The Source/Sink Duality is a Genuine Insight

The entire package is organized around one idea: **DOM reads are Observables (sources), DOM writes are subscriptions (sinks)**. This isn't just naming — it produces real compositional benefits:

- Sources compose with `pipe()` like any Observable.
- Sinks compose via `mount()` and `effect()` into a single `Subscription`.
- Teardown is a single `.unsubscribe()` call, regardless of how many bindings exist.

This is architecturally cleaner than what React, Vue, or Lit achieve. There's no reconciliation heuristic, no effect cleanup footgun, no stale closure problem. The subscription model makes lifecycle explicit and predictable.

### 2. Template Engine: Clever Caching Strategy

The `WeakMap<TemplateStringsArray, PreparedTemplate>` cache is well-chosen:

- Template strings arrays have **identity equality** per call site in JavaScript — if you call `` html`...` `` inside a function, every call returns the same strings reference.
- Parsing (context detection, marker insertion, DOM walking) happens once.
- Each render is just a `cloneNode(true)` + bind slots.

This is essentially the same optimization Lit uses, and it's the correct choice for a tagged template system. Parsing is O(n) on first use, then O(1) amortized.

### 3. Three-Tier List Rendering is Correctly Layered

The progression `renderList` -> `renderKeyedList` -> `renderKeyedComponents` / `list()` gives users the right level of abstraction for each use case:

| Tier | Use Case | Overhead |
|------|----------|----------|
| `renderList` | Static nodes, no internal state | Minimal — just a `Map<string, Node>` |
| `renderKeyedList` | Nodes with cleanup (timers, listeners) | One `Subscription` per item |
| `renderKeyedComponents` / `list()` | Items with reactive internal state | One `BehaviorSubject<T>` per item |

The shop app correctly uses `list()` everywhere because cart items and product cards have internal reactive state. The lower tiers exist for simpler cases and aren't dead code — they're genuinely useful for things like static lists.

### 4. Animation as a Composable Primitive

The `AnimateFn = (el: Element) => Promise<void>` type is minimalist and correct. It means:

- Any animation strategy (CSS transition, CSS keyframes, Web Animations API, or a custom library) plugs in identically.
- `when()` and `list()` accept `{ enter?, leave? }` — the template engine orchestrates, the user provides the effect.
- The `AbortController` pattern in `bindConditional` and `bindList` correctly handles rapid toggling.

### 5. XSS Safety by Default

Text interpolation in `` html`...` `` uses `document.createTextNode()` — inherently safe. The `unsafeHtml()` escape hatch requires an explicit opt-in. The `safeHtml()` sink escapes entities. This is the right default posture. The test suite specifically validates XSS resistance.

### 6. Zero Dependencies Beyond RxJS

The package has a single `peerDependency: rxjs`. No DOM abstraction library, no virtual DOM, no scheduler. This means:

- No version conflicts.
- Tiny bundle size (the entire package is ~860 lines of source).
- Full tree-shaking — import only what you use.

---

## Weaknesses and Tension Points

### 1. The `currentItem` Pattern is an Architectural Smell

Every list handler in the shop app does this:

```typescript
list(items$, i => String(i.product.id), (item$) => {
  let currentItem: CartItem | null = null
  item$.subscribe(i => { currentItem = i })
  // ...
  @click=${() => { if (currentItem) cartStore.dispatch(...) }}
})
```

This mutable `let` + manual subscribe is a **workaround** for a gap in the template engine: `@event` bindings accept plain functions, not Observables. The event handler has no way to close over the "latest value" from `item$` without this escape hatch.

**Why this matters:**

- It's an unmanaged subscription (the `item$.subscribe(...)` is never added to the returned subscription, so it leaks if the item's own teardown doesn't complete `item$`).
- It introduces imperative mutable state into an otherwise declarative system.
- Every developer using `list()` with actions has to rediscover this pattern.

**What would fix it:** Either:

- A `withLatestFrom`-style event binding: `@click=${(e) => item$.pipe(take(1))}` that merges the event with the latest value.
- A first-class `ctx.dispatch` or `actions` channel in the `list()` templateFn, similar to what `renderKeyedComponents` already provides via `ComponentCtx<A>`.
- A `getLatest()` helper on the `item$` that reads the BehaviorSubject synchronously.

### 2. Two Competing Paradigms: Template vs. Imperative Sinks

The package ships both:

- **Declarative**: `html`, `when`, `list`, `defineComponent` (template.ts + component.ts)
- **Imperative**: `text()`, `attr()`, `classToggle()`, `mount()`, `renderList()`, `renderKeyedList()`, `renderKeyedComponents()` (sinks.ts)

The shop demonstrates both: most views use the template system, but `checkout.view.ts` uses the imperative `mount`/`classToggle`/`bindInput` pattern with `querySelector`.

This dual-mode exists because the forms package (`@rxjs-spa/forms`) uses `bindInput`/`bindError` which target existing DOM elements by reference. But it creates a **cognitive split**:

- When should you use `html` with `@event` vs. `events()` + `dispatch()`?
- When should you use `list()` (template) vs. `renderKeyedComponents()` (sinks)?
- The imperative sinks in `sinks.ts` and the list functions in `sinks.ts` overlap with `list()` and attribute bindings in `template.ts`.

The template system is strictly more expressive for new code. The imperative sinks are legacy/escape-hatch for cases where you have pre-existing DOM (like forms). This isn't documented anywhere.

**Suggestion:** The imperative sinks (`text`, `attr`, `classToggle`, `renderList`, `renderKeyedList`, `renderKeyedComponents`) could be moved to a separate entrypoint (e.g., `@rxjs-spa/dom/sinks`) to signal they're a lower-level API, or the docs should explicitly position them as the "imperative escape hatch" for integrating with pre-rendered HTML.

### 3. Context Detection Heuristic is Fragile

The `detectContext()` function in `template.ts:191-218` determines whether an interpolation is inside an attribute or in text context. It uses string analysis:

```typescript
function detectContext(markup: string): 'text' | 'attr' {
  const lastOpenBracket = markup.lastIndexOf('<')
  // ...count quotes after last '='...
}
```

This is a regex-based heuristic, not a true HTML parser. It will produce incorrect results for:

- Attributes with `>` characters in their values (e.g., `title="a > b"`).
- Nested templates or comments containing `<`.
- Multi-valued attribute interpolations (e.g., `class="foo ${a} bar ${b}"`).

Lit solved this with a more robust state machine in their template parser. The current implementation works for the common case but has edge cases that would silently produce broken DOM.

**Observed mitigations:** The shop app avoids these edge cases entirely — all attribute bindings are single-value. But a framework package should be robust against uncommon-but-valid HTML.

### 4. `list()` Uses `display: contents` Wrapper

In `bindList()` (template.ts:561-563):

```typescript
const containerEl = document.createElement('div')
containerEl.style.display = 'contents'
parent.replaceChild(containerEl, anchor)
```

This wrapper div is necessary because `list()` needs a stable container to `appendChild` into. `display: contents` makes it layout-invisible, but:

- It breaks CSS `:nth-child` selectors (the wrapper is a child even though it's visually transparent).
- Screen readers may handle it inconsistently across browsers.
- It shows up in DevTools as an extra element.

By contrast, `when()` uses the anchor-comment pattern without a wrapper. `list()` could do the same (tracking node ranges per key), but it would be significantly more complex.

**Verdict:** Pragmatic trade-off. Acceptable for now, worth revisiting if CSS selector issues arise.

### 5. No Error Boundaries in the Template Engine

If an Observable inside `` html`...` `` throws, the subscription errors out and the binding dies silently. There's no equivalent of React's error boundaries or a way to catch and recover per-slot.

The shop app works around this at the effects level (using `catchAndReport` from `@rxjs-spa/errors`), but if a `map()` inside a template throws synchronously, the entire view's subscription could die:

```typescript
// If product is null, this throws — killing the text binding permanently
html`<p>${product$.pipe(map(p => p.title))}</p>`
```

**Suggestion:** The `bindTextSlot` Observable subscription could use a `catchError` that emits an empty string (or a configurable fallback) and reports to the error handler, keeping the binding alive.

### 6. No `distinctUntilChanged` on Sink Writes

Every sink writes to the DOM on every emission, even if the value hasn't changed:

```typescript
// text() writes to el.textContent on EVERY emission
value$.subscribe((v) => { el.textContent = String(v) })
```

For text content, `textContent` assignment is cheap. But for `setAttribute`, `style`, and especially `innerHTML`, redundant writes trigger unnecessary browser layout/paint. The template engine also doesn't deduplicate — every `item$.pipe(map(i => i.title))` emission writes to the DOM even if the title hasn't changed.

**Suggestion:** Consider adding `distinctUntilChanged()` inside sinks by default (at least for `attr`, `style`, and `innerHtml`), or document that consumers should add it themselves. The `when()` binding already uses `distinctUntilChanged` on `condition$` — the same principle should apply to value sinks.

### 7. SSR Story is Incomplete

The code has SSR scaffolding:

- `prepareTemplate` returns `markup` for SSR environments.
- `html()` returns a null fragment when `document` is undefined.
- `hydrate()` exists with SSR cleanup logic.

But the `hydrate()` function is never used anywhere in the codebase, and the SSR path in `prepareTemplate` stores raw markup but doesn't substitute slot values into it. This is a half-implemented feature.

**Verdict:** Not a bug — the framework is client-only in practice. But the SSR stubs add code surface area without delivering value yet. Either complete the SSR story or remove the dead branches.

### 8. Template Whitespace Sensitivity

The shop's `products.view.ts` has all its HTML on a single long line (lines 219-237). The `ProductCard` component explains why:

```typescript
// Minify HTML to avoid whitespace text nodes messing up slot resolution
```

This means the template parser's slot path resolution (`number[][]` child indices) can break when whitespace text nodes shift child indices. This is a usability problem — developers shouldn't have to minify their templates to get correct behavior.

**Root cause:** The walker counts all child nodes (including text nodes) when building paths. If the template HTML has whitespace between tags, those whitespace text nodes occupy child indices, and the paths become fragile.

**This is probably the most impactful issue.** It forces an unnatural coding style and will surprise new users.

---

## Test Coverage Assessment

| Module | Tests | Quality |
|--------|-------|---------|
| `observe.ts` | 6 tests | Good — covers initial emission + updates for all 6 functions |
| `sinks.ts` (`public.test.ts`) | 13 tests | Good — covers all sinks, XSS, list tiers, mount, head sinks |
| `template.ts` | 47+ tests | Excellent — static, reactive, XSS, every binding type, when/list, nesting, teardown, caching |
| `component.ts` | 13 tests | Excellent — lifecycle hooks, nesting, list integration, early-destroy edge case |
| `animation.ts` | 30+ tests | Excellent — all primitives, presets, integration with when/list, cancellation |
| `events.ts` | 0 tests | **Missing** — trivial function but no test for the core event source |

Overall test quality is high. The tests are synchronous where possible, use proper cleanup, and test edge cases (rapid toggle cancellation, early destroy, XSS). The `events.ts` gap is minor.

---

## Summary Scorecard

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Conceptual clarity** | Excellent | Source/sink duality, subscription-as-lifecycle |
| **Composability** | Excellent | Everything composes via Observable and Subscription |
| **API surface** | Good | Clean, but dual imperative/declarative modes add cognitive load |
| **Robustness** | Fair | Context detection heuristic, whitespace sensitivity, no error boundaries |
| **Performance** | Good | Template caching, keyed reconciliation; missing `distinctUntilChanged` on writes |
| **Test coverage** | Very Good | 100+ tests, good edge case coverage, one gap |
| **Bundle size** | Excellent | ~860 lines source, zero deps beyond RxJS |
| **Completeness** | Good | SSR half-implemented; `currentItem` pattern needs first-class support |

---

## Top 3 Actionable Improvements

1. **Fix whitespace sensitivity** — normalize the template walker to skip whitespace-only text nodes.
2. **Provide a first-class "latest value in event handler" pattern** — either a `getSnapshot()` on list items or an Observable-aware event binding.
3. **Add `distinctUntilChanged` to sinks** — avoid redundant DOM writes.
