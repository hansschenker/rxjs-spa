# @rxjs-spa/forms — Package Analysis

## Overview

`@rxjs-spa/forms` is a fully reactive forms library built on RxJS that provides schema-based validation, two-way DOM binding, nested form groups, cross-field validation, and touch-aware error display. It follows the same MVU reducer pattern as `@rxjs-spa/store`, driving all form state through a `Subject` → `scan` → `shareReplay` pipeline.

- **Version:** 0.1.0
- **Peer Dependency:** RxJS 7.8.2
- **Build:** Vite library mode (ES + CJS), `rxjs` kept external
- **Tests:** jsdom via Vitest — 50+ tests across 13 describe blocks (960 lines)
- **Source Size:** ~940 lines across 3 modules (`schema.ts`, `form.ts`, `binders.ts`)

---

## Architecture

```
Schema Definition (s.string().required().email())
    │
    ▼
createForm(schema, options?)
    │
    ├── getInitialValues(schema)     → FormValues<S>
    ├── makeInitialTouched(schema)   → FormTouched<S>
    │
    ▼
Subject<FormAction>
    │
    ▼
scan(formReducer, initialState)
    │
    ▼
startWith(initialState)
    │
    ▼
shareReplay({ bufferSize: 1, refCount: false })
    │
    ▼
state$  ────► BehaviorSubject (sync snapshot)
    │              │
    │              ├── getValues()
    │              ├── getErrors()
    │              └── isValid()
    │
    ├── values$    → map(state.values)
    ├── touched$   → map(state.touched)
    ├── submitting$ → map(state.submitting)
    ├── errors$    → values$.pipe(map(validateAll + crossField))
    ├── valid$     → errors$.pipe(map(isFormValid))
    │
    └── field(name) → FieldControl<T>
          ├── value$      (single field value)
          ├── error$      (always emits)
          ├── touched$    (interaction tracking)
          ├── dirty$      (differs from initial)
          └── showError$  (error only after touch)
```

---

## Module Breakdown

### 1. `schema.ts` (286 lines) — Schema Builder & Validation

Provides a fluent API for defining field schemas with chainable validators.

#### Schema Builder Namespace — `s`

```typescript
const schema = {
  email:    s.string('').required('Required').email('Invalid email'),
  age:      s.number(18).min(0, 'Too low').max(120, 'Too high'),
  agree:    s.boolean(false).required('Must agree'),
  address:  s.group({
    street: s.string('').required('Street required'),
    city:   s.string('').required('City required'),
  }),
}
```

| Builder | Initial | Validators |
|---------|---------|------------|
| `s.string(initial?)` | `''` | `required`, `minLength`, `maxLength`, `email`, `pattern`, `oneOf`, `refine` |
| `s.number(initial?)` | `0` | `required`, `min`, `max`, `refine` |
| `s.boolean(initial?)` | `false` | `required`, `refine` |
| `s.group(shape)` | nested schema | recursive validation |

#### Builder Pattern

Each validator method returns a **new builder instance** via internal `clone()` — the chain is immutable. Validators accumulate in an array and are evaluated left-to-right on `validate(value)`, returning the first error or `null`.

```typescript
// Immutable chain: each call returns a new builder
const field = s.string('')
  .required('Email is required')     // clone + append validator
  .email('Must be a valid email')    // clone + append validator
  .maxLength(100, 'Too long')        // clone + append validator
```

#### Validator Details

**String validators:**
- `required(msg?)` — rejects empty/whitespace-only strings
- `minLength(n, msg?)` — checks `value.length < n`
- `maxLength(n, msg?)` — checks `value.length > n`
- `email(msg?)` — regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; passes on empty string (pair with `required()` for strict)
- `pattern(regex, msg?)` — custom regex; passes on empty string
- `oneOf(options[], msg?)` — checks value is in allowed list
- `refine(fn, msg?)` — custom predicate function

