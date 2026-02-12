# @rxjs-spa/dom

This package is the bridge between **streams** and the **DOM**.

- **Sources** create time (events, DOM changes)
- **Sinks** subscribe and write (effects you can cancel)

## Sources

### events(target, type)

Cold Observable of DOM events.

```ts
const click$ = events(button, 'click')
```

### textChanges(el)

Emits `el.textContent` whenever it changes (MutationObserver).

```ts
const text$ = textChanges(span)
```

### attrChanges(el, name)

Emits `el.getAttribute(name)` when that attribute changes.

```ts
const href$ = attrChanges(a, 'href')
```

### classChanges(el) / hasClass(el, className)

Emits class changes as a string, or a boolean membership stream.

```ts
const isActive$ = hasClass(div, 'active')
```

### valueChanges(input) / checkedChanges(input)

Form sources.

```ts
const name$ = valueChanges(nameInput)
const accepted$ = checkedChanges(checkbox)
```

## Sinks

### text(el)(value$)

Writes each value to `el.textContent`.

```ts
text(span)(count$)
```

### attr(el, name)(value$)

Sets/removes an attribute.

```ts
attr(a, 'href')(url$)
```

### classToggle(el, className)(on$)

Toggles a class per boolean.

```ts
classToggle(div, 'active')(isActive$)
```

### dispatch(target)(value$)

Forwards values into a target (typically a Subject).

```ts
dispatch(actions$)(add$)
```

### mount(root, setup)

Compose multiple sinks into one view Subscription.

```ts
const viewSub = mount(root, () => [
  text(span)(count$),
  classToggle(card, 'active')(isActive$),
])
```

## Lists

### renderList(container, keyFn, createNode, updateNode?)(items$)

Keyed list rendering with optional patching.

### renderKeyedList(container, keyFn, createView, updateView?)(items$)

Keyed list rendering where each item owns a Subscription (auto cleanup).

### renderKeyedComponents(container, keyFn, factory, actions)(items$)

Keyed mini-components:
- each item receives an `item$` stream that updates over time
- internal event streams are created once
- removal unsubscribes and completes the per-item stream
