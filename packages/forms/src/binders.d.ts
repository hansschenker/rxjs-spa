import { Observable, Subscription } from 'rxjs';
import type { SchemaShape } from './schema';
import type { FormAccessor } from './form';
export declare function bindInput<S extends SchemaShape, K extends keyof S>(input: HTMLInputElement | HTMLTextAreaElement, form: FormAccessor<S>, name: K): Subscription;
export declare function bindCheckbox<S extends SchemaShape, K extends keyof S>(input: HTMLInputElement, form: FormAccessor<S>, name: K): Subscription;
export declare function bindSelect<S extends SchemaShape, K extends keyof S>(select: HTMLSelectElement, form: FormAccessor<S>, name: K): Subscription;
export declare function bindError(el: HTMLElement, error$: Observable<string | null>): Subscription;
export declare function bindField<S extends SchemaShape, K extends keyof S>(container: HTMLElement, form: FormAccessor<S>, name: K): Subscription;
