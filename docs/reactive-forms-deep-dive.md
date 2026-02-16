# @rxjs-spa/forms — Reactive Forms Deep Dive

A complete, step-by-step explanation of how reactive forms work in `rxjs-spa` — from schema definition to two-way DOM binding. Covers the schema builder system, validation pipeline, form state management, nested groups, cross-field validation, DOM binders, and real-world integration with stores and HTTP.

---

## Table of Contents

1. [Validator Foundation](#step-1-validator-foundation)
2. [Schema Builder System — `s.string()`, `s.number()`, `s.boolean()`](#step-2-schema-builder-system--sstring-snumber-sboolean)
3. [Type Inference — `FormValues`, `FormErrors`, `FormTouched`](#step-3-type-inference--formvalues-formerrors-formtouched)
4. [Nested Groups — `s.group()`](#step-4-nested-groups--sgroup)
5. [`createForm()` — Full Implementation](#step-5-createform--full-implementation)
6. [Internal Reducer & Actions](#step-6-internal-reducer--actions)
7. [Derived State Streams — `values$`, `errors$`, `valid$`, `touched$`](#step-7-derived-state-streams--values-errors-valid-touched)
8. [`FieldControl` — Per-Field Observable Set](#step-8-fieldcontrol--per-field-observable-set)
9. [The `showError$` Pattern — UX-Friendly Error Display](#step-9-the-showerror-pattern--ux-friendly-error-display)
10. [Validation Pipeline — When and How Validation Runs](#step-10-validation-pipeline--when-and-how-validation-runs)
11. [Cross-Field Validation — `mergeWithCrossFieldErrors()`](#step-11-cross-field-validation--mergewithcrossfielderrors)
12. [Nested Form Groups — `form.group()`](#step-12-nested-form-groups--formgroup)
13. [Submit Flow — `submit()`, `submitEnd()`, `reset()`](#step-13-submit-flow--submit-submitend-reset)
14. [DOM Binders — Two-Way Binding](#step-14-dom-binders--two-way-binding)
15. [Integration with Stores and HTTP — The Effects Pattern](#step-15-integration-with-stores-and-http--the-effects-pattern)
16. [Real-World Patterns — Demo App](#step-16-real-world-patterns--demo-app)
17. [Architecture Summary](#step-17-architecture-summary)

---

## Step 1: Validator Foundation

### The Validator Type

At the core of the forms system is a simple function type:

```typescript
export type Validator<T> = (value: T) => string | null
```

A validator is a **pure function** that takes a value and returns either:

- A **string** — the error message (validation failed)
- **`null`** — no error (validation passed)

This simple signature enables function composition and makes validators trivially testable:

```typescript
const required: Validator<string> = (v) => (v.trim().length === 0 ? 'Required' : null)
const minLength =
  (min: number): Validator<string> =>
  (v) =>
    v.length < min ? `At least ${min} characters` : null

// Test directly:
required('') // 'Required'
required('hello') // null
minLength(5)('hi') // 'At least 5 characters'
minLength(5)('hello') // null
```

### The FieldSchema Interface

Every form field implements `FieldSchema<T>`:

```typescript
export interface FieldSchema<T> {
  readonly initial: T // The default value
  readonly validators: ReadonlyArray<Validator<T>> // Validation functions in order
  validate(value: T): string | null // Run all validators, return first error
}
```

The `validate()` method walks the validators array **left-to-right** and returns the **first non-null result**:

```typescript
validate(value: T): string | null {
  for (const v of this.validators) {
    const error = v(value)
    if (error !== null) return error  // First error wins
  }
  return null
}
```

This means you can chain `.required().minLength(2)` — if `required` fails, `minLength` never runs.

---

## Step 2: Schema Builder System — `s.string()`, `s.number()`, `s.boolean()`

### The Fluent Builder Pattern

Each field type has a builder that supports chaining. Every chainable method **clones** the builder and appends a new validator — the builder is immutable:

```typescript
const nameField = s.string('').required('Name is required').minLength(2, 'Too short')
// Creates: StringFieldBuilder {
//   initial: '',
//   validators: [requiredValidator, minLengthValidator(2)]
// }
```

### `StringFieldBuilder` — `s.string(initial)`

```typescript
s.string(initial?: string)
```

Available chainable validators:

| Method | Check | Notes |
| --- | --- | --- |
| `.required(message?)` | `v.trim().length === 0` | Empty or whitespace-only fails |
| `.minLength(min, message?)` | `v.length < min` | Character count |
| `.maxLength(max, message?)` | `v.length > max` | Character count |
| `.email(message?)` | Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Allows empty string (use `.required()` to forbid) |
| `.pattern(regex, message?)` | `!regex.test(v)` | Allows empty string |
| `.oneOf(options[], message?)` | `!options.includes(v)` | Whitelist validation |
| `.refine(fn, message?)` | `!fn(v)` | Custom boolean predicate |

**Example:**

```typescript
const emailField = s
  .string('')
  .required('Email is required')
  .email('Enter a valid email address')

emailField.validate('') // 'Email is required'      ← required fires first
emailField.validate('abc') // 'Enter a valid email'  ← email fires second
emailField.validate('a@b.com') // null                ← all pass
```

### `NumberFieldBuilder` — `s.number(initial)`

```typescript
s.number(initial?: number)
```

| Method | Check |
| --- | --- |
| `.required(message?)` | `isNaN(v)` |
| `.min(min, message?)` | `v < min` |
| `.max(max, message?)` | `v > max` |
| `.refine(fn, message?)` | `!fn(v)` |

### `BooleanFieldBuilder` — `s.boolean(initial)`

```typescript
s.boolean(initial?: boolean)
```

| Method | Check |
| --- | --- |
| `.required(message?)` | `!v` (must be `true`) |
| `.refine(fn, message?)` | `!fn(v)` |

### Internal Clone Mechanism

Each chainable method returns a **new instance** with the validator appended:

```typescript
class StringFieldBuilder {
  constructor(
    readonly initial: string,
    readonly validators: ReadonlyArray<Validator<string>> = [],
  ) {}

  private clone(v: Validator<string>): StringFieldBuilder {
    return new StringFieldBuilder(this.initial, [...this.validators, v])
  }

  required(message = 'Required'): StringFieldBuilder {
    return this.clone((v) => (v.trim().length === 0 ? message : null))
  }

  minLength(min: number, message?: string): StringFieldBuilder {
    return this.clone((v) =>
      v.length < min ? (message ?? `At least ${min} characters`) : null,
    )
  }

  // ... other methods follow same pattern
}
```

The builder is immutable — each call creates a new object. You can safely branch:

```typescript
const base = s.string('').required()
const nameField = base.minLength(2) // base not modified
const codeField = base.pattern(/^[A-Z]+$/) // base not modified
```

---

## Step 3: Type Inference — `FormValues`, `FormErrors`, `FormTouched`

### `FormValues<S>` — Recursively Extract Value Types

```typescript
type FormValues<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormValues<Inner> // Recurse for groups
    : S[K] extends FieldSchema<infer T>
      ? T // Extract T from FieldSchema<T>
      : never
}
```

**Example:**

```typescript
const schema = {
  name: s.string(''),
  age: s.number(0),
  agreed: s.boolean(false),
  address: s.group({
    city: s.string(''),
    zip: s.string(''),
  }),
}

type Values = FormValues<typeof schema>
// {
//   name: string
//   age: number
//   agreed: boolean
//   address: {
//     city: string
//     zip: string
//   }
// }
```

### `FormErrors<S>` — Same Shape, All `string | null`

```typescript
type FormErrors<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormErrors<Inner>
    : string | null
}
```

For the schema above:

```typescript
// {
//   name: string | null
//   age: string | null
//   agreed: string | null
//   address: {
//     city: string | null
//     zip: string | null
//   }
// }
```

### `FormTouched<S>` — Same Shape, All `boolean`

```typescript
type FormTouched<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormTouched<Inner>
    : boolean
}
```

These three mapped types ensure **complete type safety** throughout the entire form lifecycle — from schema definition to error display.

---

## Step 4: Nested Groups — `s.group()`

### Definition

```typescript
export interface GroupFieldSchema<S extends SchemaShape> {
  readonly __group: true // Runtime marker
  readonly shape: S // Nested schema
}
```

Created via:

```typescript
s.group({
  street: s.string('').required(),
  city: s.string('').required(),
})
```

The `__group: true` marker allows runtime detection via `isGroupSchema(entry)` — needed to distinguish groups from leaf fields during validation and value extraction.

### Nesting Can Go Multiple Levels Deep

```typescript
const schema = {
  name: s.string(''),
  address: s.group({
    street: s.string(''),
    city: s.string(''),
    geo: s.group({
      lat: s.number(0),
      lng: s.number(0),
    }),
  }),
}
```

---

## Step 5: `createForm()` — Full Implementation

### Signature

```typescript
export function createForm<S extends SchemaShape>(
  schema: S,
  options?: {
    validators?: FormValidator<S>[] // Cross-field validators
  },
): Form<S>
```

### Internal Architecture

The form uses the **exact same pattern** as `createStore` from `@rxjs-spa/store`:

```typescript
const actionsSubject = new Subject<FormAction<S>>()
const stateBs = new BehaviorSubject<FormState<S>>(initialState)

const actions$ = actionsSubject.asObservable()

const state$ = actionsSubject.pipe(
  scan(reducer, initialState),
  startWith(initialState),
  shareReplay({ bufferSize: 1, refCount: false }),
)

// Keep BehaviorSubject in sync for synchronous access
state$.subscribe((s) => stateBs.next(s))

function dispatch(action: FormAction<S>): void {
  actionsSubject.next(action)
}
```

**Why this pattern?**

- `Subject` → `scan` → `startWith` → `shareReplay(1)` gives:
  - Latest state cached for all new subscribers (multicast)
  - Late subscribers get initial state immediately
  - BehaviorSubject backup allows `getValues()`, `getErrors()`, `isValid()` to work synchronously
  - `refCount: false` ensures `state$` stays alive even when field streams unsubscribe

### Initial State Construction

```typescript
const initialValues = getInitialValues(schema)
// Recursively walks schema, calls .initial on leaf fields
// For groups, recursively calls itself on entry.shape

const initialTouched = getInitialTouched(schema)
// Same shape, all values set to false

const initialState: FormState<S> = {
  values: initialValues,
  touched: initialTouched,
  submitting: false,
  submitted: false,
}
```

---

## Step 6: Internal Reducer & Actions

### FormState

```typescript
interface FormState<S extends SchemaShape> {
  values: FormValues<S>    // Current form values
  touched: FormTouched<S>  // Which fields have been focused + blurred
  submitting: boolean      // True between submit() and submitEnd()
  submitted: boolean       // Has form been submitted at least once
}
```

### FormAction — All Possible Actions

```typescript
type FormAction<S extends SchemaShape> =
  | { type: 'SET_VALUE'; field: keyof S; value: FormValues<S>[keyof S] }
  | { type: 'SET_NESTED_VALUE'; path: string; value: unknown }
  | { type: 'TOUCH'; field: keyof S }
  | { type: 'TOUCH_NESTED'; path: string }
  | { type: 'TOUCH_ALL' }
  | { type: 'RESET' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END'; ok: boolean }
```

### Reducer Implementation

```typescript
function formReducer<S extends SchemaShape>(schema: S) {
  return (state: FormState<S>, action: FormAction<S>): FormState<S> => {
    switch (action.type) {
      case 'SET_VALUE':
        return {
          ...state,
          values: { ...state.values, [action.field]: action.value },
        }

      case 'SET_NESTED_VALUE':
        return {
          ...state,
          values: deepSet(state.values, parsePath(action.path), action.value),
        }

      case 'TOUCH':
        return {
          ...state,
          touched: { ...state.touched, [action.field]: true },
        }

      case 'TOUCH_NESTED':
        return {
          ...state,
          touched: deepSet(state.touched, parsePath(action.path), true),
        }

      case 'TOUCH_ALL':
        return {
          ...state,
          touched: touchAll(schema), // Recursively set all leaves to true
        }

      case 'RESET':
        return {
          values: getInitialValues(schema),
          touched: getInitialTouched(schema),
          submitting: false,
          submitted: false,
        }

      case 'SUBMIT_START':
        return { ...state, submitting: true, submitted: false }

      case 'SUBMIT_END':
        return { ...state, submitting: false, submitted: true }

      default:
        return state
    }
  }
}
```

### Deep Path Helpers

For nested group updates, the form uses dotted path utilities:

```typescript
parsePath('address.city')
// → ['address', 'city']

deepSet({ address: { city: 'LA' } }, ['address', 'city'], 'NYC')
// → { address: { city: 'NYC' } }

deepGet({ address: { city: 'NYC' } }, ['address', 'city'])
// → 'NYC'
```

These enable nested groups to dispatch actions like `SET_NESTED_VALUE` with path `'address.city'` that update the correct nested location in the flat state tree.

---

## Step 7: Derived State Streams — `values$`, `errors$`, `valid$`, `touched$`

All derived streams use a `select()` helper that maps from `state$` and deduplicates:

```typescript
function select<T>(selector: (state: FormState<S>) => T): Observable<T> {
  return state$.pipe(map(selector), distinctUntilChanged())
}
```

### `values$`

```typescript
const values$ = select((s) => s.values) // FormValues<S>
```

Emits whenever any field value changes. Used as the source for the validation pipeline.

### `touched$`

```typescript
const touched$ = select((s) => s.touched) // FormTouched<S>
```

Emits whenever any field's touched state changes.

### `submitting$`

```typescript
const submitting$ = select((s) => s.submitting) // boolean
```

`true` between `submit()` and `submitEnd()`. Used to disable submit buttons.

### `errors$` — The Validation Pipeline

```typescript
const errors$ = values$.pipe(
  map((values) => {
    // Run field-level validation on all fields
    const fieldErrors = validateAll(values, schema)

    // Merge cross-field validation (if configured)
    if (options?.validators?.length) {
      return mergeWithCrossFieldErrors(fieldErrors, options.validators, values)
    }
    return fieldErrors
  }),
  distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
)
```

**Key detail**: `errors$` derives from `values$`, not directly from actions. Every value change triggers validation — on every keystroke, every blur, every programmatic update.

### `valid$`

```typescript
const valid$ = errors$.pipe(map(isFormValid), distinctUntilChanged())
```

`isFormValid` recursively checks if all errors are `null`:

```typescript
function isFormValid(errors: Record<string, unknown>): boolean {
  return Object.values(errors).every((e) => {
    if (e !== null && typeof e === 'object') return isFormValid(e as Record<string, unknown>)
    return e === null
  })
}
```

---

## Step 8: `FieldControl` — Per-Field Observable Set

When you call `form.field(name)`, you get a `FieldControl`:

```typescript
export interface FieldControl<T> {
  value$: Observable<T>
  error$: Observable<string | null>
  touched$: Observable<boolean>
  dirty$: Observable<boolean>
  showError$: Observable<string | null>
}
```

### How Each Stream Is Built

**`value$`** — Slice of form values for this field:

```typescript
value$ = values$.pipe(
  map((v) => v[name]),
  distinctUntilChanged(),
)
```

Emits whenever this specific field's value changes. `distinctUntilChanged` with strict equality prevents re-emissions when other fields change.

**`error$`** — Validation error for this field:

```typescript
// Leaf field:
error$ = errors$.pipe(
  map((e) => e[name] as string | null),
  distinctUntilChanged(),
)

// Group field:
error$ = errors$.pipe(
  map((e) => (isFormValid({ [name]: e[name] }) ? null : 'Group has errors')),
  distinctUntilChanged(),
)
```

**`touched$`** — Has the user interacted with this field:

```typescript
touched$ = touched$.pipe(
  map((t) => (typeof t[name] === 'boolean' ? t[name] : false)),
  distinctUntilChanged(),
)
```

Emits `true` only after `setTouched(name)` has been called (typically on blur).

**`dirty$`** — Has the value changed from initial:

```typescript
dirty$ = values$.pipe(
  map((v) => v[name] !== initialValues[name]),
  distinctUntilChanged(),
)
```

Compares current value to the initial value. Reverts to `false` if the user types back to the initial.

**`showError$`** — The UX-friendly error stream:

```typescript
showError$ = combineLatest([error$, touched$]).pipe(
  map(([error, touched]) => (touched ? error : null)),
)
```

Shows the error **only if** the field is touched AND has an error. This is the stream you bind to the DOM for error display.

---

## Step 9: The `showError$` Pattern — UX-Friendly Error Display

### The Problem

Showing validation errors immediately on page load is bad UX. The user hasn't even had a chance to fill in the field yet.

### The Solution

`showError$` combines two signals:

```
error$ ─────────┐
                ├─→ combineLatest ─→ touched ? error : null
touched$ ───────┘
```

| `error$` | `touched$` | `showError$` |
| --- | --- | --- |
| `'Required'` | `false` | `null` (hidden) |
| `'Required'` | `true` | `'Required'` (shown) |
| `null` | `true` | `null` (hidden) |
| `null` | `false` | `null` (hidden) |

### Timeline of a Typical Field Interaction

```
1. Page loads
   error$    = 'Required'     (field is empty)
   touched$  = false          (user hasn't interacted)
   showError$= null           ← No error shown

2. User focuses the field
   (nothing changes yet — focus doesn't trigger touch)

3. User types 'A'
   error$    = 'At least 2'   (too short)
   touched$  = false          (hasn't blurred yet)
   showError$= null           ← Still no error shown

4. User blurs (tabs out)
   error$    = 'At least 2'
   touched$  = true           ← Now touched
   showError$= 'At least 2'  ← Error appears!

5. User types 'Alice'
   error$    = null           (valid)
   touched$  = true
   showError$= null           ← Error disappears
```

This is standard form UX behavior — implemented declaratively with RxJS combinators.

---

## Step 10: Validation Pipeline — When and How Validation Runs

### When Validation Triggers

Validation is **fully reactive** — it runs automatically whenever `values$` emits:

```
User keystroke
    ↓
fromEvent(input, 'input')
    ↓
form.setValue('name', 'Alice')
    ↓
dispatch({ type: 'SET_VALUE', field: 'name', value: 'Alice' })
    ↓
scan(reducer) → new FormState
    ↓
state$ emits → values$ emits
    ↓
errors$ pipeline triggers:
    ├── validateAll(values, schema)      ← Field-level validation
    ├── mergeWithCrossFieldErrors(...)   ← Cross-field validation (if configured)
    └── emit FormErrors<S>
    ↓
valid$ pipeline triggers:
    └── isFormValid(errors) → boolean
```

Every keystroke triggers full validation. This is fast because validators are simple synchronous functions.

### `validateAll()` — Running All Field Validators

```typescript
function validateAll<S extends SchemaShape>(
  values: FormValues<S>,
  schema: S,
): FormErrors<S> {
  const errors: Record<string, unknown> = {}

  for (const key of Object.keys(schema)) {
    const entry = schema[key]

    if (isGroupSchema(entry)) {
      // Recurse into nested group
      errors[key] = validateAll((values as any)[key], entry.shape)
    } else {
      // Run field validators
      errors[key] = (entry as FieldSchema<unknown>).validate((values as any)[key])
    }
  }

  return errors as FormErrors<S>
}
```

Walks the schema recursively. For each leaf field, calls `.validate(value)`. For each group, recurses into the group's shape.

### Validator Execution Order

Validators in a field's array run **left-to-right**, and the **first error wins**:

```typescript
const field = s.string('').required('Required').minLength(5, 'Too short').email('Bad email')

field.validate('') // 'Required'       ← required fires, stops
field.validate('hi') // 'Too short'     ← required passes, minLength fires
field.validate('hello') // 'Bad email'  ← required + minLength pass, email fires
field.validate('a@b.co') // null        ← all pass
```

---

## Step 11: Cross-Field Validation — `mergeWithCrossFieldErrors()`

### The Problem

Some validations depend on **multiple fields** — password confirmation, date ranges, conditional requirements. Single-field validators can't express these.

### `FormValidator<S>` — Cross-Field Validator Type

```typescript
export type FormValidator<S extends SchemaShape> = (
  values: FormValues<S>,
) => Record<string, string>
```

Receives all form values. Returns a flat map of `fieldName → errorMessage` for any fields that fail cross-field validation.

### Merge Logic

```typescript
function mergeWithCrossFieldErrors<S extends SchemaShape>(
  fieldErrors: FormErrors<S>,
  validators: FormValidator<S>[],
  values: FormValues<S>,
): FormErrors<S> {
  const merged = { ...fieldErrors } as Record<string, unknown>

  for (const validator of validators) {
    const crossErrors = validator(values)
    for (const [key, message] of Object.entries(crossErrors)) {
      // Only apply if field-level validation PASSED
      if (merged[key] === null) {
        merged[key] = message
      }
    }
  }

  return merged as FormErrors<S>
}
```

**Critical rule**: Cross-field errors only apply to fields where field-level validation **passed** (`merged[key] === null`). This prevents conflicting messages — `'Required'` takes priority over `'Passwords do not match'`.

### Example: Password Confirmation

```typescript
const schema = {
  password: s.string('').required('Required').minLength(8, 'At least 8 characters'),
  confirmPassword: s.string('').required('Required'),
}

const form = createForm(schema, {
  validators: [
    (values) => {
      const errors: Record<string, string> = {}
      if (values.password !== values.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match'
      }
      return errors
    },
  ],
})
```

**Error precedence:**

| `password` | `confirmPassword` | Shown Error |
| --- | --- | --- |
| `''` | `''` | `'Required'` (field-level wins) |
| `'abc'` | `''` | `'Required'` (field-level wins) |
| `'secret123'` | `'wrong'` | `'Passwords do not match'` (cross-field) |
| `'secret123'` | `'secret123'` | `null` (all pass) |

### Example: Date Range Validation

```typescript
const form = createForm(dateSchema, {
  validators: [
    (values) => {
      const errors: Record<string, string> = {}
      if (new Date(values.endDate) <= new Date(values.startDate)) {
        errors.endDate = 'End date must be after start date'
      }
      return errors
    },
  ],
})
```

---

## Step 12: Nested Form Groups — `form.group()`

### Accessing Nested Fields

When a schema field is a group, you access it via `form.group(name)`:

```typescript
const schema = {
  name: s.string(''),
  address: s.group({
    street: s.string('').required(),
    city: s.string('').required(),
  }),
}

const form = createForm(schema)

// Root-level field:
const nameField = form.field('name') // FieldControl<string>

// Nested group:
const addressGroup = form.group('address') // FormGroup

// Field inside the group:
const cityField = addressGroup.field('city') // FieldControl<string>
```

### How FormGroup Works Internally

A `FormGroup` is a **scoped view** into the parent form — not a separate form instance:

```typescript
function createFormGroup<S extends SchemaShape>(
  schema: S,
  pathPrefix: string, // e.g., 'address'
  parentValues$: Observable<FormValues<S>>,
  parentErrors$: Observable<FormErrors<S>>,
  parentTouched$: Observable<FormTouched<S>>,
  initialValues: FormValues<S>,
  dispatchFn: (action: FormAction<any>) => void,
): FormGroup<S>
```

**Slicing parent streams:**

```typescript
// Group values$ = parent values sliced to this group
values$ = parentValues$.pipe(
  map((v) => v[groupName]),
  distinctUntilChanged(),
)

// Group errors$ = parent errors sliced to this group
errors$ = parentErrors$.pipe(
  map((e) => e[groupName]),
  distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
)
```

**Dispatching with dotted paths:**

```typescript
// addressGroup.setValue('city', 'NYC')
// Internally dispatches:
dispatch({
  type: 'SET_NESTED_VALUE',
  path: 'address.city', // pathPrefix + '.' + fieldName
  value: 'NYC',
})
```

The root form's reducer uses `deepSet()` to update the correct nested location.

### Multi-Level Nesting

Groups can nest arbitrarily deep:

```typescript
const schema = {
  user: s.group({
    name: s.string(''),
    address: s.group({
      city: s.string(''),
    }),
  }),
}

const form = createForm(schema)
const user = form.group('user')
const addr = user.group('address')
addr.setValue('city', 'NYC')
// Dispatches: { type: 'SET_NESTED_VALUE', path: 'user.address.city', value: 'NYC' }
```

### Group-Level Validity

Each group has its own `valid$` stream:

```typescript
form.valid$ // True only if ALL fields valid (including nested)
addressGroup.valid$ // True only if street AND city valid
```

---

## Step 13: Submit Flow — `submit()`, `submitEnd()`, `reset()`

### `submit()`

```typescript
submit(): void {
  dispatch({ type: 'TOUCH_ALL' })    // Show all errors immediately
  dispatch({ type: 'SUBMIT_START' }) // Set submitting = true
}
```

`submit()` does **two things**:

1. **Touches all fields** — so `showError$` reveals errors on every field, even ones the user hasn't interacted with
2. **Dispatches `SUBMIT_START`** — sets `submitting = true`, which effects can observe

`submit()` does **NOT** check validity automatically. This is intentional — the effect handles validation and decides whether to proceed.

### `submitEnd(ok: boolean)`

```typescript
submitEnd(ok: boolean): void {
  dispatch({ type: 'SUBMIT_END', ok }) // submitted = true, submitting = false
}
```

Called by the submit effect to end the submit process. `ok` indicates success or failure.

### `reset()`

```typescript
reset(): void {
  dispatch({ type: 'RESET' })
}
```

Restores the form to its initial state:

- `values` → initial values from schema
- `touched` → all `false`
- `submitting` → `false`
- `submitted` → `false`

All derived streams (`errors$`, `valid$`, `showError$`) update automatically.

### Synchronous Accessors

```typescript
getValues(): FormValues<S> {
  return stateBs.value.values
}

getErrors(): FormErrors<S> {
  // Re-validates from current values (not cached)
  const fieldErrors = validateAll(stateBs.value.values, schema)
  if (options?.validators?.length) {
    return mergeWithCrossFieldErrors(fieldErrors, options.validators, stateBs.value.values)
  }
  return fieldErrors
}

isValid(): boolean {
  return isFormValid(this.getErrors())
}
```

These are **synchronous** — critical for effects that need to check validity before deciding to make an API call.

---

## Step 14: DOM Binders — Two-Way Binding

All binders return a `Subscription` for lifecycle management. Unsubscribing removes all event listeners and stops all Observable subscriptions.

### `bindInput()` — Text, Email, Tel, Textarea

```typescript
function bindInput<S extends SchemaShape, K extends keyof S>(
  input: HTMLInputElement | HTMLTextAreaElement,
  form: FormAccessor<S>,
  name: K,
): Subscription
```

**Three-directional wiring:**

```
┌─────────────────────────────────────────┐
│                                         │
│   Store → DOM (value$)                  │
│   field.value$.subscribe(v => {         │
│     if (input.value !== String(v))      │
│       input.value = String(v)           │  ← Guards against unnecessary writes
│   })                                    │
│                                         │
│   DOM → Store (input event)             │
│   fromEvent(input, 'input').subscribe(  │
│     () => form.setValue(name, input.value│
│   ))                                    │
│                                         │
│   DOM → Touch (blur event)              │
│   fromEvent(input, 'blur').subscribe(   │
│     () => form.setTouched(name)         │
│   ))                                    │
│                                         │
└─────────────────────────────────────────┘
```

**Guard against unnecessary writes**: `if (input.value !== String(v))` prevents setting the DOM value when it's already correct. This avoids cursor position issues (setting `input.value` resets the cursor to the end).

### `bindCheckbox()` — Checkbox and Radio

```typescript
function bindCheckbox<S extends SchemaShape, K extends keyof S>(
  input: HTMLInputElement,
  form: FormAccessor<S>,
  name: K,
): Subscription
```

**Store → DOM:**

```typescript
field.value$.subscribe((v) => {
  input.checked = Boolean(v)
})
```

**DOM → Store:**

```typescript
fromEvent(input, 'change').subscribe(() => {
  form.setValue(name, input.checked as FormValues<S>[K])
})
```

Uses `change` event (not `input`) because checkboxes fire `change` on click.

### `bindSelect()` — Select Dropdowns

```typescript
function bindSelect<S extends SchemaShape, K extends keyof S>(
  select: HTMLSelectElement,
  form: FormAccessor<S>,
  name: K,
): Subscription
```

Similar to `bindInput`: guards against unnecessary writes, listens to `change` event, touches on blur.

### `bindError()` — Error Display

```typescript
function bindError(el: HTMLElement, error$: Observable<string | null>): Subscription {
  return error$.subscribe((err) => {
    el.textContent = err ?? ''
    if (err) {
      el.classList.add('has-error')
    } else {
      el.classList.remove('has-error')
    }
  })
}
```

Typically called with `field.showError$` so errors only appear after the field is touched:

```typescript
const nameField = form.field('name')
bindError(errorEl, nameField.showError$)
```

### `bindField()` — Convenience Composite

```typescript
function bindField<S extends SchemaShape, K extends keyof S>(
  container: HTMLElement,
  form: FormAccessor<S>,
  name: K,
): Subscription
```

Queries the container for common form elements and auto-binds them:

- `input:not([type="checkbox"]):not([type="radio"]), textarea` → `bindInput`
- `input[type="checkbox"], input[type="radio"]` → `bindCheckbox`
- `select` → `bindSelect`
- `.field-error` → `bindError` with `showError$`

All found elements are combined into a single `Subscription`. Highly practical for standard HTML field containers:

```html
<div class="field">
  <label>Name</label>
  <input type="text" />
  <span class="field-error"></span>
</div>
```

```typescript
bindField(container.querySelector('.field')!, form, 'name')
// Automatically binds the input + error span
```

---

## Step 15: Integration with Stores and HTTP — The Effects Pattern

### Form `actions$` Stream

Just like `store.actions$`, the form exposes an `actions$` Observable that emits every action dispatched to the form. This is where you wire submit effects:

```typescript
form.actions$.pipe(
  ofType('SUBMIT_START'),
  exhaustMap(() => {
    // Check validity
    if (!form.isValid()) {
      form.submitEnd(false)
      return of(null)
    }

    // Make API call
    const values = form.getValues()
    return http.post('/api/submit', values).pipe(
      map((res) => {
        form.submitEnd(true)
        return res
      }),
      catchError((err) => {
        form.submitEnd(false)
        return of(null)
      }),
    )
  }),
)
```

### Why `exhaustMap`?

`exhaustMap` **ignores** new `SUBMIT_START` actions while a previous submit is in-flight. This prevents double-submit without needing to check `submitting$` manually.

### Integration with Store

Forms can dispatch actions to a global store on submit:

```typescript
form.actions$
  .pipe(
    ofType('SUBMIT_START'),
    exhaustMap(() => {
      if (!form.isValid()) {
        form.submitEnd(false)
        return of(null)
      }
      const { username, password } = form.getValues()
      return api.auth.login({ username, password }).pipe(
        map((res) => {
          // Update global store
          globalStore.dispatch({
            type: 'LOGIN_SUCCESS',
            user: { id: res.id, email: res.email, token: res.accessToken },
          })
          form.submitEnd(true)
          router.navigate('/')
          return null
        }),
        catchError(() => {
          form.submitEnd(false)
          return of(null)
        }),
      )
    }),
  )
  .subscribe()
```

---

## Step 16: Real-World Patterns — Demo App

### Login Form

```typescript
// Schema
const loginSchema = {
  username: s.string('').required('Username is required').minLength(2, 'At least 2 characters'),
  password: s.string('').required('Password is required'),
}

const form = createForm(loginSchema)

// DOM Binding
const usernameInput = container.querySelector<HTMLInputElement>('#field-username')!
const passwordInput = container.querySelector<HTMLInputElement>('#field-password')!
const errorUsername = container.querySelector<HTMLElement>('#error-username')!
const errorPassword = container.querySelector<HTMLElement>('#error-password')!

bindInput(usernameInput, form, 'username')
bindInput(passwordInput, form, 'password')
bindError(errorUsername, form.field('username').showError$)
bindError(errorPassword, form.field('password').showError$)

// Disable submit while loading
form.submitting$.subscribe((s) => {
  submitBtn.disabled = s
})

// Hide server error when user types again
form.values$.subscribe(() => {
  loginErrorEl.classList.add('hidden')
})

// Submit handler
formEl.addEventListener('submit', (e) => {
  e.preventDefault()
  form.submit() // Touches all fields + emits SUBMIT_START
})

// Submit effect
const submitEffect$ = form.actions$.pipe(
  ofType('SUBMIT_START'),
  exhaustMap(() => {
    if (!form.isValid()) {
      form.submitEnd(false)
      return of(null)
    }
    const { username, password } = form.getValues()
    return api.auth.login({ username, password }).pipe(
      map((res) => {
        globalStore.dispatch({ type: 'LOGIN_SUCCESS', user: res })
        form.submitEnd(true)
        router.navigate(globalStore.getState().redirectPath ?? '/')
        return null
      }),
      catchError((err) => {
        const msg =
          err instanceof AjaxError && err.status === 400
            ? 'Invalid credentials'
            : 'Login failed — please try again.'
        loginErrorEl.textContent = msg
        loginErrorEl.classList.remove('hidden')
        form.submitEnd(false)
        return of(null)
      }),
    )
  }),
)
```

### Contact Form — Multiple Field Types + Character Counter

```typescript
const contactSchema = {
  name: s.string('').required('Name is required').minLength(2),
  email: s.string('').required('Email is required').email('Enter a valid email'),
  subject: s.string('').required('Subject is required').minLength(3),
  message: s.string('').required('Message is required').minLength(20).maxLength(500),
  priority: s.string('medium').oneOf(['low', 'medium', 'high']),
}

const form = createForm(contactSchema)

// Bind multiple field types
bindInput(nameInput, form, 'name')
bindInput(emailInput, form, 'email')
bindInput(subjectInput, form, 'subject')
bindInput(messageInput, form, 'message') // textarea
bindSelect(prioritySelect, form, 'priority') // select dropdown

// Character counter — derived from field value
form.field('message').value$.subscribe((v) => {
  charCount.textContent = `${v.length} / 500`
})

// Error binding for each field
bindError(errorName, form.field('name').showError$)
bindError(errorEmail, form.field('email').showError$)
bindError(errorSubject, form.field('subject').showError$)
bindError(errorMessage, form.field('message').showError$)

// Success/error banners via actions$
form.actions$.subscribe((action) => {
  if (action.type === 'SUBMIT_END') {
    successEl.classList.toggle('hidden', !action.ok)
    submitErrEl.classList.toggle('hidden', action.ok)
    if (action.ok) formEl.classList.add('hidden') // Hide form on success
  }
  if (action.type === 'RESET') {
    successEl.classList.add('hidden')
    submitErrEl.classList.add('hidden')
    formEl.classList.remove('hidden') // Show form again
  }
})

// Reset button
resetBtn.addEventListener('click', () => form.reset())

// Mount all sinks into a unified subscription
return mount(container, () => [
  bindInput(nameInput, form, 'name'),
  bindInput(emailInput, form, 'email'),
  bindError(errorName, form.field('name').showError$),
  bindError(errorEmail, form.field('email').showError$),
  form.field('message').value$.subscribe(updateCharCount),
  form.submitting$.subscribe(toggleSubmitButton),
  submitEffect$.subscribe(),
])
```

**Key patterns:**

- Multiple field types (text, email, textarea, select) work with the same binder API
- Custom derived logic (character counter) accesses field streams directly
- `actions$` enables complex UI effects: show/hide banners on `SUBMIT_END` and `RESET`
- `mount()` returns a single subscription that encompasses all binders and effects
- Unsubscribing tears down everything — event listeners, value subscriptions, error displays

---

## Step 17: Architecture Summary

### Complete Signal Flow

```
User Input (DOM)
      ↓
fromEvent(input, 'input')              ← DOM event captured
      ↓
form.setValue('name', 'Alice')          ← Binder calls setValue
      ↓
dispatch({ type: 'SET_VALUE', ... })   ← Action dispatched
      ↓
scan(reducer, state)                   ← Reducer produces new state
      ↓
state$ emits new FormState             ← shareReplay(1) multicasts
      ↓
┌─────────┼──────────────┐
│         │              │
values$  touched$   submitting$        ← Derived state streams
│         │
│    ┌────┘
│    │
validateAll(values, schema)            ← Field-level validation
      ↓
mergeWithCrossFieldErrors(...)         ← Cross-field validation
      ↓
errors$                                ← Validation results
      ↓
┌─────┼──────────────┐
│     │              │
│  valid$      field.error$            ← Per-field error slice
│              │
│         ┌────┘
│         │
│    combineLatest([error$, touched$])
│         ↓
│    showError$                        ← Show only if touched
│         ↓
│    bindError(el, showError$)         ← DOM updates
│
└───→ isFormValid(errors)              ← Overall form validity
```

### Key Design Principles

1. **Schema-Driven** — The schema defines initial values, validators, and TypeScript types. One source of truth.

2. **Same MVU Pattern as Store** — `Subject` → `scan` → `startWith` → `shareReplay(1)`. The form IS a store.

3. **Validation Is Reactive** — Every value change triggers validation automatically. No manual `validate()` calls.

4. **Touched Gate for UX** — `showError$` hides errors on untouched fields. Standard form UX without boilerplate.

5. **Cross-Field Validation as a Layer** — Runs after field-level validation. Only applies where field-level passed. Prevents conflicting messages.

6. **Nested Groups Are Scoped Views** — Not separate forms. They slice parent streams and dispatch with dotted paths. State stays centralized.

7. **Two-Way DOM Binding** — `bindInput`, `bindCheckbox`, `bindSelect` handle Store→DOM and DOM→Store. Guards prevent cursor issues.

8. **Effects via `actions$`** — Submit side-effects are wired declaratively, same pattern as store effects. `exhaustMap` prevents double-submit.

9. **Synchronous Accessors** — `getValues()`, `getErrors()`, `isValid()` enable imperative checks in effects without async ceremony.

10. **Composable with the Entire Framework** — Forms dispatch to global stores, call HTTP APIs, navigate with the router, and display errors via DOM sinks — all through standard RxJS composition.