**Number validators:**
- `required(msg?)` — rejects `NaN`
- `min(n, msg?)` — checks `value < n`
- `max(n, msg?)` — checks `value > n`
- `refine(fn, msg?)` — custom predicate

**Boolean validators:**
- `required(msg?)` — rejects `false`
- `refine(fn, msg?)` — custom predicate

#### Nested Groups

`s.group(shape)` creates a `GroupFieldSchema` with a `__group: true` marker. The `isGroupSchema()` type guard detects groups during recursive traversal. Groups can nest arbitrarily deep.

#### Validation Functions

| Function | Purpose |
|----------|---------|
| `getInitialValues(schema)` | Recursively extracts initial values from schema |
| `validateAll(values, schema)` | Validates all fields recursively, returns `FormErrors<S>` |
| `isFormValid(errors)` | Recursively checks all errors are `null` |
| `mergeWithCrossFieldErrors(fieldErrors, validators, values)` | Overlays cross-field errors onto fields where field-level passed |

#### Recursive Type System

```typescript
// Values: schema shape → actual values
type FormValues<S> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormValues<Inner>        // recurse into group
    : S[K] extends FieldSchema<infer T>
      ? T                      // extract field type
      : never
}

// Errors: same shape, all leaves are string | null
type FormErrors<S> = { [K in keyof S]: ... string | null | FormErrors<Inner> }

// Touched: same shape, all leaves are boolean
type FormTouched<S> = { [K in keyof S]: ... boolean | FormTouched<Inner> }
```

---

### 2. `form.ts` (494 lines) — Form State Machine & Groups

#### Actions (Discriminated Union)

```typescript
type FormAction<S> =
  | { type: 'SET_VALUE';        field: keyof S; value: ... }
  | { type: 'SET_NESTED_VALUE'; path: string; value: unknown }
  | { type: 'TOUCH';            field: keyof S }
  | { type: 'TOUCH_NESTED';     path: string }
  | { type: 'TOUCH_ALL' }
  | { type: 'RESET' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END';       ok: boolean }
```

#### State Shape

```typescript
interface FormState<S> {
  values: FormValues<S>       // Current field values
  touched: FormTouched<S>     // Which fields have been interacted with
  submitting: boolean         // Between submit() and submitEnd()
  submitted: boolean          // Whether form has been submitted at least once
}
```

#### Reducer Behavior

| Action | Effect |
|--------|--------|
| `SET_VALUE` | Shallow-copies values, updates one top-level field |
| `SET_NESTED_VALUE` | Uses `deepSet()` to immutably update at a dot-notation path |
| `TOUCH` | Marks one top-level field as touched |
| `TOUCH_NESTED` | Uses `deepSet()` to mark a nested field as touched |
| `TOUCH_ALL` | Recursively marks every field (including nested) as touched |
| `RESET` | Returns to initial state (values, touched, submitting, submitted all reset) |
| `SUBMIT_START` | Sets `submitting: true`, `submitted: true` |
| `SUBMIT_END` | Sets `submitting: false` |

#### `createForm<S>(schema, options?): Form<S>`

The main factory. Internally uses the same `Subject` → `scan` → `shareReplay` pattern as `@rxjs-spa/store`.

**Form interface:**

| Member | Type | Description |
|--------|------|-------------|
| `values$` | `Observable<FormValues<S>>` | All current values |
| `errors$` | `Observable<FormErrors<S>>` | Computed from values on every change (field + cross-field) |
| `touched$` | `Observable<FormTouched<S>>` | Interaction tracking |
| `valid$` | `Observable<boolean>` | Derived from errors (true when all null) |
| `submitting$` | `Observable<boolean>` | True between `submit()` and `submitEnd()` |
| `actions$` | `Observable<FormAction<S>>` | Raw action stream (for effects) |
| `field(name)` | `FieldControl<T>` | Per-field observables |
| `setValue(name, value)` | `void` | Dispatch SET_VALUE |
| `setTouched(name)` | `void` | Dispatch TOUCH |
| `submit()` | `void` | TOUCH_ALL + SUBMIT_START |
| `submitEnd(ok)` | `void` | Dispatch SUBMIT_END |
| `reset()` | `void` | Dispatch RESET |
| `getValues()` | `FormValues<S>` | Synchronous snapshot |
| `getErrors()` | `FormErrors<S>` | Synchronous validation |
| `isValid()` | `boolean` | Synchronous validity check |
| `group(name)` | `FormGroup<Inner>` | Scoped view into nested group |

