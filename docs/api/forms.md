# @rxjs-spa/forms

Schema-based reactive forms for `rxjs-spa`. Zero external dependencies — just RxJS and a fluent schema builder.

## Installation

`@rxjs-spa/forms` is included in the monorepo. Add it to an app's `package.json`:

```json
{ "dependencies": { "@rxjs-spa/forms": "0.1.0" } }
```

---

## Schema builder (`s`)

Fluent builders that accumulate validators. Each method returns a **new** builder (immutable).

```typescript
import { s } from '@rxjs-spa/forms'

const schema = {
  name:      s.string('').required('Required').minLength(2, 'Min 2 chars'),
  email:     s.string('').required('Required').email('Invalid email'),
  message:   s.string('').required('Required').minLength(20).maxLength(500),
  priority:  s.string('medium').oneOf(['low','medium','high'], 'Invalid'),
  subscribe: s.boolean(false),
  age:       s.number(0).min(1, 'Must be positive').max(120),
}
```

### `s.string(initial?)`

| Method | Description |
|--------|-------------|
| `.required(msg?)` | Fails on empty / whitespace-only strings |
| `.minLength(n, msg?)` | Fails if `value.length < n` |
| `.maxLength(n, msg?)` | Fails if `value.length > n` |
| `.email(msg?)` | Validates email format (non-empty strings only) |
| `.pattern(regex, msg?)` | Validates against a regular expression |
| `.oneOf(options, msg?)` | Value must be in the provided array |
| `.refine(fn, msg?)` | Custom validation function `(v: string) => boolean` |

### `s.number(initial?)`

| Method | Description |
|--------|-------------|
| `.required(msg?)` | Fails if `NaN` |
| `.min(n, msg?)` | Fails if `value < n` |
| `.max(n, msg?)` | Fails if `value > n` |
| `.refine(fn, msg?)` | Custom validation |

### `s.boolean(initial?)`

| Method | Description |
|--------|-------------|
| `.required(msg?)` | Fails if `false` (use for required checkboxes) |
| `.refine(fn, msg?)` | Custom validation |

---

## `createForm(schema)`

Creates a reactive form object. Follows the same `Subject → scan → shareReplay` pipeline as `createStore`.

```typescript
import { createForm, s } from '@rxjs-spa/forms'

const form = createForm({
  name:  s.string('').required('Required'),
  email: s.string('').required('Required').email('Invalid email'),
})
```

### Form interface

| Member | Type | Description |
|--------|------|-------------|
| `values$` | `Observable<FormValues<S>>` | All current values |
| `errors$` | `Observable<FormErrors<S>>` | Validated errors per field (`null` = valid) |
| `touched$` | `Observable<FormTouched<S>>` | Which fields have been blurred |
| `valid$` | `Observable<boolean>` | `true` when all fields pass validation |
| `submitting$` | `Observable<boolean>` | `true` between `submit()` and `submitEnd()` |
| `actions$` | `Observable<FormAction>` | For wiring submit effects |
| `field(name)` | `FieldControl<T>` | Per-field observables |
| `setValue(name, value)` | `void` | Update a field value |
| `setTouched(name)` | `void` | Mark a field as touched |
| `submit()` | `void` | Marks all touched, emits `SUBMIT_START` |
| `submitEnd(ok)` | `void` | Emits `SUBMIT_END`; clears `submitting$` |
| `reset()` | `void` | Restores initial values and clears touched |
| `getValues()` | `FormValues<S>` | Synchronous snapshot |
| `getErrors()` | `FormErrors<S>` | Synchronous validation result |
| `isValid()` | `boolean` | Synchronous validity check |

### FieldControl

Returned by `form.field(name)`:

| Member | Type | Description |
|--------|------|-------------|
| `value$` | `Observable<T>` | Current field value |
| `error$` | `Observable<string \| null>` | Current validation error |
| `touched$` | `Observable<boolean>` | Whether field was blurred |
| `dirty$` | `Observable<boolean>` | Whether value differs from initial |
| `showError$` | `Observable<string \| null>` | Error only after touch (standard UX) |

### Submit effect pattern

Wire `form.actions$` exactly like `store.actions$` in NgRx:

```typescript
import { ofType } from '@rxjs-spa/store'
import { exhaustMap } from 'rxjs/operators'
import { http } from '@rxjs-spa/http'

form.actions$.pipe(
  ofType('SUBMIT_START'),
  exhaustMap(() => {
    if (!form.isValid()) { form.submitEnd(false); return EMPTY }
    return http.post('/api/contact', form.getValues()).pipe(
      tap(() => form.submitEnd(true)),
      catchError(() => { form.submitEnd(false); return EMPTY }),
    )
  }),
).subscribe()
```

---

## DOM Binders

### `bindInput(input, form, name)`

Binds a text `<input>` or `<textarea>` to a form field:
- `value$` → `input.value`
- `input` events → `form.setValue()`
- `blur` events → `form.setTouched()`

### `bindCheckbox(input, form, name)`

Binds `<input type="checkbox">` — same pattern, uses `checked` instead of `value`.

### `bindSelect(select, form, name)`

Binds `<select>` — uses `change` events.

### `bindError(el, error$)`

Renders an error observable into a DOM element:
- Sets `el.textContent`
- Toggles `has-error` class

### `bindField(container, form, name)`

Convenience wrapper: finds the first `input`/`textarea`/`select` and `.field-error` element inside `container`, then calls the appropriate binder + `bindError`.

```html
<div class="field-group">
  <input type="text" />
  <span class="field-error"></span>
</div>
```

```typescript
bindField(container.querySelector('.field-group'), form, 'name')
```

---

## Full example

```typescript
import { createForm, s, bindInput, bindSelect, bindError } from '@rxjs-spa/forms'
import { mount } from '@rxjs-spa/dom'

const form = createForm({
  name:    s.string('').required('Required').minLength(2),
  email:   s.string('').required('Required').email('Invalid'),
  subject: s.string('general').oneOf(['general','support','billing']),
})

export function contactView(container: Element) {
  container.innerHTML = `
    <form id="f">
      <input id="name" type="text" />
      <span class="field-error" id="err-name"></span>

      <input id="email" type="email" />
      <span class="field-error" id="err-email"></span>

      <select id="subject">
        <option value="general">General</option>
        <option value="support">Support</option>
        <option value="billing">Billing</option>
      </select>

      <button type="submit">Send</button>
    </form>
  `

  const formEl = container.querySelector('form')!

  return mount(container, () => [
    bindInput(container.querySelector('#name')!, form, 'name'),
    bindInput(container.querySelector('#email')!, form, 'email'),
    bindSelect(container.querySelector('#subject')!, form, 'subject'),
    bindError(container.querySelector('#err-name')!, form.field('name').showError$),
    bindError(container.querySelector('#err-email')!, form.field('email').showError$),

    formEl.addEventListener('submit', (e) => { e.preventDefault(); form.submit() }),
    new Subscription(() => {}),
  ])
}
```
