# @rxjs-spa/core

## remember()

`remember()` replays the latest value to late subscribers and keeps the connection alive once it has been started.

Typical usage is **state remembers**:

```ts
events$.pipe(
  scan(reducer, initial),
  remember()
)
```

## rememberWhileSubscribed()

`rememberWhileSubscribed()` replays the latest value **only while there is at least one subscriber**. When the last subscriber unsubscribes, the connection is torn down.
