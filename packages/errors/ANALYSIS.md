# @rxjs-spa/errors — Package Analysis

## Overview

`@rxjs-spa/errors` is a centralized error handling layer for RxJS applications. It provides a global error bus, automatic capture of `window.onerror` and `unhandledrejection`, and drop-in replacements for `catchError`, `scan`, `subscribe`, and `createStore` that auto-report errors while keeping pipelines alive.

- **Version:** 0.1.0
- **Peer Dependencies:** RxJS 7.8.2, `@rxjs-spa/store` 0.1.0 (optional — only needed for `createSafeStore`)
- **Build:** Vite library mode (ES + CJS), `rxjs` and `@rxjs-spa/store` kept external
- **Tests:** jsdom via Vitest — 45 tests across 5 suites
- **Source Size:** ~316 lines in a single module (`public.ts`)

---

## Architecture

```
                        ┌─── window.onerror ─────────────┐
                        │                                 │
                        ├─── unhandledrejection ──────────┤
                        │                                 │
                        ├─── catchAndReport() ────────────┤
                        │                                 │
                        ├─── safeScan() (reducer throw) ──┤
                        │                                 │
                        ├─── safeSubscribe() ─────────────┤
                        │                                 ▼
                        │                          reportError(raw, source, context)
                        │                                 │
                        │                                 ▼
                        │                          toError(raw) → normalize to Error
                        │                                 │
                        │                                 ▼
                        │                          AppError { source, error, message,
                        │                                     timestamp, context }
                        │                                 │
                        │                          ┌──────┴──────┐
                        │                          ▼              ▼
                        │                    onError(appError)  bus.next(appError)
                        │                    (sync callback)        │
                        │                                           ▼
                        │                                      errors$
                        │                                    (hot Observable)
                        │                                         │
                        └─────────────────────────────────────────┘
                              subscribers: logging, UI toast,
                              Sentry, analytics, etc.
```

---

## Core Types

### `AppError`

Standardized error object emitted on every captured error:

```typescript
interface AppError {
  source: 'observable' | 'global' | 'promise' | 'manual'
  error: Error              // Always a normalized Error instance
  message: string           // Alias for error.message
  timestamp: number         // Date.now() at capture time
  context?: string          // Developer-supplied label for debugging
}
```

| Source | Origin |
|--------|--------|
| `'observable'` | RxJS pipeline error (catchAndReport, safeScan, safeSubscribe) |
| `'global'` | `window.onerror` event |
| `'promise'` | `window.unhandledrejection` event |
| `'manual'` | Direct call to `reportError()` (default) |

### `ErrorHandler`

The public interface returned by `createErrorHandler`:

```typescript
interface ErrorHandler {
  errors$: Observable<AppError>   // Hot stream, no replay
  reportError(error: unknown, source?: AppError['source'], context?: string): void
}
```

---

## Core API

### `createErrorHandler(config?): [ErrorHandler, Subscription]`

Factory that creates the error bus and optionally attaches global listeners.

```typescript
const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) => console.error(`[${e.source}] ${e.context}: ${e.message}`),
})

// Clean up on HMR
import.meta.hot?.dispose(() => errorSub.unsubscribe())
```

**Configuration:**

| Option | Default | Description |
|--------|---------|-------------|
| `enableGlobalCapture` | `true` | Attach `window.onerror` and `unhandledrejection` listeners |
| `onError` | `undefined` | Synchronous callback invoked on every error (before stream emission) |

**Returns a tuple:**
- `ErrorHandler` — the error bus (`errors$` + `reportError()`)
- `Subscription` — unsubscribe to remove global listeners (essential for HMR cleanup)

**Global capture details:**
- `window.onerror` → reports with `source: 'global'`
- `unhandledrejection` → reports with `source: 'promise'`
- Both listeners removed when the returned `Subscription` is unsubscribed
- Set `enableGlobalCapture: false` in Node/test environments where `window` is unavailable

**Error normalization (`toError`):**

Any thrown value is normalized to an `Error` instance:
- `Error` → kept as-is
- `string` → `new Error(raw)`
- Object → `new Error(JSON.stringify(raw))`, fallback to `new Error(String(raw))`

This ensures `AppError.error` is always an `Error` and `AppError.message` is always a `string`.

---

### `catchAndReport<T>(handler, options?): OperatorFunction<T, T>`

Drop-in replacement for `catchError` that auto-reports to the error handler.