#### `FieldControl<T>`

Per-field observable interface returned by `form.field(name)`:

```typescript
interface FieldControl<T> {
  value$:     Observable<T>              // Current value
  error$:     Observable<string | null>  // Always emits current error
  touched$:   Observable<boolean>        // Whether field was interacted with
  dirty$:     Observable<boolean>        // Whether value differs from initial
  showError$: Observable<string | null>  // Error only after touch (UX-friendly)
}
```

`showError$` is the key UX feature — it combines `error$` and `touched$`:

```typescript
combineLatest([error$, touched$]).pipe(
  map(([error, touched]) => touched ? error : null)
)
```

This prevents showing validation errors on pristine fields.

#### Form Groups

`form.group(name)` returns a `FormGroup<Inner>` scoped to a nested group in the schema. It shares the same `FormAccessor` interface as the root form (`field()`, `setValue()`, `setTouched()`) plus scoped `values$`, `errors$`, `touched$`, `valid$`.

Groups use dot-notation paths internally (`SET_NESTED_VALUE` with `deepSet()`) but expose a flat API to consumers:

```typescript
const form = createForm({
  user: s.group({
    name: s.string('').required(),
    address: s.group({
      city: s.string('').required(),
    }),
  }),
})

const user = form.group('user')
const addr = user.group('address')

addr.field('city').value$         // Observable<string>
addr.setValue('city', 'New York') // dispatches SET_NESTED_VALUE path="user.address.city"
addr.valid$                       // only reflects address validity
form.valid$                       // reflects entire form including nested groups
```

#### Cross-Field Validation

Configured via `FormOptions.validators`:

```typescript
const form = createForm(schema, {
  validators: [
    (values) => {
      if (values.password !== values.confirm) {
        return { confirm: 'Passwords must match' }
      }
      return {}
    },
  ],
})
```

- Validators receive the entire `FormValues<S>` object
- Return a dict of field names → error messages (empty entries ignored)
- Only applied to fields where field-level validation already passed
- Multiple validators compose: each processes in sequence, accumulating errors

---

### 3. `binders.ts` (157 lines) — Two-Way DOM Binding

Five functions that wire DOM elements to form state bidirectionally.

#### `bindInput(input, form, name): Subscription`

Two-way binding for `<input>` and `<textarea>`:
- **Form → DOM:** subscribes to `field.value$`, syncs `input.value` (skips if unchanged to preserve cursor position)
- **DOM → Form:** listens to `input` events, calls `form.setValue(name, input.value)`
- **Touch:** listens to `blur` events, calls `form.setTouched(name)`

#### `bindCheckbox(input, form, name): Subscription`

Two-way binding for `<input type="checkbox">` and radio:
- **Form → DOM:** subscribes to `field.value$`, syncs `input.checked`
- **DOM → Form:** listens to `change` events, calls `form.setValue(name, input.checked)`
- **Touch:** listens to `blur` events

#### `bindSelect(select, form, name): Subscription`

Two-way binding for `<select>`:
- **Form → DOM:** subscribes to `field.value$`, syncs `select.value`
- **DOM → Form:** listens to `change` events, calls `form.setValue(name, select.value)`
- **Touch:** listens to `blur` events

#### `bindError(el, error$): Subscription`

One-way error display:
- Sets `el.textContent` to the error message (or empty string)
- Toggles `has-error` CSS class for styling

#### `bindField(container, form, name): Subscription`

