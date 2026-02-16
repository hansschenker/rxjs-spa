import { JSDOM } from 'jsdom'
import { BehaviorSubject } from 'rxjs'

// 1. Setup Environment
const dom = new JSDOM('<!DOCTYPE html><div id="app"><!-- SSR Content --></div>', {
    url: 'https://example.com/'
})
global.window = dom.window as any
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.Node = dom.window.Node
global.Text = dom.window.Text
global.localStorage = dom.window.localStorage
global.sessionStorage = dom.window.sessionStorage
global.fetch = (() => Promise.resolve({
    json: () => Promise.resolve([]),
    ok: true,
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
})) as any

// Mock RequestAnimationFrame for some async schedulers if needed
global.requestAnimationFrame = (cb) => setTimeout(cb, 0)

// 2. Import Modules
const { AppLayout } = await import('./src/App')
const { createRouter } = await import('@rxjs-spa/router')
const { renderToString } = await import('@rxjs-spa/ssr')
const { hydrate } = await import('@rxjs-spa/dom')

async function verifyHydration() {
    console.log('1. Rendering SSR HTML...')
    const router = createRouter({
        '/': 'home',
        '*': 'not-found'
    } as const, { initialUrl: '/' })

    const ssrTemplate = AppLayout({ router })
    const ssrHtml = await renderToString(ssrTemplate)

    // Inject into DOM
    const appEl = document.getElementById('app')!
    appEl.innerHTML = ssrHtml

    console.log('   SSR HTML injected. Length:', appEl.innerHTML.length)
    if (!appEl.innerHTML.includes('Welcome to rxjs-spa')) {
        throw new Error('SSR Rendering failed in verification script')
    }

    // 3. Hydrate
    console.log('2. Hydrating...')
    // We recreate the app structure (client-side)
    // Note: In real app, we'd use the same App() function. 
    // Here we reuse AppLayout.
    const clientTemplate = AppLayout({ router })

    // Capture innerHTML before hydration
    const beforeHydration = appEl.innerHTML

    // Perform Hydration
    // hydrate(root, template)
    hydrate(appEl, clientTemplate)

    // 4. Verify Content Preserved
    // Ideally, hydration shouldn't trash the DOM.
    // It should bind event listeners and update text nodes if strictly necessary 
    // (though if state matches, no text update should happen).

    // Check if key content still exists
    if (!appEl.innerHTML.includes('Welcome to rxjs-spa')) {
        console.error('❌ Failure: Content lost after hydration!')
        console.log('   Current HTML:', appEl.innerHTML)
        process.exit(1)
    }

    console.log('✅ Success: Content preserved after hydration.')

    // 5. Test Interactivity (Optional deep verification)
    // For now, content preservation is the main check for "Logic is hooked up".

    process.exit(0)
}

verifyHydration().catch(e => {
    console.error(e)
    process.exit(1)
})
