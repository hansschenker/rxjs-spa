# Testing Deep Dive

The `@rxjs-spa/testing` package provides a suite of utilities to simplify testing RxJS-based applications. It includes mocks for core system components (Store, Router, HTTP) and helpers for testing Observable streams.

## Core Philosophy

We believe in **Testing at the Boundaries**:
- **Unit Tests**: Test logic in isolation using pure functions or strict inputs/outputs.
- **Integration Tests**: Test how components interact with "mocked" infrastructure.
- **Marble Testing**: (Optional) For complex time-based streams, standard RxJS marble testing works out of the box.

## Setup

Ensure you have a test runner installed (we recommend `vitest` or `jest`).

```bash
npm install -D @rxjs-spa/testing vitest
```

## Testing Streams (`collectFrom`)

Testing Observables often involves boilerplate: subscribing, pushing values to an array, and unsubscribing. `collectFrom` helps reduce this.

```typescript
import { collectFrom } from '@rxjs-spa/testing'
import { of } from 'rxjs'

it('collects values synchronously', () => {
  const source$ = of(1, 2, 3)
  
  const { values, subscription } = collectFrom(source$)
  
  expect(values).toEqual([1, 2, 3])
  subscription.unsubscribe()
})
```

## Mocking the Store (`createMockStore`)

When testing components that depend on the `Store`, you often want to:
1.  **Inspect dispatched actions** to verify behavior.
2.  **Drive state changes** directly to verify rendering/reactions.

`createMockStore` creates a store that adheres to the `Store<S, A>` interface but adds testing capabilities.

```typescript
import { createMockStore } from '@rxjs-spa/testing'

it('dispatches actions and updates view', () => {
  // 1. Create Mock
  const store = createMockStore({ count: 0 })
  
  // 2. Interact
  store.dispatch({ type: 'INC' })
  
  // 3. Assert Actions
  expect(store.dispatchedActions).toEqual([{ type: 'INC' }])
  
  // 4. Drive State ( Simulate reducer logic )
  store.setState({ count: 1 })
  expect(store.getState().count).toBe(1)
})
```

## Mocking the Router (`createMockRouter`)

Testing routing logic without a real browser context is crucial. `createMockRouter` simulates the `Router` interface.

```typescript
import { createMockRouter } from '@rxjs-spa/testing'

it('navigates to user details', () => {
  const router = createMockRouter({ name: 'home', params: {}, query: {}, path: '/' })
  
  // Trigger navigation
  router.navigate('/users/123')
  
  // Assert
  expect(router.navigatedTo).toEqual(['/users/123'])
})

it('reacts to route changes', () => {
  const router = createMockRouter()
  const visited: string[] = []
  
  router.route$.subscribe(r => visited.push(r.name))
  
  // Simulate incoming route change
  router.emit({ name: 'profile', params: { id: '1' }, query: {}, path: '/profile/1' })
  
  expect(visited).toContain('profile')
})
```

## Mocking HTTP (`createMockHttpClient`)

Avoid making real network requests in tests. `createMockHttpClient` lets you define strict request/response expectations.

```typescript
import { createMockHttpClient } from '@rxjs-spa/testing'

it('fetches users', () => {
  const http = createMockHttpClient()
  
  // 1. Configure Mock Response
  http.whenGet('/api/users').respond([{ id: 1, name: 'Alice' }])
  
  // 2. Execute Code
  let result
  http.get('/api/users').subscribe(data => result = data)
  
  // 3. Assert
  expect(result).toEqual([{ id: 1, name: 'Alice' }])
  expect(http.calls[0]).toEqual({ method: 'GET', url: '/api/users' }) // no body
})
```

## Writing a Full Component Test

Here is an example of testing a "Smart Component" or "ViewModel" using these tools.

```typescript
import { createMockStore, collectFrom } from '@rxjs-spa/testing'

// System Under Test
function createViewModel(store: Store) {
  return {
    count$: store.select(s => s.count),
    increment: () => store.dispatch({ type: 'INC' })
  }
}

it('ViewModel bridges view and store', () => {
  const store = createMockStore({ count: 10 })
  const vm = createViewModel(store)
  
  // Test Output
  const { values } = collectFrom(vm.count$)
  expect(values).toEqual([10])
  
  // Test Input
  vm.increment()
  expect(store.dispatchedActions).toEqual([{ type: 'INC' }])
})
```