Convenience function that auto-discovers elements within a container and binds everything:
- Queries for: `input:not([type="checkbox"]):not([type="radio"]), textarea` → `bindInput`
- Queries for: `input[type="checkbox"], input[type="radio"]` → `bindCheckbox`
- Queries for: `select` → `bindSelect`
- Queries for: `.field-error` → `bindError` with `showError$`
- Returns composite subscription

```html
<div class="email-field">
  <input type="email" />
  <span class="field-error"></span>
</div>
```

```typescript
bindField(document.querySelector('.email-field'), form, 'email')
// Auto-binds input + error display
```

---

## Submission Flow

```
form.submit()
    │
    ├── TOUCH_ALL (marks every field touched → shows all errors)
    └── SUBMIT_START (submitting$ = true)
            │
            ▼
        actions$.pipe(
          filter(a => a.type === 'SUBMIT_START'),
          switchMap(() => {
            if (!form.isValid()) return EMPTY
            return http.post('/api', form.getValues())
          }),
        ).subscribe({
          next: () => form.submitEnd(true),
          error: () => form.submitEnd(false),
        })
            │
            ▼
        SUBMIT_END (submitting$ = false)
            │
            ▼
        form.reset()  (optional: clear form after success)
```

---

## Validation Lifecycle

```
User types in email field
    │
    ▼
form.setValue('email', 'bad')
    │
    ▼
SET_VALUE action → reducer → new state.values
    │
    ▼
values$ emits { email: 'bad', ... }
    │
    ▼
errors$ recomputes:
  1. validateAll(values, schema)           → { email: 'Invalid email', ... }
  2. mergeWithCrossFieldErrors(...)        → overlay cross-field errors
    │
    ▼
valid$ emits false
    │
    ▼
field('email').error$ emits 'Invalid email'
    │
    ▼
field('email').showError$ emits:
  - null (if field not yet touched)
  - 'Invalid email' (if field has been touched)
```

**Key points:**
- Validation runs on every value change (no debounce, no async)
- Errors are computed lazily from the values stream (not stored in state)
- Cross-field errors only overlay on fields where field-level validation passed
- `showError$` gates error display behind touch state (UX)

---

## Design Decisions

### 1. Lazy Validation (Computed, Not Stored)

Errors are derived from `values$` via `map(validateAll)` rather than stored in the reducer state. This means validation always runs against current values — no stale errors possible. The tradeoff is that validation runs on every value change, but since validators are synchronous and typically fast, this is acceptable.

### 2. Touch-Gated Error Display

`showError$` combines `error$` and `touched$` to only reveal errors after user interaction. This prevents overwhelming users with a wall of red on initial render. `submit()` dispatches `TOUCH_ALL` to force-show all errors at submission time.

### 3. Immutable Builder Chain

Schema builders (`s.string().required().email()`) clone on each method call, accumulating validators immutably. This prevents accidental mutation if a builder is reused across multiple fields.

### 4. Same MVU Pattern as Store

The form uses `Subject` → `scan` → `shareReplay` internally, the same pipeline as `@rxjs-spa/store`. A `BehaviorSubject` provides synchronous access via `getValues()`, `getErrors()`, `isValid()`. This consistency across the framework reduces cognitive load.

### 5. Binder Cursor Preservation

`bindInput` only writes to `input.value` if it differs from the form state. This prevents resetting the cursor position mid-typing — a common pitfall in two-way binding systems.

### 6. Group Scoping via Dot Paths

Nested form groups dispatch `SET_NESTED_VALUE` with dot-notation paths (`user.address.city`). The `deepSet()` helper immutably updates the nested state. Groups expose a flat API while the internal machinery handles path construction.

---

## Test Coverage

