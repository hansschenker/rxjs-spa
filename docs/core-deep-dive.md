# Core Package Deep Dive

The `@rxjs-spa/core` package contains fundamental RxJS utilities and operators shared across the framework. It is kept minimal to reduce bundle size and circular dependencies.

## Operators

### `remember`

A shorthand for `shareReplay({ bufferSize: 1, refCount: false })`. 

It creates a "state-like" observable that:
1.  Subscribes to the source immediately upon the first subscription.
2.  **Keeps the subscription alive** even if all subscribers unsubscribe (due to `refCount: false`).
3.  Replays the latest emitted value to any new subscriber.

**Use Case:**
Global state streams or configuration streams that should never be torn down once started.

```typescript
import { remember } from '@rxjs-spa/core'

const globalConfig$ = http.get('/api/config').pipe(
  remember()
)
```

### `rememberWhileSubscribed`

A shorthand for `shareReplay({ bufferSize: 1, refCount: true })`.

It creates a shared observable that:
1.  Subscribes to the source upon the first subscription.
2.  **Unsubscribes from the source** when the reference count drops to zero (no more subscribers).
3.  Replays the latest value to new subscribers *as long as the stream is alive*.

**Use Case:**
Component-level state or expensive computations that should be cleaned up when no longer displayed (e.g., when a user navigates away from a page).

```typescript
import { rememberWhileSubscribed } from '@rxjs-spa/core'

const componentData$ = someSource$.pipe(
  rememberWhileSubscribed()
)
```