```typescript
store.actions$.pipe(
  ofType('FETCH_USERS'),
  switchMap(() =>
    http.get<User[]>('/api/users').pipe(
      map(users => ({ type: 'USERS_LOADED' as const, users })),
      catchAndReport(errorHandler, {
        fallback: { type: 'USERS_ERROR' as const },
        context: 'usersView/FETCH',
      }),
    ),
  ),
).subscribe(store.dispatch)
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `fallback` | `T \| Observable<T>` | Value or Observable to emit after error; omit for clean completion (`EMPTY`) |
| `context` | `string` | Label attached to the `AppError` for debugging |

**Behavior:**
1. Source errors → `reportError(raw, 'observable', context)`
2. If `fallback` is an Observable → delegates to it
3. If `fallback` is a value → wraps in `of(fallback)`
4. No fallback → returns `EMPTY` (stream completes, no downstream error)

The outer pipeline stays alive because the error is caught within the inner Observable (inside `switchMap`, `mergeMap`, etc.).

---

### `safeScan<S, A>(reducer, initial, handler, options?): OperatorFunction<A, S>`

Drop-in replacement for `scan` that catches reducer throws and preserves state.

```typescript
const state$ = actions$.pipe(
  safeScan(reducer, initialState, errorHandler, { context: 'appStore' }),
  startWith(initialState),
  shareReplay({ bufferSize: 1, refCount: false }),
)
```

**Behavior:**
1. Normal operation: identical to `scan(reducer, initial)`
2. Reducer throws → error reported with `source: 'observable'` and `context`
3. **Returns previous accumulator state** (not initial state) — preserves last known-good state
4. Pipeline continues alive — subsequent actions are processed normally

**Critical detail:** After `INC` (state `{ count: 1 }`) then `BOOM` (throws), `safeScan` returns `{ count: 1 }` (previous state), not `{ count: 0 }` (initial state). The next `INC` produces `{ count: 2 }`.

---

### `safeSubscribe<T>(source$, handler, next, options?): Subscription`

Helper that auto-wires the `error` callback to the error handler.

```typescript
const sub = safeSubscribe(
  myStream$,
  errorHandler,
  (value) => renderUI(value),
  { context: 'dashboardView' },
)
```

**Behavior:**
- Subscribes to `source$` with provided `next` callback
- On error: calls `handler.reportError(raw, 'observable', context)` instead of throwing
- Prevents silent subscription deaths from unhandled errors
- Returns the `Subscription` for manual teardown

---

### `createSafeStore<S, A>(reducer, initialState, handler, options?): Store<S, A>`

Drop-in replacement for `createStore` from `@rxjs-spa/store` using `safeScan` internally.

```typescript
const store = createSafeStore(reducer, initialState, errorHandler, {
  context: 'globalStore',
})

// Same interface as createStore:
store.dispatch({ type: 'FETCH_USERS' })
store.state$.subscribe(render)
store.select(s => s.users).subscribe(renderUsers)
store.getState()
```

**Internal pipeline:**
```
Subject<A> → safeScan(reducer, initial, handler) → startWith(initial) → shareReplay(1)
```

**Returns full `Store<S, A>` interface:** `state$`, `actions$`, `dispatch`, `select`, `getState`

**Error resilience:** If the reducer throws on a dispatched action:
1. Error reported to handler
2. Previous state preserved (not initial)
3. `select()` reflects the preserved state
4. Subsequent dispatches continue normally from the preserved state

---

## Design Decisions

### 1. Hot Stream, No Replay

`errors$` is a `Subject.asObservable()` — hot, non-replaying. Late subscribers miss early errors. This prevents memory bloat from buffering all historical errors and matches the typical pattern where `errors$` is subscribed at app startup.

### 2. Synchronous `onError` Before Stream

The `onError` callback fires synchronously before the error enters the `errors$` stream. This guarantees the callback (e.g., console.error, Sentry.captureException) executes even if no one is subscribed to `errors$`.

### 3. Previous State, Not Initial State

`safeScan` returns the previous accumulator value on reducer throw — not the initial state. This preserves the last known-good state, keeping the UI in its most recent valid condition rather than resetting entirely.

### 4. Error Normalization

JavaScript allows throwing anything (`throw "oops"`, `throw null`, `throw { code: 42 }`). The `toError()` utility normalizes all values to `Error` instances, ensuring `AppError.error` and `AppError.message` are always well-typed.

### 5. Context Labels

Every function accepts an optional `context` string that is attached to the `AppError`. This enables correlation in logging and monitoring tools:

```typescript
catchAndReport(handler, { context: 'usersView/FETCH' })
// → AppError { context: 'usersView/FETCH', message: 'Network error', ... }
```

### 6. Tuple Return for Cleanup

`createErrorHandler` returns `[ErrorHandler, Subscription]` rather than attaching cleanup to the handler. This forces callers to explicitly manage global listener lifecycle — particularly important for HMR where listeners must be removed on module dispose.

### 7. Optional Store Dependency

`@rxjs-spa/store` is an optional peer dependency. Only `createSafeStore` imports from it. Consumers using only error handling operators (`catchAndReport`, `safeScan`, `safeSubscribe`) don't need to install the store package.

---

## Test Coverage

| Suite | Tests | Key Scenarios |
|-------|-------|---------------|
| `createErrorHandler` | 13 | Tuple return, error$ emissions, default source='manual', explicit source+context, string normalization, object normalization, onError sync callback, no replay to late subscribers, timestamp, window.onerror capture, unhandledrejection capture, cleanup unsubscribe, enableGlobalCapture=false |
| `catchAndReport` | 7 | Pass-through on success, error reporting, fallback value, fallback Observable, EMPTY on no fallback, context label, pipeline survival inside switchMap |
| `safeScan` | 6 | Normal scan behavior, error reporting on throw, previous state preservation (not initial), continued processing after throw, context label, no downstream error propagation |
| `safeSubscribe` | 4 | Next callback, error reporting, subscription return, context label |
| `createSafeStore` | 8 | Full Store interface, initial state$, synchronous dispatch, throw reported + state preserved, continued dispatch after throw, select reflects preserved state, distinctUntilChanged dedup in select |

**Total: 45 tests** covering all functions, error normalization, global capture, cleanup, and edge cases.

---

## Usage Pattern — Full Integration

```typescript
// error-handler.ts
export const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) => console.error(`[${e.source}] ${e.context}: ${e.message}`),
})

