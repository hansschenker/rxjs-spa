# Errors Package Deep Dive

The `@rxjs-spa/errors` package provides a centralized system for capturing, normalizing, and reporting errors in an RxJS application. It is designed to prevent "silent failures" in Observable streams.

## The Problem

In standard RxJS:
- If a reducer throws an error, the `scan` operator errors out, and the `state$` stream completes (dies).
- If an effect throws an error and isn't caught, the stream dies.
- Unhandled Promise rejections or window errors might go unnoticed.

## The Solution: `ErrorHandler`

The core of the package is the `ErrorHandler`. It collects errors from various sources into a single stream (`errors$`).

### Setup

Create an error handler at the root of your application (usually in `main.ts`).

```typescript
import { createErrorHandler } from '@rxjs-spa/errors'

const [handler, sub] = createErrorHandler({
  enableGlobalCapture: true, // Catches window.onerror & unhandledRejection
  onError: (appError) => console.error(appError) // Sync logging
})

// Subscribe to display errors in UI (e.g., Toast)
handler.errors$.subscribe(e => showToast(e.message))
```

## Safe Operators

The package provides "safe" versions of standard patterns that report errors instead of crashing streams.

### `catchAndReport`

A pipeable operator that catches errors, reports them to the handler, and optionally provides a fallback value.

```typescript
import { catchAndReport } from '@rxjs-spa/errors'

http.get('/users').pipe(
  catchAndReport(handler, {
    fallback: [],
    context: 'FetchUsers'
  })
)
```

### `createSafeStore` / `safeScan`

`createSafeStore` is a drop-in replacement for `createStore`. It uses `safeScan` internally, which wraps your reducer in a `try/catch` block.
**If your reducer throws, the error is reported, but the state stream stays alive (it effectively ignores the bad action).**

```typescript
import { createSafeStore } from '@rxjs-spa/errors'

const store = createSafeStore(
  rootReducer,
  initialState,
  handler, // Pass the handler instance
  { context: 'GlobalStore' }
)
```

### `safeSubscribe`

A helper to subscribe to an Observable without forgetting to handle the `error` callback.

```typescript
import { safeSubscribe } from '@rxjs-spa/errors'

safeSubscribe(
  item$, 
  handler,
  (item) => console.log(item), // next
  { context: 'ItemView' }
)
```

## Error Object Structure

All errors are normalized to an `AppError` interface:

```typescript
interface AppError {
  source: 'observable' | 'global' | 'promise' | 'manual'
  error: Error
  message: string
  timestamp: number
  context?: string // Helpful label provided by you
}
```
