import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs'
import { distinctUntilChanged, map, scan, shareReplay, startWith } from 'rxjs/operators'
import {
  SchemaShape,
  FormValues,
  FormErrors,
  FormTouched,
  getInitialValues,
  validateAll,
  isFormValid,
} from './schema'

// ---------------------------------------------------------------------------
// FormAction
// ---------------------------------------------------------------------------

export type FormAction<S extends SchemaShape> =
  | { type: 'SET_VALUE'; field: keyof S; value: FormValues<S>[keyof S] }
  | { type: 'TOUCH'; field: keyof S }
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
// Form<S>
// ---------------------------------------------------------------------------

export interface Form<S extends SchemaShape> {
  values$: Observable<FormValues<S>>
  errors$: Observable<FormErrors<S>>
  touched$: Observable<FormTouched<S>>
  valid$: Observable<boolean>
  submitting$: Observable<boolean>
  /** Action stream — wire submit effects here (like store.actions$). */
  actions$: Observable<FormAction<S>>
  field<K extends keyof S>(name: K): FieldControl<FormValues<S>[K]>
  setValue<K extends keyof S>(name: K, value: FormValues<S>[K]): void
  setTouched(name: keyof S): void
  submit(): void
  submitEnd(ok: boolean): void
  reset(): void
  getValues(): FormValues<S>
  getErrors(): FormErrors<S>
  isValid(): boolean
}

// ---------------------------------------------------------------------------
// formReducer
// ---------------------------------------------------------------------------

function makeInitialTouched<S extends SchemaShape>(schema: S): FormTouched<S> {
  const touched: Record<string, boolean> = {}
  for (const key in schema) {
    touched[key] = false
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
      case 'TOUCH':
        return {
          ...state,
          touched: { ...state.touched, [action.field]: true },
        }
      case 'TOUCH_ALL': {
        const touched: Record<string, boolean> = {}
        for (const key in schema) touched[key] = true
        return { ...state, touched: touched as FormTouched<S> }
      }
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
// createForm
// ---------------------------------------------------------------------------

export function createForm<S extends SchemaShape>(schema: S): Form<S> {
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
    map((values) => validateAll(values, schema)),
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

    field<K extends keyof S>(name: K): FieldControl<FormValues<S>[K]> {
      const value$ = values$.pipe(
        map((v) => v[name]),
        distinctUntilChanged(),
      ) as Observable<FormValues<S>[K]>

      const error$ = errors$.pipe(
        map((e) => e[name]),
        distinctUntilChanged(),
      )

      const fieldTouched$ = touched$.pipe(
        map((t) => t[name]),
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

    setValue<K extends keyof S>(name: K, value: FormValues<S>[K]): void {
      dispatch({ type: 'SET_VALUE', field: name, value })
    },

    setTouched(name: keyof S): void {
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
      return validateAll(stateBs.value.values, schema)
    },

    isValid(): boolean {
      return isFormValid(this.getErrors())
    },
  }
}