| Suite | Tests | Key Scenarios |
|-------|-------|---------------|
| Schema validators (string) | 8 | required, minLength, maxLength, email, oneOf, pattern, refine, chaining |
| Schema validators (number) | 4 | min, max, required, refine |
| Schema validators (boolean) | 2 | required, refine |
| validateAll / isFormValid | 2 | Batch validation, nested validity |
| Form creation & lifecycle | 10 | Init from schema, setValue, errors$, valid$, showError$, dirty$, submit, submitting$, reset |
| Binders | 6 | bindInput (bidirectional + blur), bindCheckbox, bindSelect, bindError, bindField |
| Cross-field validation | 8 | Password mismatch, field-level precedence, multiple validators, reactive updates, showError$ |
| Nested form groups | 14 | group(), field(), setValue, setTouched, showError$, dirty$, valid$ (scoped), form.valid$ (whole), submit touches nested, reset resets nested, getErrors, isValid |
| Binders with groups | 2 | bindInput + bindField with FormGroup |
| Multi-level nesting | 2 | Group within group, arbitrary depth field access |
| Cross-field + nested | 2 | Cross-field validators accessing nested values |

**Total: 50+ tests** covering the full API surface including edge cases.

---

## File Map

```
packages/forms/
  package.json              Package metadata, peer dep (rxjs)
  vite.config.ts            Vite library build (ES + CJS), rxjs external
  vitest.config.ts          jsdom test environment
  tsconfig.json             Type-checking config (noEmit)
  tsconfig.build.json       Declaration-only emission to dist/
  src/
    index.ts                Barrel re-export (1 line)
    public.ts               Public API aggregator (3 lines)
    schema.ts               Schema builders & validation (286 lines)
    form.ts                 Form state machine & groups (494 lines)
    binders.ts              Two-way DOM binding (157 lines)
    public.test.ts          Complete test suite (960 lines, 50+ tests)
```

---

## API Surface Summary

**Schema:**
- `s.string(initial?)`, `s.number(initial?)`, `s.boolean(initial?)`, `s.group(shape)`
- Chainable validators: `required`, `minLength`, `maxLength`, `email`, `pattern`, `oneOf`, `min`, `max`, `refine`

**Form:**
- `createForm<S>(schema, options?): Form<S>`
- `Form<S>` — `values$`, `errors$`, `touched$`, `valid$`, `submitting$`, `actions$`, `field()`, `setValue()`, `setTouched()`, `submit()`, `submitEnd()`, `reset()`, `getValues()`, `getErrors()`, `isValid()`, `group()`
- `FieldControl<T>` — `value$`, `error$`, `touched$`, `dirty$`, `showError$`
- `FormGroup<S>` — scoped view with same `field()`, `setValue()`, `setTouched()`, `group()`, `values$`, `errors$`, `touched$`, `valid$`

**Binders:**
- `bindInput(input, form, name): Subscription`
- `bindCheckbox(input, form, name): Subscription`
- `bindSelect(select, form, name): Subscription`
- `bindError(el, error$): Subscription`
- `bindField(container, form, name): Subscription`

**Types:**
- `Validator<T>`, `FieldSchema<T>`, `GroupFieldSchema<S>`, `SchemaShape`
- `FormValues<S>`, `FormErrors<S>`, `FormTouched<S>`, `FormValidator<S>`
- `FormAction<S>`, `FormState<S>`, `FormOptions<S>`
- `FieldControl<T>`, `FormAccessor<S>`, `FormGroup<S>`, `Form<S>`

---

## Summary

`@rxjs-spa/forms` is a comprehensive reactive forms library (~940 lines) that brings schema-based validation, two-way DOM binding, nested form groups, and cross-field validation to the rxjs-spa framework. It uses the same MVU reducer pattern as `@rxjs-spa/store` — actions dispatched through a Subject, reduced via scan, multicasted via shareReplay. The fluent schema builder (`s.string().required().email()`) provides an ergonomic API for defining field types and validators, while `FieldControl` observables (`value$`, `error$`, `touched$`, `dirty$`, `showError$`) enable fine-grained reactive UI binding. The touch-gated `showError$` pattern and auto-discovery `bindField` binder make form UX straightforward, and arbitrarily nested `s.group()` schemas with scoped `FormGroup` views handle complex form structures without complexity leaking into the API.
