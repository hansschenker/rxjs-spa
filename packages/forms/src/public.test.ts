import { describe, it, expect, vi } from 'vitest'
import { s, validateAll, isFormValid, getInitialValues } from './schema'
import { createForm } from './form'
import { bindInput, bindCheckbox, bindSelect, bindError, bindField } from './binders'

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('s.string validators', () => {
  it('required rejects empty string', () => {
    const field = s.string('').required('Required')
    expect(field.validate('')).toBe('Required')
    expect(field.validate('  ')).toBe('Required')
    expect(field.validate('hello')).toBeNull()
  })

  it('minLength rejects short strings', () => {
    const field = s.string('').minLength(3, 'Too short')
    expect(field.validate('ab')).toBe('Too short')
    expect(field.validate('abc')).toBeNull()
  })

  it('maxLength rejects long strings', () => {
    const field = s.string('').maxLength(5, 'Too long')
    expect(field.validate('abcdef')).toBe('Too long')
    expect(field.validate('abcde')).toBeNull()
  })

  it('email validates format', () => {
    const field = s.string('').email('Bad email')
    expect(field.validate('not-an-email')).toBe('Bad email')
    expect(field.validate('user@example.com')).toBeNull()
    // empty string passes (use required() for that)
    expect(field.validate('')).toBeNull()
  })

  it('oneOf rejects values not in list', () => {
    const field = s.string('low').oneOf(['low', 'medium', 'high'], 'Invalid')
    expect(field.validate('urgent')).toBe('Invalid')
    expect(field.validate('high')).toBeNull()
  })

  it('chains multiple validators — first failure wins', () => {
    const field = s.string('').required('Required').minLength(5, 'Too short')
    expect(field.validate('')).toBe('Required')
    expect(field.validate('hi')).toBe('Too short')
    expect(field.validate('hello')).toBeNull()
  })

  it('pattern validates against regex', () => {
    const field = s.string('').pattern(/^\d+$/, 'Digits only')
    expect(field.validate('abc')).toBe('Digits only')
    expect(field.validate('123')).toBeNull()
  })

  it('refine validates with custom function', () => {
    const field = s.string('').refine((v) => v === 'secret', 'Wrong')
    expect(field.validate('other')).toBe('Wrong')
    expect(field.validate('secret')).toBeNull()
  })
})

describe('s.number validators', () => {
  it('min rejects values below threshold', () => {
    const field = s.number(0).min(1, 'Too small')
    expect(field.validate(0)).toBe('Too small')
    expect(field.validate(1)).toBeNull()
  })

  it('max rejects values above threshold', () => {
    const field = s.number(0).max(10, 'Too large')
    expect(field.validate(11)).toBe('Too large')
    expect(field.validate(10)).toBeNull()
  })
})

describe('s.boolean validators', () => {
  it('required rejects false', () => {
    const field = s.boolean(false).required('Must be checked')
    expect(field.validate(false)).toBe('Must be checked')
    expect(field.validate(true)).toBeNull()
  })
})

