// ---------------------------------------------------------------------------
// Validator type
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// StringFieldBuilder
// ---------------------------------------------------------------------------
class StringFieldBuilder {
    initial;
    validators;
    constructor(initial, validators = []) {
        this.initial = initial;
        this.validators = validators;
    }
    clone(v) {
        return new StringFieldBuilder(this.initial, [...this.validators, v]);
    }
    validate(value) {
        for (const v of this.validators) {
            const err = v(value);
            if (err !== null)
                return err;
        }
        return null;
    }
    required(message = 'Required') {
        return this.clone((v) => (v.trim().length === 0 ? message : null));
    }
    minLength(min, message = `Min ${min} characters`) {
        return this.clone((v) => (v.length < min ? message : null));
    }
    maxLength(max, message = `Max ${max} characters`) {
        return this.clone((v) => (v.length > max ? message : null));
    }
    email(message = 'Invalid email address') {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return this.clone((v) => (v.length > 0 && !re.test(v) ? message : null));
    }
    pattern(regex, message = 'Invalid format') {
        return this.clone((v) => (v.length > 0 && !regex.test(v) ? message : null));
    }
    oneOf(options, message = 'Invalid option') {
        return this.clone((v) => (!options.includes(v) ? message : null));
    }
    refine(fn, message = 'Invalid') {
        return this.clone((v) => (!fn(v) ? message : null));
    }
}
// ---------------------------------------------------------------------------
// NumberFieldBuilder
// ---------------------------------------------------------------------------
class NumberFieldBuilder {
    initial;
    validators;
    constructor(initial, validators = []) {
        this.initial = initial;
        this.validators = validators;
    }
    clone(v) {
        return new NumberFieldBuilder(this.initial, [...this.validators, v]);
    }
    validate(value) {
        for (const v of this.validators) {
            const err = v(value);
            if (err !== null)
                return err;
        }
        return null;
    }
    required(message = 'Required') {
        return this.clone((v) => (isNaN(v) ? message : null));
    }
    min(min, message = `Min value is ${min}`) {
        return this.clone((v) => (v < min ? message : null));
    }
    max(max, message = `Max value is ${max}`) {
        return this.clone((v) => (v > max ? message : null));
    }
    refine(fn, message = 'Invalid') {
        return this.clone((v) => (!fn(v) ? message : null));
    }
}
// ---------------------------------------------------------------------------
// BooleanFieldBuilder
// ---------------------------------------------------------------------------
class BooleanFieldBuilder {
    initial;
    validators;
    constructor(initial, validators = []) {
        this.initial = initial;
        this.validators = validators;
    }
    clone(v) {
        return new BooleanFieldBuilder(this.initial, [...this.validators, v]);
    }
    validate(value) {
        for (const v of this.validators) {
            const err = v(value);
            if (err !== null)
                return err;
        }
        return null;
    }
    required(message = 'Must be checked') {
        return this.clone((v) => (!v ? message : null));
    }
    refine(fn, message = 'Invalid') {
        return this.clone((v) => (!fn(v) ? message : null));
    }
}
class GroupFieldBuilder {
    shape;
    __group = true;
    constructor(shape) {
        this.shape = shape;
    }
}
export function isGroupSchema(entry) {
    return entry !== null && typeof entry === 'object' && entry.__group === true;
}
// ---------------------------------------------------------------------------
// s — fluent schema builder namespace
// ---------------------------------------------------------------------------
export const s = {
    string(initial = '') {
        return new StringFieldBuilder(initial);
    },
    number(initial = 0) {
        return new NumberFieldBuilder(initial);
    },
    boolean(initial = false) {
        return new BooleanFieldBuilder(initial);
    },
    group(shape) {
        return new GroupFieldBuilder(shape);
    },
};
export function getInitialValues(schema) {
    const values = {};
    for (const key in schema) {
        const entry = schema[key];
        if (isGroupSchema(entry)) {
            values[key] = getInitialValues(entry.shape);
        }
        else {
            values[key] = entry.initial;
        }
    }
    return values;
}
export function validateAll(values, schema) {
    const errors = {};
    for (const key in schema) {
        const entry = schema[key];
        if (isGroupSchema(entry)) {
            errors[key] = validateAll(values[key], entry.shape);
        }
        else {
            errors[key] = entry.validate(values[key]);
        }
    }
    return errors;
}
export function isFormValid(errors) {
    return Object.values(errors).every((e) => {
        if (e !== null && typeof e === 'object') {
            return isFormValid(e);
        }
        return e === null;
    });
}
/**
 * Merge field-level errors with cross-field validator errors.
 * Cross-field errors only apply to fields whose field-level validation passes (error === null).
 */
export function mergeWithCrossFieldErrors(fieldErrors, validators, values) {
    const merged = { ...fieldErrors };
    for (const validator of validators) {
        const crossErrors = validator(values);
        for (const key in crossErrors) {
            // Only apply if field-level validation passed
            if (merged[key] === null && crossErrors[key]) {
                merged[key] = crossErrors[key];
            }
        }
    }
    return merged;
}
