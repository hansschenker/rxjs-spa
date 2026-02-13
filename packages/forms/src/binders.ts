import { Observable, Subscription, fromEvent, merge } from 'rxjs'
import { map, startWith } from 'rxjs/operators'
import type { SchemaShape, FormValues } from './schema'
import type { Form } from './form'

// ---------------------------------------------------------------------------
// bindInput — text / email / tel / textarea
// ---------------------------------------------------------------------------

export function bindInput<S extends SchemaShape, K extends keyof S>(
  input: HTMLInputElement | HTMLTextAreaElement,
  form: Form<S>,
  name: K,
): Subscription {
  const field = form.field(name)
  const sub = new Subscription()

  // value$ → input.value (one-way from store to DOM)
  sub.add(
    (field.value$ as Observable<string>).subscribe((v) => {
      if (input.value !== String(v)) input.value = String(v)
    }),
  )

  // DOM input → setValue
  sub.add(
    fromEvent(input, 'input').subscribe(() => {
      form.setValue(name, input.value as FormValues<S>[K])
    }),
  )

  // blur → setTouched
  sub.add(
    fromEvent(input, 'blur').subscribe(() => {
      form.setTouched(name)
    }),
  )

  return sub
}

// ---------------------------------------------------------------------------
// bindCheckbox
// ---------------------------------------------------------------------------

export function bindCheckbox<S extends SchemaShape, K extends keyof S>(
  input: HTMLInputElement,
  form: Form<S>,
  name: K,
): Subscription {
  const field = form.field(name)
  const sub = new Subscription()

  sub.add(
    (field.value$ as Observable<boolean>).subscribe((v) => {
      input.checked = Boolean(v)
    }),
  )

  sub.add(
    fromEvent(input, 'change').subscribe(() => {
      form.setValue(name, input.checked as FormValues<S>[K])
    }),
  )

  sub.add(
    fromEvent(input, 'blur').subscribe(() => {
      form.setTouched(name)
    }),
  )

  return sub
}

// ---------------------------------------------------------------------------
// bindSelect
// ---------------------------------------------------------------------------

export function bindSelect<S extends SchemaShape, K extends keyof S>(
  select: HTMLSelectElement,
  form: Form<S>,
  name: K,
): Subscription {
  const field = form.field(name)
  const sub = new Subscription()

  sub.add(
    (field.value$ as Observable<string>).subscribe((v) => {
      if (select.value !== String(v)) select.value = String(v)
    }),
  )

  sub.add(
    fromEvent(select, 'change').subscribe(() => {
      form.setValue(name, select.value as FormValues<S>[K])
    }),
  )

  sub.add(
    fromEvent(select, 'blur').subscribe(() => {
      form.setTouched(name)
    }),
  )

  return sub
}

// ---------------------------------------------------------------------------
// bindError — display error message in an element
// ---------------------------------------------------------------------------

export function bindError(el: HTMLElement, error$: Observable<string | null>): Subscription {
  return error$.subscribe((err) => {
    el.textContent = err ?? ''
    if (err) {
      el.classList.add('has-error')
    } else {
      el.classList.remove('has-error')
    }
  })
}

// ---------------------------------------------------------------------------
// bindField — convenience: bindInput + bindError for a container element
//
// Expects the container to have:
//   - An <input>, <textarea>, or <select> as a descendant
//   - An element with class `.field-error` for the error message
// ---------------------------------------------------------------------------

export function bindField<S extends SchemaShape, K extends keyof S>(
  container: HTMLElement,
  form: Form<S>,
  name: K,
): Subscription {
  const sub = new Subscription()
  const errorEl = container.querySelector<HTMLElement>('.field-error')

  const inputEl = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="checkbox"]):not([type="radio"]), textarea',
  )
  const checkboxEl = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"], input[type="radio"]',
  )
  const selectEl = container.querySelector<HTMLSelectElement>('select')

  if (inputEl) sub.add(bindInput(inputEl, form, name))
  if (checkboxEl) sub.add(bindCheckbox(checkboxEl, form, name))
  if (selectEl) sub.add(bindSelect(selectEl, form, name))

  if (errorEl) {
    const field = form.field(name)
    sub.add(bindError(errorEl, field.showError$))
  }

  return sub
}
