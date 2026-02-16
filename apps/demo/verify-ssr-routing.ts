import { JSDOM } from 'jsdom'

// 1. Setup Environment FIRST
const dom = new JSDOM('', { url: 'https://example.com/' })
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

// 2. Import App (after globals are set)
const { AppLayout } = await import('./src/App')
const { createRouter } = await import('@rxjs-spa/router')
const { renderToString } = await import('@rxjs-spa/ssr')
const { globalStore } = await import('./src/store/global.store')

async function verifyRoute(url: string, expectedContent: string) {
    // Pass only path+search to router
    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url
    console.log(`\nVerifying route: ${url} -> path: ${path}`)

    const router = createRouter({
        '/': 'home',
        '/users': 'users',
        '/users/:id': 'user-detail',
        '/contact': 'contact',
        '/login': 'login',
        '*': 'not-found',
    } as const, { initialUrl: path })

    // Instantiate App Template
    const template = AppLayout({ router })

    // Render to string
    const htmlOutput = await renderToString(template)

    if (htmlOutput.includes(expectedContent)) {
        console.log(`✅ Success: Found "${expectedContent}"`)
    } else {
        console.error(`❌ Failure: Did not find "${expectedContent}"`)
        // Only log length to keep it clean (we have logging in ssr package now)
        console.log(`Output Length: ${htmlOutput.length}`)
        process.exit(1)
    }
}

// Run verifications
(async () => {
    try {
        // 1. Home (Public)
        await verifyRoute('https://example.com/', 'Welcome to rxjs-spa')

        // 2. Login
        console.log('\nSimulating Login...')
        globalStore.dispatch({
            type: 'LOGIN_SUCCESS',
            user: { id: 1, email: 'test@example.com', token: 'mock' }
        })

        // 3. Users (Protected)
        // Should show "Users" header
        await verifyRoute('https://example.com/users', 'Users')

        // 4. Not Found (Public)
        await verifyRoute('https://example.com/does-not-exist', '404')

        console.log('\nAll SSR verifications passed!')
        process.exit(0)
    } catch (e) {
        console.error(e)
        process.exit(1)
    }
})()
