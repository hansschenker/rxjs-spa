import {
    Observable,
    firstValueFrom,
    isObservable,
    of,
    lastValueFrom,
    take,
} from 'rxjs'
import type {
    TemplateResult,
    ListBinding,
    ConditionalBinding,
    UnsafeHtmlValue,
} from '@rxjs-spa/dom'
import { prepareTemplate } from '@rxjs-spa/dom'

/**
 * renderToString(template)
 *
 * Renders a TemplateResult from @rxjs-spa/dom to a valid HTML string.
 * - Resolves all Observables to their *first* emitted value.
 * - Escapes values by default (same as browser).
 * - Recursively renders nested templates/lists/conditionals.
 */
export async function renderToString(template: TemplateResult): Promise<string> {
    const { strings, values } = template
    const prepared = prepareTemplate(strings)
    const markup = prepared.templateEl.innerHTML

    const parts = markup.split(/(<!--__RX_\d+__-->|__RX_\d+__)/)
    const chunks: string[] = []

    for (const part of parts) {
        const textMatch = part.match(/^<!--__RX_(\d+)__-->$/)
        if (textMatch) {
            const index = parseInt(textMatch[1], 10)
            chunks.push(part) // Keep marker
            const value = values[index]
            chunks.push(await resolveValue(value))
            // Add END marker so hydration knows what to remove
            chunks.push(`<!--__RX_${index}__END-->`)
            continue
        }

        const attrMatch = part.match(/^__RX_(\d+)__$/)
        if (attrMatch) {
            const index = parseInt(attrMatch[1], 10)
            const value = values[index]
            chunks.push(String(await resolveValue(value)))
            continue
        }

        chunks.push(part)
    }

    return chunks.join('')
}

async function resolveValue(value: unknown): Promise<string> {
    // 1. Unwrap Observable
    if (isObservable(value)) {
        // We take the first value.
        try {
            const v = await firstValueFrom(value.pipe(take(1)))
            return resolveValue(v)
        } catch (e) {
            // Empty observable
            return ''
        }
    }

    // 2. Arrays (render each item and join)
    if (Array.isArray(value)) {
        const items = await Promise.all(value.map(resolveValue))
        return items.join('')
    }

    // 3. Null/Undefined -> empty string
    if (value === null || value === undefined) {
        return ''
    }

    // 4. TemplateResult (Recursive)
    if (isTemplateResult(value)) {
        return renderToString(value)
    }

    // 5. Directives (Object wrappers)
    if (typeof value === 'object') {
        if (isUnsafeHtml(value)) {
            const inner = value.value
            // Recursive in case inner is Observable<string>
            return resolveValue(inner)
        }

        if (isConditional(value)) {
            const show = await firstValueFrom(value.condition$.pipe(take(1)))
            if (show) {
                return renderToString(value.thenFn())
            } else if (value.elseFn) {
                return renderToString(value.elseFn())
            }
            return ''
        }

        if (isListBinding(value)) {
            const items = await firstValueFrom(value.items$.pipe(take(1)))
            const renderedItems = await Promise.all(
                items.map(async (item, i) => {
                    const key = value.keyFn(item, i)
                    const item$ = of(item) // Create static observable for the item
                    const tmpl = value.templateFn(item$, key)
                    return renderToString(tmpl)
                }),
            )
            return renderedItems.join('')
        }
    }

    // 6. Primitive -> escape HTML
    return escapeHtml(String(value))
}

// ---------------------------------------------------------------------------
// Utils (duplicated from dom/sinks, but kept minimal here)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

// ---------------------------------------------------------------------------
// Type Guards (duck typing to avoid importing runtime code from DOM)
// ---------------------------------------------------------------------------

function isTemplateResult(v: any): v is TemplateResult {
    return v && v.strings && Array.isArray(v.values)
}

function isUnsafeHtml(v: any): v is UnsafeHtmlValue {
    return v && v.__unsafeHtml === true
}

function isConditional(v: any): v is ConditionalBinding {
    return v && v.__conditional === true
}

function isListBinding(v: any): v is ListBinding<any> {
    return v && v.__list === true
}