// Optional: UI toast on errors
errorHandler.errors$.subscribe(e => showToast(e.message))

// store.ts — safe store (reducer throws don't crash)
const store = createSafeStore(reducer, initialState, errorHandler, {
  context: 'globalStore',
})

// effects.ts — safe HTTP with error reporting
store.actions$.pipe(
  ofType('FETCH'),
  switchMap(() =>
    http.get('/api/data').pipe(
      map(data => ({ type: 'SUCCESS' as const, data })),
      catchAndReport(errorHandler, {
        fallback: { type: 'ERROR' as const },
        context: 'dataEffect/FETCH',
      }),
    ),
  ),
).subscribe(store.dispatch)

// main.ts — HMR cleanup
import.meta.hot?.dispose(() => errorSub.unsubscribe())
```

---

## File Map

```
packages/errors/
  package.json              Package metadata, peer deps (rxjs, @rxjs-spa/store optional)
  vite.config.ts            Vite library build (ES + CJS), externals
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Full implementation (316 lines)
    public.test.ts          Complete test suite (562 lines, 45 tests)
```

---

## API Surface Summary

**Factory:**
- `createErrorHandler(config?): [ErrorHandler, Subscription]`

**Operators:**
- `catchAndReport<T>(handler, options?): OperatorFunction<T, T>`
- `safeScan<S, A>(reducer, initial, handler, options?): OperatorFunction<A, S>`

**Utilities:**
- `safeSubscribe<T>(source$, handler, next, options?): Subscription`
- `createSafeStore<S, A>(reducer, initialState, handler, options?): Store<S, A>`

**Types:**
- `AppError` — `{ source, error, message, timestamp, context? }`
- `ErrorHandler` — `{ errors$, reportError() }`
- `ErrorHandlerConfig` — `{ enableGlobalCapture?, onError? }`
- `CatchAndReportOptions<T>` — `{ fallback?, context? }`
- `SafeScanOptions` — `{ context? }`
- `SafeSubscribeOptions` — `{ context? }`
- `SafeStoreOptions` — `{ context? }`

---

## Summary

`@rxjs-spa/errors` is a focused ~316-line error handling layer that provides a centralized error bus (`errors$`), global error capture (`window.onerror`, `unhandledrejection`), and four drop-in replacements for common RxJS patterns — `catchAndReport` (replaces `catchError`), `safeScan` (replaces `scan`), `safeSubscribe` (replaces `subscribe`), and `createSafeStore` (replaces `createStore`). All four auto-report errors to the handler while keeping pipelines alive. The `safeScan` operator preserves previous state on reducer throws rather than resetting, and the `toError()` normalizer ensures any thrown value becomes a well-typed `AppError`. With 45 tests covering all paths including global capture cleanup, error normalization edge cases, and multi-action recovery sequences, the package provides production-ready error resilience for RxJS applications.
