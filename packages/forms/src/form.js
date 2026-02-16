import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { distinctUntilChanged, map, scan, shareReplay, startWith } from 'rxjs/operators';
import { getInitialValues, validateAll, isFormValid, isGroupSchema, mergeWithCrossFieldErrors, } from './schema';
// ---------------------------------------------------------------------------
// Deep state helpers
// ---------------------------------------------------------------------------
function deepSet(obj, pathParts, value) {
    if (pathParts.length === 0)
        return value;
    if (pathParts.length === 1) {
        return { ...obj, [pathParts[0]]: value };
    }
    const [head, ...rest] = pathParts;
    return { ...obj, [head]: deepSet(obj[head], rest, value) };
}
function deepGet(obj, pathParts) {
    let current = obj;
    for (const part of pathParts) {
        if (current === null || current === undefined)
            return undefined;
        current = current[part];
    }
    return current;
}
function parsePath(path) {
    return path.split('.');
}
// ---------------------------------------------------------------------------
// formReducer
// ---------------------------------------------------------------------------
function makeInitialTouched(schema) {
    const touched = {};
    for (const key in schema) {
        const entry = schema[key];
        if (isGroupSchema(entry)) {
            touched[key] = makeInitialTouched(entry.shape);
        }
        else {
            touched[key] = false;
        }
    }
    return touched;
}
function makeTouchAll(schema) {
    const touched = {};
    for (const key in schema) {
        const entry = schema[key];
        if (isGroupSchema(entry)) {
            touched[key] = makeTouchAll(entry.shape);
        }
        else {
            touched[key] = true;
        }
    }
    return touched;
}
function formReducer(schema) {
    const initialValues = getInitialValues(schema);
    const initialTouched = makeInitialTouched(schema);
    return (state, action) => {
        switch (action.type) {
            case 'SET_VALUE':
                return {
                    ...state,
                    values: { ...state.values, [action.field]: action.value },
                };
            case 'SET_NESTED_VALUE': {
                const parts = parsePath(action.path);
                return {
                    ...state,
                    values: deepSet(state.values, parts, action.value),
                };
            }
            case 'TOUCH':
                return {
                    ...state,
                    touched: { ...state.touched, [action.field]: true },
                };
            case 'TOUCH_NESTED': {
                const parts = parsePath(action.path);
                return {
                    ...state,
                    touched: deepSet(state.touched, parts, true),
                };
            }
            case 'TOUCH_ALL':
                return { ...state, touched: makeTouchAll(schema) };
            case 'RESET':
                return {
                    values: { ...initialValues },
                    touched: { ...initialTouched },
                    submitting: false,
                    submitted: false,
                };
            case 'SUBMIT_START':
                return { ...state, submitting: true, submitted: false };
            case 'SUBMIT_END':
                return { ...state, submitting: false, submitted: true };
            default:
                return state;
        }
    };
}
// ---------------------------------------------------------------------------
// createFormGroup — internal factory for nested group access
// ---------------------------------------------------------------------------
function createFormGroup(schema, pathPrefix, parentValues$, parentErrors$, parentTouched$, initialValues, dispatchFn) {
    const values$ = parentValues$.pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)));
    const errors$ = parentErrors$.pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)));
    const touched$ = parentTouched$.pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)));
    const valid$ = errors$.pipe(map(isFormValid), distinctUntilChanged());
    return {
        values$,
        errors$,
        touched$,
        valid$,
        field(name) {
            const value$ = values$.pipe(map((v) => v[name]), distinctUntilChanged());
            const fieldEntry = schema[name];
            let error$;
            if (isGroupSchema(fieldEntry)) {
                // For group fields, error$ shows null if all nested pass, or first nested error
                error$ = errors$.pipe(map((e) => {
                    const groupErrors = e[name];
                    if (groupErrors && typeof groupErrors === 'object') {
                        return isFormValid({ [name]: groupErrors }) ? null : 'Group has errors';
                    }
                    return null;
                }), distinctUntilChanged());
            }
            else {
                error$ = errors$.pipe(map((e) => e[name]), distinctUntilChanged());
            }
            const fieldTouched$ = touched$.pipe(map((t) => {
                const val = t[name];
                return typeof val === 'boolean' ? val : false;
            }), distinctUntilChanged());
            const dirty$ = values$.pipe(map((v) => v[name] !== initialValues[name]), distinctUntilChanged());
            const showError$ = combineLatest([error$, fieldTouched$]).pipe(map(([error, touched]) => (touched ? error : null)), distinctUntilChanged());
            return { value$, error$, touched$: fieldTouched$, dirty$, showError$ };
        },
        setValue(name, value) {
            const fullPath = pathPrefix ? `${pathPrefix}.${name}` : name;
            dispatchFn({ type: 'SET_NESTED_VALUE', path: fullPath, value });
        },
        setTouched(name) {
            const fullPath = pathPrefix ? `${pathPrefix}.${name}` : name;
            dispatchFn({ type: 'TOUCH_NESTED', path: fullPath });
        },
        group(name) {
            const entry = schema[name];
            if (!isGroupSchema(entry)) {
                throw new Error(`Field "${name}" is not a group`);
            }
            const innerSchema = entry.shape;
            const innerValues$ = values$.pipe(map((v) => v[name]));
            const innerErrors$ = errors$.pipe(map((e) => e[name]));
            const innerTouched$ = touched$.pipe(map((t) => t[name]));
            const innerInitial = initialValues[name];
            const innerPath = pathPrefix ? `${pathPrefix}.${name}` : name;
            return createFormGroup(innerSchema, innerPath, innerValues$, innerErrors$, innerTouched$, innerInitial, dispatchFn);
        },
    };
}
// ---------------------------------------------------------------------------
// createForm
// ---------------------------------------------------------------------------
export function createForm(schema, options) {
    const initialValues = getInitialValues(schema);
    const initialTouched = makeInitialTouched(schema);
    const initialState = {
        values: initialValues,
        touched: initialTouched,
        submitting: false,
        submitted: false,
    };
    const actionsSubject = new Subject();
    const stateBs = new BehaviorSubject(initialState);
    const actions$ = actionsSubject.asObservable();
    const reducer = formReducer(schema);
    // Core pipeline: Subject → scan → startWith → shareReplay(1)
    const state$ = actionsSubject.pipe(scan(reducer, initialState), startWith(initialState), shareReplay({ bufferSize: 1, refCount: false }));
    // Keep synchronous snapshot in sync
    state$.subscribe((s) => stateBs.next(s));
    function dispatch(action) {
        actionsSubject.next(action);
    }
    function select(selector) {
        return state$.pipe(map(selector), distinctUntilChanged());
    }
    const values$ = select((s) => s.values);
    const touched$ = select((s) => s.touched);
    const submitting$ = select((s) => s.submitting);
    const errors$ = values$.pipe(map((values) => {
        const fieldErrors = validateAll(values, schema);
        if (options?.validators?.length) {
            return mergeWithCrossFieldErrors(fieldErrors, options.validators, values);
        }
        return fieldErrors;
    }), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)));
    const valid$ = errors$.pipe(map(isFormValid), distinctUntilChanged());
    return {
        values$,
        errors$,
        touched$,
        valid$,
        submitting$,
        actions$,
        field(name) {
            const value$ = values$.pipe(map((v) => v[name]), distinctUntilChanged());
            const fieldEntry = schema[name];
            let error$;
            if (isGroupSchema(fieldEntry)) {
                // For group fields, error$ summarizes nested validity
                error$ = errors$.pipe(map((e) => {
                    const groupErrors = e[name];
                    if (groupErrors && typeof groupErrors === 'object') {
                        return isFormValid({ [name]: groupErrors }) ? null : 'Group has errors';
                    }
                    return null;
                }), distinctUntilChanged());
            }
            else {
                error$ = errors$.pipe(map((e) => e[name]), distinctUntilChanged());
            }
            const fieldTouched$ = touched$.pipe(map((t) => {
                const val = t[name];
                return typeof val === 'boolean' ? val : false;
            }), distinctUntilChanged());
            const dirty$ = values$.pipe(map((v) => v[name] !== initialValues[name]), distinctUntilChanged());
            const showError$ = combineLatest([error$, fieldTouched$]).pipe(map(([error, touched]) => (touched ? error : null)), distinctUntilChanged());
            return { value$, error$, touched$: fieldTouched$, dirty$, showError$ };
        },
        setValue(name, value) {
            dispatch({ type: 'SET_VALUE', field: name, value });
        },
        setTouched(name) {
            dispatch({ type: 'TOUCH', field: name });
        },
        submit() {
            dispatch({ type: 'TOUCH_ALL' });
            dispatch({ type: 'SUBMIT_START' });
        },
        submitEnd(ok) {
            dispatch({ type: 'SUBMIT_END', ok });
        },
        reset() {
            dispatch({ type: 'RESET' });
        },
        getValues() {
            return stateBs.value.values;
        },
        getErrors() {
            const fieldErrors = validateAll(stateBs.value.values, schema);
            if (options?.validators?.length) {
                return mergeWithCrossFieldErrors(fieldErrors, options.validators, stateBs.value.values);
            }
            return fieldErrors;
        },
        isValid() {
            return isFormValid(this.getErrors());
        },
        group(name) {
            const entry = schema[name];
            if (!isGroupSchema(entry)) {
                throw new Error(`Field "${name}" is not a group`);
            }
            const innerSchema = entry.shape;
            const innerValues$ = values$.pipe(map((v) => v[name]));
            const innerErrors$ = errors$.pipe(map((e) => e[name]));
            const innerTouched$ = touched$.pipe(map((t) => t[name]));
            const innerInitial = initialValues[name];
            return createFormGroup(innerSchema, name, innerValues$, innerErrors$, innerTouched$, innerInitial, dispatch);
        },
    };
}
