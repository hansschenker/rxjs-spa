import { Subscription, fromEvent } from 'rxjs';
// ---------------------------------------------------------------------------
// bindInput — text / email / tel / textarea
// ---------------------------------------------------------------------------
export function bindInput(input, form, name) {
    const field = form.field(name);
    const sub = new Subscription();
    // value$ → input.value (one-way from store to DOM)
    sub.add(field.value$.subscribe((v) => {
        if (input.value !== String(v))
            input.value = String(v);
    }));
    // DOM input → setValue
    sub.add(fromEvent(input, 'input').subscribe(() => {
        form.setValue(name, input.value);
    }));
    // blur → setTouched
    sub.add(fromEvent(input, 'blur').subscribe(() => {
        form.setTouched(name);
    }));
    return sub;
}
// ---------------------------------------------------------------------------
// bindCheckbox
// ---------------------------------------------------------------------------
export function bindCheckbox(input, form, name) {
    const field = form.field(name);
    const sub = new Subscription();
    sub.add(field.value$.subscribe((v) => {
        input.checked = Boolean(v);
    }));
    sub.add(fromEvent(input, 'change').subscribe(() => {
        form.setValue(name, input.checked);
    }));
    sub.add(fromEvent(input, 'blur').subscribe(() => {
        form.setTouched(name);
    }));
    return sub;
}
// ---------------------------------------------------------------------------
// bindSelect
// ---------------------------------------------------------------------------
export function bindSelect(select, form, name) {
    const field = form.field(name);
    const sub = new Subscription();
    sub.add(field.value$.subscribe((v) => {
        if (select.value !== String(v))
            select.value = String(v);
    }));
    sub.add(fromEvent(select, 'change').subscribe(() => {
        form.setValue(name, select.value);
    }));
    sub.add(fromEvent(select, 'blur').subscribe(() => {
        form.setTouched(name);
    }));
    return sub;
}
// ---------------------------------------------------------------------------
// bindError — display error message in an element
// ---------------------------------------------------------------------------
export function bindError(el, error$) {
    return error$.subscribe((err) => {
        el.textContent = err ?? '';
        if (err) {
            el.classList.add('has-error');
        }
        else {
            el.classList.remove('has-error');
        }
    });
}
// ---------------------------------------------------------------------------
// bindField — convenience: bindInput + bindError for a container element
//
// Expects the container to have:
//   - An <input>, <textarea>, or <select> as a descendant
//   - An element with class `.field-error` for the error message
// ---------------------------------------------------------------------------
export function bindField(container, form, name) {
    const sub = new Subscription();
    const errorEl = container.querySelector('.field-error');
    const inputEl = container.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea');
    const checkboxEl = container.querySelector('input[type="checkbox"], input[type="radio"]');
    const selectEl = container.querySelector('select');
    if (inputEl)
        sub.add(bindInput(inputEl, form, name));
    if (checkboxEl)
        sub.add(bindCheckbox(checkboxEl, form, name));
    if (selectEl)
        sub.add(bindSelect(selectEl, form, name));
    if (errorEl) {
        const field = form.field(name);
        sub.add(bindError(errorEl, field.showError$));
    }
    return sub;
}
