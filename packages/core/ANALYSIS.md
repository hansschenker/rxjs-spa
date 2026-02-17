# @rxjs-spa/core — Package Analysis

## Overview

`@rxjs-spa/core` is a micro-library providing two semantic wrappers around RxJS's `shareReplay` operator. It encodes the two most common multicasting strategies in reactive SPAs — permanent state caching and subscriber-scoped sharing — into clearly named functions that eliminate the need to remember `shareReplay` configuration options.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2
- **Build:** Vite library mode (ES + CJS), `rxjs` kept external
- **Tests:** Node environment via Vitest — 1 focused test
- **Source Size:** ~25 lines in a single module (`public.ts`)
- **Public API:** Two functions — `remember()` and `rememberWhileSubscribed()`

---

## The Two Operators

### `remember<T>(): MonoTypeOperatorFunction<T>`

```typescript
source.pipe(shareReplay({ bufferSize: 1, refCount: false }))
```

Shares the latest emitted value among all subscribers. The source subscription is established on the first subscribe and **never torn down**, even when all downstream subscribers disconnect.

```
Subscriber Count:  1  0  1  0  0
Source Connected:  ✓  ✓  ✓  ✓  ✓   (always connected after first subscription)
```

**Behavior:**
1. First subscriber triggers source subscription
2. Latest value cached (buffer size 1)
3. Late subscribers immediately receive the cached value
4. All subscribers unsubscribe → source stays connected, cache keeps updating
5. New subscribers rejoin → get latest cached value instantly

**Use when:**
- Global state (`state$` in stores) — must persist across view lifecycles
- Always-on resources (WebSocket connections, event buses)
- Expensive computations that should outlive individual subscribers

### `rememberWhileSubscribed<T>(): MonoTypeOperatorFunction<T>`

```typescript
source.pipe(shareReplay({ bufferSize: 1, refCount: true }))
```

Shares the latest emitted value among subscribers but **tears down the source subscription** when the last subscriber disconnects.

```
Subscriber Count:  1  0  1  0  0
Source Connected:  ✓  ✗  ✓  ✗  ✗   (torn down when count reaches 0)
```

**Behavior:**
1. First subscriber triggers source subscription
2. Latest value cached (buffer size 1)
3. Late subscribers immediately receive the cached value
4. All subscribers unsubscribe → source subscription destroyed, side effects cancelled
5. New subscribers later → fresh source subscription created from scratch

**Use when:**
- Route-scoped or component-local state — should be discarded on navigation
- Temporary data streams (polling intervals, timers)
- Memory-sensitive scenarios where long-lived caches are undesirable
- Lazy resources that should only run while actively observed

---

## The Key Difference: `refCount`

The only difference between the two functions is the `refCount` option:

| | `remember()` | `rememberWhileSubscribed()` |
|---|---|---|
| `bufferSize` | 1 | 1 |
| `refCount` | **false** | **true** |
| Source lifetime | Permanent (never unsubscribes) | Subscriber-scoped (unsubscribes when empty) |
| Cache after disconnect | Preserved and updating | Lost (fresh start on reconnect) |
| Memory | Holds reference forever | GC-eligible after last unsubscribe |

---

## Decision Guide

```
Is this GLOBAL state (stores, auth, theme)?
  → remember()

Is this LOCAL state (route-scoped, modal, form)?
  → rememberWhileSubscribed()

Should the source ALWAYS be running?
  → remember()

Should the source STOP when no one is listening?
  → rememberWhileSubscribed()

Do late subscribers need the LATEST value?
  → Either (both cache with bufferSize: 1)

Should reconnecting subscribers get a FRESH start?
  → rememberWhileSubscribed()
```

---

## Integration with rxjs-spa

### Store Pattern (global state)

```typescript
// Inside @rxjs-spa/store createStore():
const state$ = actionsSubject.pipe(
  scan(reducer, initialState),
  startWith(initialState),
  remember(),  // ← state persists across view lifecycles
)
```

State must outlive individual views. When a user navigates away and returns, the store's `state$` still holds the current state. Late subscribers (new views) immediately receive it.

### Router Pattern (singleton)

```typescript
// Inside @rxjs-spa/router createRouter():
const route$ = pathChange$.pipe(
  map(matchRoutes),
  filter(nonNull),
  distinctUntilChanged(),
  remember(),  // ← current route always available
)
```

The router is a singleton that must always know the current route. `remember()` ensures any component subscribing to `route$` gets the current route immediately.

### Local State Pattern (route-scoped)

```typescript
// Inside a view function:
const localState$ = localActions$.pipe(
  scan(reducer, initialState),
  startWith(initialState),
  rememberWhileSubscribed(),  // ← tears down when view unmounts
)
```

Local state tied to a specific route/view. When the user navigates away, `rememberWhileSubscribed()` tears down the source, freeing memory. Each new visit to the route starts fresh.

---

## Comparison with Raw RxJS

| Raw RxJS | @rxjs-spa/core | Intent |
|----------|----------------|--------|
| `shareReplay({ bufferSize: 1, refCount: false })` | `remember()` | Cache forever |
| `shareReplay({ bufferSize: 1, refCount: true })` | `rememberWhileSubscribed()` | Cache while subscribed |
| `share()` | *(not wrapped)* | No cache, just multicast |
| `shareReplay(1)` | *(ambiguous — refCount default changed across RxJS versions)* | Avoid — use explicit functions |

The semantic names eliminate a common source of bugs: accidentally using the wrong `refCount` value, which can cause either memory leaks (`false` when you meant `true`) or lost state (`true` when you meant `false`).

---

## Test Coverage

**File:** `public.test.ts` (27 lines, 1 test)

| Test | Scenario |
|------|----------|
| `remember: replays the latest value to late subscribers` | Early subscriber receives all emissions (1, 2); late subscriber receives only the cached latest (2); source completes cleanly |

The test validates the core contract: late subscribers get the buffered value immediately, and early subscribers see all values in sequence.

---

## File Map

```
packages/core/
  package.json              Package metadata, peer dep (rxjs)
  vite.config.ts            Vite library build (ES + CJS), rxjs external
  vitest.config.ts          Node test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (25 lines)
    public.test.ts          Test suite (27 lines, 1 test)
```

---

## API Surface Summary

**Operators:**
- `remember<T>(): MonoTypeOperatorFunction<T>` — `shareReplay(1)` with `refCount: false`
- `rememberWhileSubscribed<T>(): MonoTypeOperatorFunction<T>` — `shareReplay(1)` with `refCount: true`

---

## Summary

`@rxjs-spa/core` is a deliberately minimal ~25-line package that wraps RxJS's `shareReplay` into two semantically named operators. `remember()` creates a permanently cached, always-connected multicast stream for global state and singletons. `rememberWhileSubscribed()` creates a subscriber-scoped multicast stream that tears down when the last subscriber disconnects, suitable for local state and temporary resources. The package exists to encode a critical architectural decision — permanent vs. scoped caching — into function names rather than configuration objects, eliminating a common class of `refCount`-related bugs in reactive applications.
