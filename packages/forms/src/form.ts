import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs'
import { distinctUntilChanged, map, scan, shareReplay, startWith } from 'rxjs/operators'
import {
  SchemaShape,
  FormValues,
  FormErrors,
  FormTouched,
  FormValidator,
  getInitialValues,
  validateAll,
  isFormValid,
  isGroupSchema,
  mergeWithCrossFieldErrors,
} from './schema'
import type { GroupFieldSchema } from './schema'

// ---------------------------------------------------------------------------
// FormAction
// ---------------------------------------------------------------------------

export type FormAction<S extends SchemaShape> =
  | { type: 'SET_VALUE'; field: keyof S; value: FormValues<S>[keyof S] }
  | { type: 'SET_NESTED_VALUE'; path: string; value: unknown }
  | { type: 'TOUCH'; field: keyof S }
  | { type: 'TOUCH_NESTED'; path: string }
  | { type: 'TOUCH_ALL' }
  | { type: 'RESET' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END'; ok: boolean }

// ---------------------------------------------------------------------------
// FormState (internal — stored in scan)
// ---------------------------------------------------------------------------

export interface FormState<S extends SchemaShape> {
  values: FormValues<S>
  touched: FormTouched<S>
  submitting: boolean
  submitted: boolean
}

// ---------------------------------------------------------------------------
// Deep state helpers
// ---------------------------------------------------------------------------

function deepSet(obj: any, pathParts: string[], value: unknown): any {
  if (pathParts.length === 0) return value
  if (pathParts.length === 1) {
    return { ...obj, [pathParts[0]]: value }
  }
  const [head, ...rest] = pathParts
  return { ...obj, [head]: deepSet(obj[head], rest, value) }
}

function deepGet(obj: any, pathParts: string[]): unknown {
  let current = obj
  for (const part of pathParts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function parsePath(path: string): string[] {
  return path.split('.')
}

// ---------------------------------------------------------------------------
// FieldControl
// ---------------------------------------------------------------------------

export interface FieldControl<T> {
  value$: Observable<T>
  error$: Observable<string | null>
  touched$: Observable<boolean>
  dirty$: Observable<boolean>
  /** Emits the error only after the field has been touched (standard UX). */
  showError$: Observable<string | null>
}

// ---------------------------------------------------------------------------
// FormAccessor — common interface for Form and FormGroup
// ---------------------------------------------------------------------------

export interface FormAccessor<S extends SchemaShape> {
  field<K extends keyof S>(name: K): FieldControl<FormValues<S>[K]>
  setValue<K extends keyof S>(name: K, value: FormValues<S>[K]): void
  setTouched(name: keyof S): void
}

// ---------------------------------------------------------------------------
// FormGroup — scoped view into a nested group
// ---------------------------------------------------------------------------

export interface FormGroup<S extends SchemaShape> extends FormAccessor<S> {
  values$: Observable<FormValues<S>>
  errors$: Observable<FormErrors<S>>
  touched$: Observable<FormTouched<S>>
  valid$: Observable<boolean>
  group<K extends keyof S>(
    name: K,
  ): S[K] extends GroupFieldSchema<infer Inner> ? FormGroup<Inner> : never
}

// ---------------------------------------------------------------------------
// Form<S>
// ---------------------------------------------------------------------------

export interface Form<S extends SchemaShape> extends FormAccessor<S> {
  values$: Observable<FormValues<S>>
  errors$: Observable<FormErrors<S>>
  touched$: Observable<FormTouched<S>>
  valid$: Observable<boolean>
  submitting$: Observable<boolean>
  /** Action stream — wire submit effects here (like store.actions$). */
  actions$: Observable<FormAction<S>>
  submit(): void
  submitEnd(ok: boolean): void
  reset(): void
  getValues(): FormValues<S>
  getErrors(): FormErrors<S>
  isValid(): boolean
  group<K extends keyof S>(
    name: K,
  ): S[K] extends GroupFieldSchema<infer Inner> ? FormGroup<Inner> : never
}

// ---------------------------------------------------------------------------
// formReducer
// ---------------------------------------------------------------------------

function makeInitialTouched<S extends SchemaShape>(schema: S): FormTouched<S> {
  const touched: Record<string, unknown> = {}
  for (const key in schema) {
    const entry = schema[key]
    if (isGroupSchema(entry)) {
      touched[key] = makeInitialTouched(entry.shape)
    } else {
      touched[key] = false
    }
  }
  return touched as FormTouched<S>
}

function makeTouchAll<S extends SchemaShape>(schema: S): FormTouched<S> {
  const touched: Record<string, unknown> = {}
  for (const key in schema) {
    const entry = schema[key]
    if (isGroupSchema(entry)) {
      touched[key] = makeTouchAll(entry.shape)
    } else {
      touched[key] = true
    }
  }
  return touched as FormTouched<S>
}

function formReducer<S extends SchemaShape>(schema: S) {
  const initialValues = getInitialValues(schema)
  const initialTouched = makeInitialTouched(schema)

  return (state: FormState<S>, action: FormAction<S>): FormState<S> => {
    switch (action.type) {
      case 'SET_VALUE':
        return {
          ...state,
          values: { ...state.values, [action.field]: action.value },
        }
      case 'SET_NESTED_VALUE': {
        const parts = parsePath(action.path)
        return {
          ...state,
          values: deepSet(state.values, parts, action.value),
        }
      }
      case 'TOUCH':
        return {
          ...state,
          touched: { ...state.touched, [action.field]: true },
        }
      case 'TOUCH_NESTED': {
        const parts = parsePath(action.path)
        return {
          ...state,
          touched: deepSet(state.touched, parts, true),
        }
      }
      case 'TOUCH_ALL':
        return { ...state, touched: makeTouchAll(schema) }
      case 'RESET':
        return {
          values: { ...initialValues },
          touched: { ...initialTouched },
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

// ---------------------------------------------------------------------------
// FormOptions
// ---------------------------------------------------------------------------

export interface FormOptions<S extends SchemaShape> {
  /** Form-level validators that can compare multiple fields. */
  validators?: FormValidator<S>[]
}

// ---------------------------------------------------------------------------
// createFormGroup — internal factory for nested group access
// ---------------------------------------------------------------------------

function createFormGroup<S extends SchemaShape>(
  schema: S,
  pathPrefix: string,
  parentValues$: Observable<FormValues<S>>,
  parentErrors$: Observable<FormErrors<S>>,
  parentTouched$: Observable<FormTouched<S>>,
  initialValues: FormValues<S>,
  dispatchFn: (action: any) => void,
): FormGroup<S> {
  const values$ = parentValues$.pipe(
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )
  const errors$ = parentErrors$.pipe(
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )
  const touched$ = parentTouched$.pipe(
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )
  const valid$ = errors$.pipe(map(isFormValid), distinctUntilChanged())

  return {
    values$,
    errors$,
    touched$,
    valid$,

    field<K extends keyof S & string>(name: K): FieldControl<FormValues<S>[K]> {
      const value$ = values$.pipe(
        map((v) => v[name]),
        distinctUntilChanged(),
      ) as Observable<FormValues<S>[K]>

      const fieldEntry = schema[name]
      let error$: Observable<string | null>

      if (isGroupSchema(fieldEntry)) {
        // For group fields, error$ shows null if all nested pass, or first nested error
        error$ = errors$.pipe(
          map((e) => {
            const groupErrors = e[name]
            if (groupErrors && typeof groupErrors === 'object') {
              return isFormValid({ [name]: groupErrors } as any) ? null : 'Group has errors'
            }
            return null
          }),
          distinctUntilChanged(),
        )
      } else {
        error$ = errors$.pipe(
          map((e) => e[name] as string | null),
          distinctUntilChanged(),
        )
      }

      const fieldTouched$ = touched$.pipe(
        map((t) => {
          const val = t[name]
          return typeof val === 'boolean' ? val : false
        }),
        distinctUntilChanged(),
      )

      const dirty$ = values$.pipe(
        map((v) => v[name] !== initialValues[name]),
        distinctUntilChanged(),
      )

      const showError$ = combineLatest([error$, fieldTouched$]).pipe(
        map(([error, touched]) => (touched ? error : null)),
        distinctUntilChanged(),
      )

      return { value$, error$, touched$: fieldTouched$, dirty$, showError$ }
    },

    setValue<K extends keyof S & string>(name: K, value: FormValues<S>[K]): void {
      const fullPath = pathPrefix ? `${pathPrefix}.${name}` : name
      dispatchFn({ type: 'SET_NESTED_VALUE', path: fullPath, value })
    },

    setTouched(name: keyof S & string): void {
      const fullPath = pathPrefix ? `${pathPrefix}.${name}` : name
      dispatchFn({ type: 'TOUCH_NESTED', path: fullPath })
    },

    group<K extends keyof S & string>(name: K): any {
      const entry = schema[name]
      if (!isGroupSchema(entry)) {
        throw new Error(`Field "${name}" is not a group`)
      }
      const innerSchema = entry.shape
      const innerValues$ = values$.pipe(
        map((v) => (v as any)[name]),
      )
      const innerErrors$ = errors$.pipe(
        map((e) => (e as any)[name]),
      )
      const innerTouched$ = touched$.pipe(
        map((t) => (t as any)[name]),
      )
      const innerInitial = (initialValues as any)[name]
      const innerPath = pathPrefix ? `${pathPrefix}.${name}` : name
      return createFormGroup(innerSchema, innerPath, innerValues$, innerErrors$, innerTouched$, innerInitial, dispatchFn)
    },
  }
}

// ---------------------------------------------------------------------------
// createForm
// ---------------------------------------------------------------------------

export function createForm<S extends SchemaShape>(
  schema: S,
  options?: FormOptions<S>,
): Form<S> {
  const initialValues = getInitialValues(schema)
  const initialTouched = makeInitialTouched(schema)

  const initialState: FormState<S> = {
    values: initialValues,
    touched: initialTouched,
    submitting: false,
    submitted: false,
  }

  const actionsSubject = new Subject<FormAction<S>>()
  const stateBs = new BehaviorSubject<FormState<S>>(initialState)

  const actions$ = actionsSubject.asObservable()

  const reducer = formReducer(schema)

  // Core pipeline: Subject → scan → startWith → shareReplay(1)
  const state$ = actionsSubject.pipe(
    scan(reducer, initialState),
    startWith(initialState),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  // Keep synchronous snapshot in sync
  state$.subscribe((s) => stateBs.next(s))

  function dispatch(action: FormAction<S>): void {
    actionsSubject.next(action)
  }

  function select<T>(selector: (s: FormState<S>) => T): Observable<T> {
    return state$.pipe(map(selector), distinctUntilChanged())
  }

  const values$ = select((s) => s.values)
  const touched$ = select((s) => s.touched)
  const submitting$ = select((s) => s.submitting)

  const errors$ = values$.pipe(
    map((values) => {
      const fieldErrors = validateAll(values, schema)
      if (options?.validators?.length) {
        return mergeWithCrossFieldErrors(fieldErrors, options.validators, values)
      }
      return fieldErrors
    }),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  )

  const valid$ = errors$.pipe(map(isFormValid), distinctUntilChanged())

  return {
    values$,
    errors$,
    touched$,
    valid$,
    submitting$,
    actions$,

    field<K extends keyof S & string>(name: K): FieldControl<FormValues<S>[K]> {
      const value$ = values$.pipe(
        map((v) => v[name]),
        distinctUntilChanged(),
      ) as Observable<FormValues<S>[K]>

      const fieldEntry = schema[name]
      let error$: Observable<string | null>

      if (isGroupSchema(fieldEntry)) {
        // For group fields, error$ summarizes nested validity
        error$ = errors$.pipe(
          map((e) => {
            const groupErrors = e[name]
            if (groupErrors && typeof groupErrors === 'object') {
              return isFormValid({ [name]: groupErrors } as any) ? null : 'Group has errors'
            }
            return null
          }),
          distinctUntilChanged(),
        )
      } else {
        error$ = errors$.pipe(
          map((e) => e[name] as string | null),
          distinctUntilChanged(),
        )
      }

      const fieldTouched$ = touched$.pipe(
        map((t) => {
          const val = t[name]
          return typeof val === 'boolean' ? val : false
        }),
        distinctUntilChanged(),
      )

      const dirty$ = values$.pipe(
        map((v) => v[name] !== initialValues[name]),
        distinctUntilChanged(),
      )

      const showError$ = combineLatest([error$, fieldTouched$]).pipe(
        map(([error, touched]) => (touched ? error : null)),
        distinctUntilChanged(),
      )

      return { value$, error$, touched$: fieldTouched$, dirty$, showError$ }
    },

    setValue<K extends keyof S & string>(name: K, value: FormValues<S>[K]): void {
      dispatch({ type: 'SET_VALUE', field: name, value })
    },

    setTouched(name: keyof S & string): void {
      dispatch({ type: 'TOUCH', field: name })
    },

    submit(): void {
      dispatch({ type: 'TOUCH_ALL' })
      dispatch({ type: 'SUBMIT_START' })
    },

    submitEnd(ok: boolean): void {
      dispatch({ type: 'SUBMIT_END', ok })
    },

    reset(): void {
      dispatch({ type: 'RESET' })
    },

    getValues(): FormValues<S> {
      return stateBs.value.values
    },

    getErrors(): FormErrors<S> {
      const fieldErrors = validateAll(stateBs.value.values, schema)
      if (options?.validators?.length) {
        return mergeWithCrossFieldErrors(fieldErrors, options.validators, stateBs.value.values)
      }
      return fieldErrors
    },

    isValid(): boolean {
      return isFormValid(this.getErrors())
    },

    group<K extends keyof S & string>(name: K): any {
      const entry = schema[name]
      if (!isGroupSchema(entry)) {
        throw new Error(`Field "${name}" is not a group`)
      }
      const innerSchema = entry.shape
      const innerValues$ = values$.pipe(map((v) => (v as any)[name]))
      const innerErrors$ = errors$.pipe(map((e) => (e as any)[name]))
      const innerTouched$ = touched$.pipe(map((t) => (t as any)[name]))
      const innerInitial = (initialValues as any)[name]
      return createFormGroup(innerSchema, name, innerValues$, innerErrors$, innerTouched$, innerInitial, dispatch as any)
    },
  }
}