describe('validateAll / isFormValid', () => {
  const schema = {
    name: s.string('').required('Required'),
    age: s.number(0).min(1, 'Positive'),
  }

  it('returns errors for all fields', () => {
    const values = getInitialValues(schema)
    const errors = validateAll(values, schema)
    expect(errors.name).toBe('Required')
    expect(errors.age).toBe('Positive')
    expect(isFormValid(errors)).toBe(false)
  })

  it('isFormValid returns true when all pass', () => {
    const values = { name: 'Alice', age: 30 }
    const errors = validateAll(values, schema)
    expect(errors.name).toBeNull()
    expect(errors.age).toBeNull()
    expect(isFormValid(errors)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// createForm tests
// ---------------------------------------------------------------------------

describe('createForm', () => {
  const schema = {
    name: s.string('').required('Required').minLength(2, 'Min 2'),
    email: s.string('').required('Required').email('Invalid email'),
    agree: s.boolean(false).required('Must agree'),
  }

  it('initialises with schema defaults', () => {
    const form = createForm(schema)
    const values = form.getValues()
    expect(values.name).toBe('')
    expect(values.email).toBe('')
    expect(values.agree).toBe(false)
  })

  it('setValue updates values$', () => {
    const form = createForm(schema)
    const got: string[] = []
    const sub = form.field('name').value$.subscribe((v) => got.push(v))

    form.setValue('name', 'Alice')
    expect(got).toEqual(['', 'Alice'])
    sub.unsubscribe()
  })

  it('errors$ reflects current validation state', () => {
    const form = createForm(schema)
    const errors: Array<string | null> = []
    const sub = form.field('name').error$.subscribe((e) => errors.push(e))

    form.setValue('name', 'A') // too short
    form.setValue('name', 'Alice') // valid

    expect(errors).toEqual(['Required', 'Min 2', null])
    sub.unsubscribe()
  })

  it('valid$ is false initially and true when all fields valid', () => {
    const form = createForm(schema)
    const flags: boolean[] = []
    const sub = form.valid$.subscribe((v) => flags.push(v))

    form.setValue('name', 'Alice')
    form.setValue('email', 'alice@example.com')
    form.setValue('agree', true)

    expect(flags[0]).toBe(false)
    expect(flags[flags.length - 1]).toBe(true)
    sub.unsubscribe()
  })

  it('showError$ only emits after field is touched', () => {
    const form = createForm(schema)
    const shown: Array<string | null> = []
    const sub = form.field('name').showError$.subscribe((e) => shown.push(e))

    // Before touch: always null even if invalid
    expect(shown[shown.length - 1]).toBeNull()

    form.setTouched('name')
    // After touch: shows error
    expect(shown[shown.length - 1]).not.toBeNull()

    form.setValue('name', 'Bob')
    // After fixing: null again
    expect(shown[shown.length - 1]).toBeNull()

    sub.unsubscribe()
  })

  it('dirty$ is false initially, true after change', () => {
    const form = createForm(schema)
    const flags: boolean[] = []
    const sub = form.field('name').dirty$.subscribe((v) => flags.push(v))

    form.setValue('name', 'Alice')
    form.setValue('name', '') // back to initial

    expect(flags[0]).toBe(false)
    expect(flags[1]).toBe(true)
    expect(flags[2]).toBe(false)
    sub.unsubscribe()
  })

  it('submit() marks all touched and emits SUBMIT_START action', () => {
    const form = createForm(schema)
    const actions: string[] = []
    const sub = form.actions$.subscribe((a) => actions.push(a.type))

    form.submit()

    expect(actions).toContain('TOUCH_ALL')
    expect(actions).toContain('SUBMIT_START')
    sub.unsubscribe()
  })

  it('submitting$ is true between submit() and submitEnd()', () => {
    const form = createForm(schema)
    const flags: boolean[] = []
    const sub = form.submitting$.subscribe((v) => flags.push(v))

    form.submit()
    form.submitEnd(true)

    expect(flags).toContain(true)
    expect(flags[flags.length - 1]).toBe(false)
    sub.unsubscribe()
  })

  it('reset() restores initial state', () => {
    const form = createForm(schema)
    form.setValue('name', 'Alice')
    form.setTouched('name')
    form.reset()

    const values = form.getValues()
    expect(values.name).toBe('')

    const touched: boolean[] = []
    const sub = form.field('name').touched$.subscribe((v) => touched.push(v))
    expect(touched[0]).toBe(false)
    sub.unsubscribe()
  })
})

// ---------------------------------------------------------------------------
// Binder tests
// ---------------------------------------------------------------------------

describe('bindInput', () => {
  it('syncs input value from form and dispatches changes', () => {
    const schema = { name: s.string('') }
    const form = createForm(schema)
    const input = document.createElement('input')

    const sub = bindInput(input, form, 'name')

    // form → DOM
    form.setValue('name', 'Alice')
    expect(input.value).toBe('Alice')

    // DOM → form
    input.value = 'Bob'
    input.dispatchEvent(new Event('input'))
    expect(form.getValues().name).toBe('Bob')

    // blur → touched
    const touched: boolean[] = []
    const tSub = form.field('name').touched$.subscribe((v) => touched.push(v))
    input.dispatchEvent(new Event('blur'))
    expect(touched[touched.length - 1]).toBe(true)

    sub.unsubscribe()
    tSub.unsubscribe()
  })
})

describe('bindCheckbox', () => {
  it('syncs checkbox from form and dispatches changes', () => {
    const schema = { agree: s.boolean(false) }
    const form = createForm(schema)
    const input = document.createElement('input')
    input.type = 'checkbox'

    const sub = bindCheckbox(input, form, 'agree')

    // form → DOM
    form.setValue('agree', true)
    expect(input.checked).toBe(true)

    // DOM → form
    input.checked = false
    input.dispatchEvent(new Event('change'))
    expect(form.getValues().agree).toBe(false)

    sub.unsubscribe()
  })
})

describe('bindSelect', () => {
  it('syncs select from form and dispatches changes', () => {
    const schema = { priority: s.string('medium') }
    const form = createForm(schema)

    const select = document.createElement('select')
    ;['low', 'medium', 'high'].forEach((v) => {
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      select.appendChild(opt)
    })

    const sub = bindSelect(select, form, 'priority')

    // form → DOM (initial value)
    expect(select.value).toBe('medium')

    // form → DOM update
    form.setValue('priority', 'high')
    expect(select.value).toBe('high')

    // DOM → form
    select.value = 'low'
    select.dispatchEvent(new Event('change'))
    expect(form.getValues().priority).toBe('low')

    sub.unsubscribe()
  })
})

describe('bindError', () => {
  it('sets textContent and has-error class based on error$', () => {
    const schema = { name: s.string('').required('Required') }
    const form = createForm(schema)
    const el = document.createElement('span')

    const sub = bindError(el, form.field('name').showError$)

    form.setTouched('name')
    expect(el.textContent).toBe('Required')
    expect(el.classList.contains('has-error')).toBe(true)

    form.setValue('name', 'Alice')
    expect(el.textContent).toBe('')
    expect(el.classList.contains('has-error')).toBe(false)

    sub.unsubscribe()
  })
})

describe('bindField', () => {
  it('finds input and error el inside container', () => {
    const schema = { email: s.string('').required('Required').email('Invalid') }
    const form = createForm(schema)

    const container = document.createElement('div')
    container.innerHTML = `
      <input type="email" />
      <span class="field-error"></span>
    `

    const sub = bindField(container, form, 'email')
    const input = container.querySelector('input')!
    const errorEl = container.querySelector('.field-error')!

    // touch to show error
    input.dispatchEvent(new Event('blur'))
    expect(errorEl.textContent).toBe('Required')

    // type valid email
    input.value = 'a@b.com'
    input.dispatchEvent(new Event('input'))
    expect(errorEl.textContent).toBe('')

    sub.unsubscribe()
  })
})
