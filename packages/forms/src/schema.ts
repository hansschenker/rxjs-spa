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

// ---------------------------------------------------------------------------
// GroupFieldSchema — nested field group
// ---------------------------------------------------------------------------

export interface GroupFieldSchema<S extends SchemaShape> {
  readonly __group: true
  readonly shape: S
}

class GroupFieldBuilder<S extends SchemaShape> implements GroupFieldSchema<S> {
  readonly __group = true as const
  constructor(readonly shape: S) {}
}

export function isGroupSchema(entry: unknown): entry is GroupFieldSchema<SchemaShape> {
  return entry !== null && typeof entry === 'object' && (entry as any).__group === true
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
  group<S extends SchemaShape>(shape: S): GroupFieldSchema<S> {
    return new GroupFieldBuilder(shape)
  },
}

// ---------------------------------------------------------------------------
// Schema type helpers
// ---------------------------------------------------------------------------

/** A schema entry is either a leaf FieldSchema or a nested GroupFieldSchema. */
export type SchemaShape = Record<string, FieldSchema<unknown> | GroupFieldSchema<any>>

export type FormValues<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormValues<Inner>
    : S[K] extends FieldSchema<infer T>
      ? T
      : never
}

export type FormErrors<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormErrors<Inner>
    : string | null
}

export type FormTouched<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner>
    ? FormTouched<Inner>
    : boolean
}

export function getInitialValues<S extends SchemaShape>(schema: S): FormValues<S> {
  const values: Record<string, unknown> = {}
  for (const key in schema) {
    const entry = schema[key]
    if (isGroupSchema(entry)) {
      values[key] = getInitialValues(entry.shape)
    } else {
      values[key] = (entry as FieldSchema<unknown>).initial
    }
  }
  return values as FormValues<S>
}

export function validateAll<S extends SchemaShape>(
  values: FormValues<S>,
  schema: S,
): FormErrors<S> {
  const errors: Record<string, unknown> = {}
  for (const key in schema) {
    const entry = schema[key]
    if (isGroupSchema(entry)) {
      errors[key] = validateAll((values as any)[key], entry.shape)
    } else {
      errors[key] = (entry as FieldSchema<unknown>).validate((values as any)[key])
    }
  }
  return errors as FormErrors<S>
}

export function isFormValid<S extends SchemaShape>(errors: FormErrors<S>): boolean {
  return Object.values(errors).every((e) => {
    if (e !== null && typeof e === 'object') {
      return isFormValid(e as FormErrors<SchemaShape>)
    }
    return e === null
  })
}

// ---------------------------------------------------------------------------
// Cross-field validation
// ---------------------------------------------------------------------------

/**
 * A form-level validator that receives all form values and returns a record
 * of field names → error messages. Only non-empty entries are applied.
 * Cross-field errors only take effect on fields that pass field-level validation.
 */
export type FormValidator<S extends SchemaShape> = (values: FormValues<S>) => Record<string, string>

/**
 * Merge field-level errors with cross-field validator errors.
 * Cross-field errors only apply to fields whose field-level validation passes (error === null).
 */
export function mergeWithCrossFieldErrors<S extends SchemaShape>(
  fieldErrors: FormErrors<S>,
  validators: FormValidator<S>[],
  values: FormValues<S>,
): FormErrors<S> {
  const merged = { ...fieldErrors } as Record<string, unknown>
  for (const validator of validators) {
    const crossErrors = validator(values)
    for (const key in crossErrors) {
      // Only apply if field-level validation passed
      if (merged[key] === null && crossErrors[key]) {
        merged[key] = crossErrors[key]
      }
    }
  }
  return merged as FormErrors<S>
}
