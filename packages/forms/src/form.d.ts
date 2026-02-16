import { Observable } from 'rxjs';
import { SchemaShape, FormValues, FormErrors, FormTouched, FormValidator } from './schema';
import type { GroupFieldSchema } from './schema';
export type FormAction<S extends SchemaShape> = {
    type: 'SET_VALUE';
    field: keyof S;
    value: FormValues<S>[keyof S];
} | {
    type: 'SET_NESTED_VALUE';
    path: string;
    value: unknown;
} | {
    type: 'TOUCH';
    field: keyof S;
} | {
    type: 'TOUCH_NESTED';
    path: string;
} | {
    type: 'TOUCH_ALL';
} | {
    type: 'RESET';
} | {
    type: 'SUBMIT_START';
} | {
    type: 'SUBMIT_END';
    ok: boolean;
};
export interface FormState<S extends SchemaShape> {
    values: FormValues<S>;
    touched: FormTouched<S>;
    submitting: boolean;
    submitted: boolean;
}
export interface FieldControl<T> {
    value$: Observable<T>;
    error$: Observable<string | null>;
    touched$: Observable<boolean>;
    dirty$: Observable<boolean>;
    /** Emits the error only after the field has been touched (standard UX). */
    showError$: Observable<string | null>;
}
export interface FormAccessor<S extends SchemaShape> {
    field<K extends keyof S>(name: K): FieldControl<FormValues<S>[K]>;
    setValue<K extends keyof S>(name: K, value: FormValues<S>[K]): void;
    setTouched(name: keyof S): void;
}
export interface FormGroup<S extends SchemaShape> extends FormAccessor<S> {
    values$: Observable<FormValues<S>>;
    errors$: Observable<FormErrors<S>>;
    touched$: Observable<FormTouched<S>>;
    valid$: Observable<boolean>;
    group<K extends keyof S>(name: K): S[K] extends GroupFieldSchema<infer Inner> ? FormGroup<Inner> : never;
}
export interface Form<S extends SchemaShape> extends FormAccessor<S> {
    values$: Observable<FormValues<S>>;
    errors$: Observable<FormErrors<S>>;
    touched$: Observable<FormTouched<S>>;
    valid$: Observable<boolean>;
    submitting$: Observable<boolean>;
    /** Action stream — wire submit effects here (like store.actions$). */
    actions$: Observable<FormAction<S>>;
    submit(): void;
    submitEnd(ok: boolean): void;
    reset(): void;
    getValues(): FormValues<S>;
    getErrors(): FormErrors<S>;
    isValid(): boolean;
    group<K extends keyof S>(name: K): S[K] extends GroupFieldSchema<infer Inner> ? FormGroup<Inner> : never;
}
export interface FormOptions<S extends SchemaShape> {
    /** Form-level validators that can compare multiple fields. */
    validators?: FormValidator<S>[];
}
export declare function createForm<S extends SchemaShape>(schema: S, options?: FormOptions<S>): Form<S>;
