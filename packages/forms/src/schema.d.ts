export type Validator<T> = (value: T) => string | null;
export interface FieldSchema<T> {
    readonly initial: T;
    readonly validators: ReadonlyArray<Validator<T>>;
    /** Run all validators; return first error message or null. */
    validate(value: T): string | null;
}
declare class StringFieldBuilder implements FieldSchema<string> {
    readonly initial: string;
    readonly validators: Validator<string>[];
    constructor(initial: string, validators?: Validator<string>[]);
    private clone;
    validate(value: string): string | null;
    required(message?: string): StringFieldBuilder;
    minLength(min: number, message?: string): StringFieldBuilder;
    maxLength(max: number, message?: string): StringFieldBuilder;
    email(message?: string): StringFieldBuilder;
    pattern(regex: RegExp, message?: string): StringFieldBuilder;
    oneOf(options: string[], message?: string): StringFieldBuilder;
    refine(fn: (v: string) => boolean, message?: string): StringFieldBuilder;
}
declare class NumberFieldBuilder implements FieldSchema<number> {
    readonly initial: number;
    readonly validators: Validator<number>[];
    constructor(initial: number, validators?: Validator<number>[]);
    private clone;
    validate(value: number): string | null;
    required(message?: string): NumberFieldBuilder;
    min(min: number, message?: string): NumberFieldBuilder;
    max(max: number, message?: string): NumberFieldBuilder;
    refine(fn: (v: number) => boolean, message?: string): NumberFieldBuilder;
}
declare class BooleanFieldBuilder implements FieldSchema<boolean> {
    readonly initial: boolean;
    readonly validators: Validator<boolean>[];
    constructor(initial: boolean, validators?: Validator<boolean>[]);
    private clone;
    validate(value: boolean): string | null;
    required(message?: string): BooleanFieldBuilder;
    refine(fn: (v: boolean) => boolean, message?: string): BooleanFieldBuilder;
}
export interface GroupFieldSchema<S extends SchemaShape> {
    readonly __group: true;
    readonly shape: S;
}
export declare function isGroupSchema(entry: unknown): entry is GroupFieldSchema<SchemaShape>;
export declare const s: {
    string(initial?: string): StringFieldBuilder;
    number(initial?: number): NumberFieldBuilder;
    boolean(initial?: boolean): BooleanFieldBuilder;
    group<S extends SchemaShape>(shape: S): GroupFieldSchema<S>;
};
/** A schema entry is either a leaf FieldSchema or a nested GroupFieldSchema. */
export type SchemaShape = Record<string, FieldSchema<unknown> | GroupFieldSchema<any>>;
export type FormValues<S extends SchemaShape> = {
    [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner> ? FormValues<Inner> : S[K] extends FieldSchema<infer T> ? T : never;
};
export type FormErrors<S extends SchemaShape> = {
    [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner> ? FormErrors<Inner> : string | null;
};
export type FormTouched<S extends SchemaShape> = {
    [K in keyof S]: S[K] extends GroupFieldSchema<infer Inner> ? FormTouched<Inner> : boolean;
};
export declare function getInitialValues<S extends SchemaShape>(schema: S): FormValues<S>;
export declare function validateAll<S extends SchemaShape>(values: FormValues<S>, schema: S): FormErrors<S>;
export declare function isFormValid<S extends SchemaShape>(errors: FormErrors<S>): boolean;
/**
 * A form-level validator that receives all form values and returns a record
 * of field names → error messages. Only non-empty entries are applied.
 * Cross-field errors only take effect on fields that pass field-level validation.
 */
export type FormValidator<S extends SchemaShape> = (values: FormValues<S>) => Record<string, string>;
/**
 * Merge field-level errors with cross-field validator errors.
 * Cross-field errors only apply to fields whose field-level validation passes (error === null).
 */
export declare function mergeWithCrossFieldErrors<S extends SchemaShape>(fieldErrors: FormErrors<S>, validators: FormValidator<S>[], values: FormValues<S>): FormErrors<S>;
export {};
