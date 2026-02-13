// ---------------------------------------------------------------------------
// Validator type
// ---------------------------------------------------------------------------

export type Validator<T> = (value: T) => string | null

// ---------------------------------------------------------------------------
// FieldSchema — stores initial value + list of validators
// ---------------------------------------------------------------------------

export interface FieldSchema<T> {
  readonly initial: T
  readonly validators: ReadonlyArray<Validator<T>>
  /** Run all validators; return first error message or null. */
  validate(value: T): string | null
}

// ---------------------------------------------------------------------------
// StringFieldBuilder
// ---------------------------------------------------------------------------

class StringFieldBuilder implements FieldSchema<string> {
  readonly initial: string
  readonly validators: Validator<string>[]

  constructor(initial: string, validators: Validator<string>[] = []) {
    this.initial = initial
    this.validators = validators
  }

  private clone(v: Validator<string>): StringFieldBuilder {
    return new StringFieldBuilder(this.initial, [...this.validators, v])
  }

  validate(value: string): string | null {
    for (const v of this.validators) {
      const err = v(value)
      if (err !== null) return err
    }
    return null
  }

  required(message = 'Required'): StringFieldBuilder {
    return this.clone((v) => (v.trim().length === 0 ? message : null))
  }

  minLength(min: number, message = `Min ${min} characters`): StringFieldBuilder {
    return this.clone((v) => (v.length < min ? message : null))
  }

  maxLength(max: number, message = `Max ${max} characters`): StringFieldBuilder {
    return this.clone((v) => (v.length > max ? message : null))
  }

  email(message = 'Invalid email address'): StringFieldBuilder {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return this.clone((v) => (v.length > 0 && !re.test(v) ? message : null))
  }

  pattern(regex: RegExp, message = 'Invalid format'): StringFieldBuilder {
    return this.clone((v) => (v.length > 0 && !regex.test(v) ? message : null))
  }

  oneOf(options: string[], message = 'Invalid option'): StringFieldBuilder {
    return this.clone((v) => (!options.includes(v) ? message : null))
  }

  refine(fn: (v: string) => boolean, message = 'Invalid'): StringFieldBuilder {
    return this.clone((v) => (!fn(v) ? message : null))
  }
}

// ---------------------------------------------------------------------------
// NumberFieldBuilder
// ---------------------------------------------------------------------------

class NumberFieldBuilder implements FieldSchema<number> {
  readonly initial: number
  readonly validators: Validator<number>[]

  constructor(initial: number, validators: Validator<number>[] = []) {
    this.initial = initial
    this.validators = validators
  }

  private clone(v: Validator<number>): NumberFieldBuilder {
    return new NumberFieldBuilder(this.initial, [...this.validators, v])
  }

  validate(value: number): string | null {
    for (const v of this.validators) {
      const err = v(value)
      if (err !== null) return err
    }
    return null
  }

  required(message = 'Required'): NumberFieldBuilder {
    return this.clone((v) => (isNaN(v) ? message : null))
  }

  min(min: number, message = `Min value is ${min}`): NumberFieldBuilder {
    return this.clone((v) => (v < min ? message : null))
  }

  max(max: number, message = `Max value is ${max}`): NumberFieldBuilder {
    return this.clone((v) => (v > max ? message : null))
  }

  refine(fn: (v: number) => boolean, message = 'Invalid'): NumberFieldBuilder {
    return this.clone((v) => (!fn(v) ? message : null))
  }
}

// ---------------------------------------------------------------------------
// BooleanFieldBuilder
// ---------------------------------------------------------------------------

class BooleanFieldBuilder implements FieldSchema<boolean> {
  readonly initial: boolean
  readonly validators: Validator<boolean>[]

  constructor(initial: boolean, validators: Validator<boolean>[] = []) {
    this.initial = initial
    this.validators = validators
  }

  private clone(v: Validator<boolean>): BooleanFieldBuilder {
    return new BooleanFieldBuilder(this.initial, [...this.validators, v])
  }

  validate(value: boolean): string | null {
    for (const v of this.validators) {
      const err = v(value)
      if (err !== null) return err
    }
    return null
  }

  required(message = 'Must be checked'): BooleanFieldBuilder {
    return this.clone((v) => (!v ? message : null))
  }

  refine(fn: (v: boolean) => boolean, message = 'Invalid'): BooleanFieldBuilder {
    return this.clone((v) => (!fn(v) ? message : null))
  }
}

// ---------------------------------------------------------------------------
// s — fluent schema builder namespace
// ---------------------------------------------------------------------------

export const s = {
  string(initial = ''): StringFieldBuilder {
    return new StringFieldBuilder(initial)
  },
  number(initial = 0): NumberFieldBuilder {
    return new NumberFieldBuilder(initial)
  },
  boolean(initial = false): BooleanFieldBuilder {
    return new BooleanFieldBuilder(initial)
  },
}

// ---------------------------------------------------------------------------
// Schema type helpers
// ---------------------------------------------------------------------------

export type SchemaShape = Record<string, FieldSchema<unknown>>

export type FormValues<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends FieldSchema<infer T> ? T : never
}

export type FormErrors<S extends SchemaShape> = {
  [K in keyof S]: string | null
}

export type FormTouched<S extends SchemaShape> = {
  [K in keyof S]: boolean
}

export function getInitialValues<S extends SchemaShape>(schema: S): FormValues<S> {
  const values: Record<string, unknown> = {}
  for (const key in schema) {
    values[key] = schema[key].initial
  }
  return values as FormValues<S>
}

export function validateAll<S extends SchemaShape>(
  values: FormValues<S>,
  schema: S,
): FormErrors<S> {
  const errors: Record<string, string | null> = {}
  for (const key in schema) {
    errors[key] = schema[key].validate(values[key] as never)
  }
  return errors as FormErrors<S>
}

export function isFormValid<S extends SchemaShape>(errors: FormErrors<S>): boolean {
  return Object.values(errors).every((e) => e === null)
}
